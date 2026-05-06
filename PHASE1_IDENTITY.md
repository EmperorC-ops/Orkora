# Phase 1: Identity

This phase delivers production-shaped sign in, sign up, OTP, social login, and member invitations. It is wired through the API, the mobile app (Expo), and the web app (Next.js), with shared schemas and a typed SDK.

## What you can do now

End users can:

1. Sign up with email and password. The API sends a 6-digit code via Postmark (or a console fallback in dev) and creates the account on OTP verification.
2. Sign in with email and password. Falls back to a code-based sign in if a password is forgotten.
3. Sign in with Google or Apple. The API verifies the provider ID token, finds or creates the matching user, and issues our own JWT bundle.
4. Receive an OTP via SMS for phone verification. Termii is the default African SMS provider; Twilio is used elsewhere when its keys are present.

Organization owners and admins can:

5. Invite teammates by email with a chosen role (admin, organizer, staff, vendor). The invitation email contains a single-use, 14-day, peppered-hash token.
6. List or revoke pending invitations.
7. Accept an invitation (creates a membership at the invited role).

## Files added or changed

API
- `apps/api/src/modules/auth/dto/social.dto.ts`
- `apps/api/src/modules/auth/dto/otp.dto.ts`
- `apps/api/src/modules/auth/otp.service.ts`
- `apps/api/src/modules/auth/verifiers/social.ts` (Google + Apple ID token verifiers)
- `apps/api/src/modules/auth/auth.controller.ts` (added /social, /otp/send, /otp/verify)
- `apps/api/src/modules/auth/auth.service.ts` (added social method)
- `apps/api/src/modules/auth/auth.module.ts` (provides OtpService and verifiers, imports NotificationsModule)
- `apps/api/src/modules/notifications/{notifications.module,service,templates}.ts`
- `apps/api/src/modules/notifications/providers/{email,sms}.ts` (Postmark, Termii, Twilio, console fallbacks)
- `apps/api/src/modules/invites/{invites.module,controller,service}.ts`
- `apps/api/src/common/decorators/roles.decorator.ts`
- `apps/api/src/common/guards/roles.guard.ts`
- `apps/api/src/config/env.schema.ts` (added GOOGLE_OAUTH_CLIENT_ID, APPLE_OAUTH_CLIENT_ID)
- `apps/api/src/app.module.ts` (added NotificationsModule, InvitesModule)
- `apps/api/.env.example` (added notification + social keys)
- `apps/api/prisma/schema.prisma` (added Invitation model)
- `schema.sql` (added invitations table)

Shared
- `packages/contracts/src/index.ts` (added OtpChannel, OtpPurpose, SendOtpInput, VerifyOtpInput, SocialProvider, SocialLoginInput)
- `packages/sdk/src/index.ts` (added auth.social, auth.sendOtp, auth.verifyOtp, auth.logout)

Mobile
- `apps/mobile/app/(auth)/_layout.tsx`
- `apps/mobile/app/(auth)/signup.tsx`
- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/app/(auth)/otp.tsx`
- `apps/mobile/src/api/client.ts` (added authApi, persistTokens, clearTokens)
- `apps/mobile/src/theme/tokens.ts` (added missing slate shades)

Web
- `apps/web/lib/auth.ts`
- `apps/web/app/(auth)/login/page.tsx` (rewritten to use typed helper, added magic-code button)
- `apps/web/app/(auth)/signup/page.tsx`
- `apps/web/app/(auth)/otp/page.tsx`

## Endpoints

```
POST /v1/auth/signup        (email + password)
POST /v1/auth/login         (email + password)
POST /v1/auth/social        ({ provider: 'google' | 'apple', idToken })
POST /v1/auth/refresh       (refreshToken rotation)
POST /v1/auth/logout        (revokes all refresh tokens for caller)
POST /v1/auth/otp/send      (channel: email | sms, destination, purpose)
POST /v1/auth/otp/verify    (destination, code, purpose)

POST   /v1/organizations/:orgId/invitations
GET    /v1/organizations/:orgId/invitations
DELETE /v1/organizations/:orgId/invitations/:invitationId
POST   /v1/invitations/accept
```

The invite endpoints sit behind `RolesGuard`. Owner and admin can create or revoke; owner, admin, and organizer can list. Acceptance only requires authentication and an email match.

## Security notes

- OTP codes are stored as `sha256(code + REFRESH_TOKEN_PEPPER)`. Plaintext codes never touch the database.
- Invitations use `sha256(token + pepper)` with the plaintext token only sent in the email.
- OTP send is throttled to 5 requests per minute per IP at the controller, plus a 30-second cooldown per (destination, purpose) at the service layer, plus a 5-attempt limit per code at verify time.
- Social verification: Google calls the tokeninfo endpoint and validates issuer + audience. Apple decodes the JWT payload and validates issuer, audience, and expiry. Apple JWK signature verification is the next hardening step (use `jose` with cached keys).
- Refresh tokens rotate on every successful refresh. The presented token is revoked and a new pair is issued.

## Provider strategy

If `POSTMARK_TOKEN` is set, email goes through Postmark. Otherwise it logs to stdout, which is enough to copy a code during local development.

If `TERMII_API_KEY` is set, SMS goes through Termii (best deliverability inside Nigeria and most of West Africa). Otherwise we try `TWILIO_SID + TWILIO_AUTH_TOKEN`. Otherwise it logs to stdout.

Adding a provider (e.g., MTN's API in South Africa) is a single new file under `apps/api/src/modules/notifications/providers/` plus one branch in the factory in `notifications.module.ts`.

## What is intentionally not in this phase

- Apple JWK signature verification (using `jose`). The current decode-and-trust path is fine for an internal preview but should be hardened before public release.
- A dedicated `/auth/login-otp` endpoint that exchanges a verified code for tokens without a password. The mobile and web OTP screens already accommodate this; the server-side endpoint is a follow-up.
- A `social_accounts` table that lets a single user link multiple providers. The current code matches by verified email, which covers the common case.
- httpOnly cookie storage for the web refresh token. Tokens are in `sessionStorage` for now.

## Verification

29 TypeScript and TSX files transpile cleanly under strict settings (decorators on, JSX react-jsx, ES2022). All 19 JSON config files parse. The Prisma schema and SQL schema both include the new `invitations` table.
