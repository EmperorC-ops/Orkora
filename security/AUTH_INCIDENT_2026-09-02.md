# Auth incident: broken signup verification, and the account takeover behind it

Raised 2026-09-02 from a support signal: signup codes arrive by email and are
rejected as invalid, yet the same users can sign in anyway.

Both halves of that sentence are bugs. The first is a broken feature. The
second is a critical vulnerability, and it was the first one that exposed it.

---

## Summary

| | |
|---|---|
| **Severity** | Critical. Pre-auth account takeover of any email address that has ever registered for an Orkora event. |
| **Introduced** | Commit `6419afb`, 2026-08-18, "security: postmark fail-closed (M1), OTP log/purpose (M3/M4)...". The M4 hardening broke signup verification. |
| **Exposure window for the broken signup** | 2026-08-18 to the deploy of this fix. |
| **Exposure window for the takeover** | Longer. The missing login gate predates M4; M4 only made it visible by breaking the code users were meant to enter. |
| **Exploitation requires** | An email address, an unauthenticated POST to `/v1/auth/signup`, and an unauthenticated POST to `/v1/auth/login`. No code, no token, no session. |

---

## Bug 1: signup codes are always invalid

`AuthService.sendSignupOtpQuietly` mints the code with `purpose: 'signup'`:

```
apps/api/src/modules/auth/auth.service.ts
  await this.otp.send({ channel: 'email', destination: email, purpose: 'signup' });
```

`/v1/auth/otp/exchange`, the endpoint the web client is documented to call
next, discarded the client's purpose and forced `'login'`:

```
apps/api/src/modules/auth/auth.controller.ts   (before)
  await this.otp.verify({ ...dto, purpose: 'login' });
```

`OtpService.verify` filters on `purpose`, so it looked for a `login` row, found
none, and threw `Invalid or expired code`. The web client renders that 401 as
"That code is incorrect or expired." Every password signup since 2026-08-18
failed at verification.

The intent behind `purpose: 'login'` was correct and is worth keeping: a code
minted to confirm a payment must never be redeemable for a session. The
implementation was a single hardcoded purpose where an allowlist was needed.

**Fixed** by allowlisting the two purposes that are session-granting by
definition, and rejecting the two that are not:

```
const SESSION_GRANTING_OTP_PURPOSES = ['signup', 'login'] as const;
```

`signup` and `login` carry identical privilege: both are delivered only to the
address being authenticated and both authorise a session for that same
address. `payment_confirm` and `phone_verify` remain rejected, before the code
is even checked, so a valid payment code is never consumed by an exchange
attempt.

---

## Bug 2: password login never checked email verification

This is the one that matters.

`AuthService.login` verified the password and issued tokens. It never looked at
`users.email_verified`. That single omission turns two otherwise-reasonable
behaviours into a takeover chain:

**Step 1.** `RegistrationsService.resolveUser` creates a user row for anyone
who registers for an event:

```
apps/api/src/modules/registrations/registrations.service.ts
  return this.prisma.user.create({
    data: { email: normalized, fullName: provided, phone, emailVerified: false, locale: 'en-NG' },
  });
```

No password. `email_verified = false`. That row owns their tickets.

**Step 2.** An attacker POSTs `/v1/auth/signup` with that email and any
password. `signupRequest` sees an unverified row, reads it as an abandoned
signup, and writes the attacker's password hash and display name onto it. This
branch is the intended "I started signup on another device" recovery path and
cannot tell the two cases apart.

**Step 3.** The attacker POSTs `/v1/auth/login` with the password they just
set. Without the verification gate, they get a session as the victim: their
tickets, their registrations, and any org memberships on that account.

The OTP never entered the flow. Email verification was decorative.

**Fixed** with a gate placed after the argon2 check, so it leaks nothing a
caller who already knows the password does not know:

```
if (!user.emailVerified) {
  await this.sendSignupOtpQuietly(emailLower);
  throw new EmailVerificationRequiredException(emailLower);
}
```

It sends a fresh code on the way out and returns `403` with
`code: 'email_verification_required'` plus the destination, so the client can
route the user to the OTP screen rather than showing "wrong password" to
someone who typed the right one. The non-enumeration property of
`/auth/signup` is untouched.

