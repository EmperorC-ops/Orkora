# Live Second-Screen: design and Part A implementation

## The problem

Participants are meant to follow a live event from their phones: read along, ask
questions, upvote them, vote in polls, and see what the organizer shares during
the event. The engagement surface for most of that already exists, but a person
who registers only ever receives a ticket QR. There is no path from what they
hold to the live room, and even if they find the room they cannot get in.

## Current state (verified in code)

The room and its real-time backend are built:

- Live page: `apps/web/app/(public)/e/[code]/live/page.tsx` renders chat, polls,
  and Q&A with upvotes, over a websocket.
- Gateway: `apps/api/src/modules/engagement/engagement.gateway.ts` handles
  `chat:join`, `chat:message`, `poll:vote`, `qa:ask`, `qa:upvote`, and the
  organizer-only `qa:answer`, broadcasting per event room.
- Service + REST: `engagement.service.ts` and `engagement.controller.ts`. The
  read endpoints (`GET events/:eventId/engagement/chat|polls|questions`) are
  public and used to bootstrap the page.

Three gaps stop a participant reaching it:

1. No entry point. The only link to `/e/[code]/live` on the attendee side is on
   the public event page, and it is generated only for virtual or hybrid events
   (`page.tsx:306`, `event.kind === 'physical' ? null : ...`). In-person events
   link to it from nowhere. The ticket page (`/t/[code]`), the confirmation
   email, and My Tickets contain no link to it.
2. Auth wall. The room requires a signed-in user; with no token the page shows
   "Sign in to join the live room" and redirects to `/login`
   (`live/page.tsx:184-200`), and the gateway rejects a socket without a valid
   JWT (`engagement.gateway.ts:67-82`). Registration never issues a session,
   password, or magic link, so a normal registrant has no account to sign in
   with, and the ticket they hold is not accepted as a credential.
3. No organizer broadcast. The room has chat, polls, and Q&A only. There is no
   surface for the organizer to push an announcement, link, or video to every
   participant's phone during the event. Recordings live on a separate
   `/e/[code]/watch` page and are not pushed live.

## Part A: make the ticket the key, and give it a door (this change)

Goal: a registrant can open the live room straight from their ticket, with no
login, and participate (chat, ask, upvote, vote). The QR they already hold
becomes the credential.

### Auth model

The ticket `code` (unique, random, already the credential for the public
`/t/[code]` read and for recordings gating) becomes an accepted room credential
alongside the existing JWT. A ticket resolves to its registrant user and event:

- `EngagementService.resolveTicketParticipant(code)` looks up the ticket, and
  returns `{ userId, eventId }` when the ticket is valid (status `issued` or
  `checked_in`) and belongs to an event. `pending`, `cancelled`, and `void`
  tickets are rejected. (Ticket lifecycle per `schema.prisma` Ticket.status.)

Gateway (`handleConnection`):

- If `auth.token` is present, keep the existing JWT path (logged-in users and
  organizers). `data.viaTicket = false`.
- Else if `auth.ticket` is present, resolve it with
  `resolveTicketParticipant`, set `data.userId` to the registrant's user id,
  `data.viaTicket = true`, and `data.ticketEventId` to the ticket's event.
- Else reject as today.

Authorization stays least-privilege:

- Ticket sockets get participant actions only. `qa:answer` (organizer reply) is
  rejected for `viaTicket` sockets up front, in addition to the existing
  `assertEventOrganizer` service check (a registrant is not an org member, so it
  would fail regardless).
- Ticket sockets are event-scoped: every participant action
  (`chat:join/message`, `poll:vote`, `qa:ask/upvote`) verifies `data.eventId`
  equals the ticket's `ticketEventId`, so a ticket for event A cannot act in
  event B. JWT sockets keep today's behavior unchanged.

The public REST reads stay public and unchanged, so the page still bootstraps
recent messages and polls before the socket joins. Only writes require a
credential, which is what the ticket now provides.

### Web

- Live page accepts a ticket code in the URL, `/e/[code]/live?t=<ticketCode>`.
  When `t` is present it connects the socket with `auth: { ticket }` and skips
  the sign-in gate. When it is absent it falls back to the signed-in token path
  (organizers, logged-in users) and, failing that, the existing sign-in gate.
- Entry points that carry the ticket code:
  - Ticket page `/t/[code]`: a prominent "Follow the event live" button to
    `/e/<eventCode>/live?t=<ticketCode>`.
  - Confirmation email (`templates.ts`): a "Follow the event live from your
    phone" button to the same URL. This needs the event code passed into the
    template (added to the three send sites: free register, VIP, paid).
  - My Tickets (`/me/tickets`): a per-ticket "Follow live" link.
- Public event page: surface the live link for every event kind, not just
  virtual/hybrid, so an in-person second screen is reachable
  (`page.tsx` liveHref).

### Security notes

- The ticket code is a bearer credential, consistent with `/t/[code]` and
  recordings. It is random and unguessable. Someone the holder shares the code
  with can participate as that registrant, which is the same trust boundary as
  the ticket page itself.
- Organizer capabilities remain JWT + RolesGuard only; ticket auth never grants
  them.
- Invalid, cancelled, void, or wrong-event tickets are rejected at connect.

### Edge cases

- Event not yet started or already ended: the room still opens; the page shows
  its normal pre/post states. Gating the room by time is out of scope here.
- A logged-in organizer visiting with no `?t` uses the JWT path and retains
  organizer actions.
- A public visitor with neither token nor ticket sees the existing sign-in gate.

### Tests

- Unit: `resolveTicketParticipant` returns the user/event for an `issued` and a
  `checked_in` ticket, and throws for `pending`, `cancelled`, `void`, unknown
  code.
- Existing gateway behavior for JWT sockets is unchanged.

### Effort

Roughly three to five days including tests and manual verification.

## Part B: organizer broadcast / "on screen now" (scoped, not in this change)

The missing feature: let the organizer push a spotlight item, a text
announcement, a link, or an embedded video, that appears at the top of every
participant's live page in real time.

- Data: a lightweight "live spotlight" record per event (type: announcement |
  link | video, payload, active flag, timestamps). One active item at a time.
- Organizer control: on the dashboard live page, set or clear the current
  spotlight.
- Realtime: a new gateway event (e.g. `spotlight:update`) broadcast to the event
  room; the participant live page renders it above chat/polls/Q&A.
- Video: reuse the existing YouTube/embed URL parsing already used by the
  recordings `/watch` page.

Effort: roughly four to six days. Recommended after Part A, since Part A is what
makes the room reachable in the first place.
