# Organizer sending-domain authentication

When an Orkora organizer wants to send campaign emails from their own
domain (e.g. `hello@tech-summit.events` instead of the shared
`no-reply@orkora.events`), the domain must be authenticated with SPF,
DKIM, and DMARC. Without it, deliverability drops sharply (Gmail and
Outlook downrank or quarantine unauthenticated bulk mail) and the
DMARC alignment check fails outright.

This doc is the operator-and-organizer-facing runbook. The platform
domain `orkora.events` itself is already authenticated; this is about
the organizer's own.

## Why it matters

- **Inbox placement.** Authenticated mail lands in the inbox; the rest
  goes to spam / promotions / quarantine.
- **Reputation isolation.** A bad send from one organizer cannot tank
  the shared `orkora.events` sender reputation if the organizer is
  sending from their own domain.
- **Brand trust.** Recipients see the organizer's own domain in the
  From line, not Orkora's.
- **Compliance.** CAN-SPAM and the new EU eIDAS rules increasingly
  prefer (and in some cases require) authenticated senders for
  commercial mail.

## Records to publish

The organizer publishes these DNS records on their own domain. The
Orkora team helps interpret if needed; we cannot publish on their
behalf because we don't have access to their DNS.

Replace `<org-domain>` with the organizer's actual sending domain
(e.g. `tech-summit.events`).

### 1. SPF (TXT, root)

```
Host:  <org-domain>
Type:  TXT
Value: "v=spf1 include:spf.mtasv.net ~all"
```

`spf.mtasv.net` is Postmark's SPF include. `~all` is soft-fail, which
is the right setting while DMARC is in monitor mode; tighten to `-all`
once DMARC is enforcing.

If the organizer already has an SPF record (common — Google Workspace
or Microsoft 365 publish one), they merge the `include:spf.mtasv.net`
into the existing record. They do NOT publish two SPF TXT records;
many DNS validators reject that.

### 2. DKIM (TXT, Postmark-issued subdomain)

The organizer gives Orkora their domain. Orkora provisions a Postmark
Sender Signature for that domain, which returns a DKIM record. The
organizer then publishes:

```
Host:  <postmark-token>._domainkey.<org-domain>
Type:  TXT
Value: "k=rsa; p=<long-base64-public-key>"
```

The exact `<postmark-token>` and `<long-base64-public-key>` come from
the Postmark Sender Signature provisioning step.

### 3. DMARC (TXT, subdomain)

Start in monitor mode:

```
Host:  _dmarc.<org-domain>
Type:  TXT
Value: "v=DMARC1; p=none; rua=mailto:dmarc-reports@orkora.events; pct=100; aspf=r; adkim=r"
```

After 14 days of clean monitor reports, ratchet to `p=quarantine`,
then after another 14 days to `p=reject`. The `rua=` address routes
aggregate reports to Orkora so we can spot misconfiguration before
the organizer does.

### 4. Return-Path (CNAME, optional but recommended)

```
Host:  pm-bounces.<org-domain>
Type:  CNAME
Value: pm.mtasv.net
```

This gives Postmark a custom Return-Path under the organizer's
domain, which improves DMARC alignment further and means bounce
reports also use the org's domain.

## Operator procedure

1. Organizer requests custom sender domain via Orkora support (Slice D
   wires this into a self-service flow under
   `/dashboard/settings/sending-domain`).
2. Orkora ops:
   - Adds the organizer's domain to Postmark as a Sender Signature
   - Retrieves the SPF + DKIM + DMARC values
   - Sends them to the organizer with this runbook attached
3. Organizer publishes the records on their DNS.
4. Organizer notifies Orkora when published.
5. Orkora ops:
   - Verifies via `dig` (commands below)
   - Confirms Postmark Sender Signature status flips to "Verified"
   - Sets `OrganizationDomain` row in DB (Slice D schema) with
     verified=true so the campaigns composer allows From addresses on
     this domain
6. Organizer creates campaigns from `<anything>@<their-domain>` and
   sends.

## Verification commands

Run these against the organizer's domain before flipping verified=true.

```bash
# SPF
dig TXT <org-domain> +short | grep spf1

# DKIM (the postmark-token is in the Postmark Sender Signature page)
dig TXT <postmark-token>._domainkey.<org-domain> +short | grep p=

# DMARC
dig TXT _dmarc.<org-domain> +short

# End-to-end test: send a real email and read the headers
# Look for: spf=pass smtp.mailfrom=<org-domain>
# Look for: dkim=pass header.d=<org-domain>
# Look for: dmarc=pass policy.dmarc=none
```

Free third-party checks: mxtoolbox.com/spf, dmarcian.com,
mail-tester.com.

## What if the organizer can't / won't?

Default behaviour: campaigns send from the shared
`hello@orkora.events` sender. Deliverability is good (the shared
domain is fully authenticated) but the From line reads "Orkora,"
which some organizers don't want. We always honour their explicit
opt-out preference if they pick the shared sender.

## Touchpoint with CAMPAIGNS_SPEC.md

Slice A of the campaigns module accepts any `fromEmail` and trusts
the organizer to use an authenticated domain. Slice D adds:

- `organization_sending_domains` table (id, organizationId, domain,
  postmarkTokenId, verified, lastVerifiedAt)
- Self-service domain-verification wizard in the dashboard
- A guard in `campaigns.service.create()` that rejects a `fromEmail`
  whose domain is not verified for that org

Until Slice D ships, the campaigns composer's From-email field is
trusted; operators should manually verify that organizers are using
domains they actually control before approving large sends.