**Also tightened:** `signupRequest`'s recovery branch no longer overwrites a
display name or phone that the account already has. It sets the password
(harmless now that the account is unusable until verified) and fills blanks
only, mirroring the discipline `registrations.service` already applies when it
backfills a name. A stranger can no longer rewrite the name on a ticket
holder's record. It logs a warning whenever a password is set on a passwordless
account, so probing across many addresses is visible.

**Removed:** the dead `AuthService.signup()` method, which bypassed
verification entirely and returned a token bundle directly. Nothing called it.
Leaving it in the service was a loaded gun.

---

## Run these against production before deploying

### 1. Was the takeover ever exploited

The signature is an account that has logged in without ever verifying. Under
the old code that was possible; under the new code it is not.

```sql
select id, email, created_at, last_login_at
from users
where email_verified = false
  and last_login_at is not null
order by last_login_at desc;
```

**Any row here is a session that was established without proving control of
the email address.** Cross-check each against whether that person also holds
tickets:

```sql
select u.id, u.email, u.created_at, u.last_login_at,
       count(r.id) as registrations,
       min(r.created_at) as first_registration
from users u
left join registrations r on r.user_id = u.id
where u.email_verified = false
  and u.last_login_at is not null
group by u.id
order by registrations desc, u.last_login_at desc;
```

A row where `first_registration` predates `created_at`-adjacent signup activity
is the exact shape of step 2. Investigate those first.

### 2. How many real users the gate will affect

These are people who will be sent to the OTP screen on their next login. Expect
a burst of verification emails on deploy.

```sql
select count(*) filter (where password_hash is not null) as will_hit_the_gate,
       count(*) filter (where password_hash is null)     as attendees_unaffected,
       count(*) filter (where password_hash is not null
                          and created_at >= timestamptz '2026-08-18') as broken_since_m4
from users
where email_verified = false;
```

`broken_since_m4` is the population created during the window when signup
verification could not succeed. Every one of them is a user who tried to sign
up and was told their code was wrong. They are the ones to email.

### 3. Sanity check that no verified account regresses

```sql
select count(*) from users where email_verified = true and password_hash is not null;
```

These are unaffected and must stay able to log in. Spot-check one after deploy.

---

## Deploy order and blast radius

1. Deploy the API and web together. The API change alone would show verified
   users nothing new but would show unverified password users a raw 403; the
   web change is what turns that into the OTP redirect.
2. No migration. No schema change. Nothing to backfill.
3. Rollback is a straight revert; nothing is written that the old code cannot
   read.

**Expected support volume on deploy:** every account in `will_hit_the_gate`
gets one verification email the next time they log in, and lands on the OTP
screen with a working code. That is the intended remediation path and it is
self-service. It is also, for the `broken_since_m4` cohort, the first time the
code they receive will actually work.

Consider getting ahead of it with a short note to that cohort: their signup
code failing was a bug on our side, it is fixed, and signing in will send them
a fresh one.

---

## Why this was not caught

Worth recording, because the same shape will recur.

- **The two bugs masked each other.** Broken verification produced complaints;
  working login made those complaints look cosmetic rather than blocking.
  Nobody chased the code because the users got in anyway. That is precisely
  the symptom of a missing gate.
- **M4 was tested for the property it added, not the flow it broke.** The
  hardening correctly prevented purpose confusion. No test asserted that a
  signup code still works, because no test covered signup end to end through
  the exchange endpoint. `otp-exchange-purpose.spec.ts` now asserts both
  halves in the same file, so neither can be traded for the other again.
- **`email_verified` had no enforcement anywhere.** A column that is written
  but never read is not a control. Worth a sweep for others.

## Tests added

- `apps/api/src/modules/auth/otp-exchange-purpose.spec.ts`: `signup` and
  `login` exchange and verify against their own purpose; `payment_confirm` and
  `phone_verify` are rejected before the code is checked.
- `apps/api/src/modules/auth/email-verification-gate.spec.ts`: verified login
  succeeds; unverified login is refused with the 403 code and mints no refresh
  token; a fresh code is sent; the lockout ledger is cleared before the gate;
  a wrong password still returns a plain 401 without firing the gate; the
  display name on an attendee row survives a stranger's signup; and a full
  regression test walking the three-step takeover chain to its new dead end.
