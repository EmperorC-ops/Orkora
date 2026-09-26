# Orkora Workflow

Audience: the WMXKED organizing team (Transformational Leadership 2026) and anyone
setting up or running an event on Orkora.

This guide walks through the platform in the order an organizer actually uses it:
registration, event setup and management, Story Mode, and Brand Home. The attendee
(guest) workflow is covered last, so you can see the whole organizer side first and
then follow what a guest experiences.

Two addresses are worth knowing up front:

- The organizer dashboard lives under `/dashboard`.
- Every public event has a short code (WMXKED is one) and a shareable link at
  `orkora.events/e/WMXKED`.

---

## 1. Registration

Registration is how a guest turns interest into a ticket. Orkora supports three
paths into the same registrations list: the standard form, custom questions, and
the new VIP express link.

### The standard registration form

From the public event page a guest taps Register and lands on
`orkora.events/e/WMXKED/register`. They pick a ticket tier, enter attendee
details (name, email, optional phone), answer any custom questions, and confirm.
Free tickets are issued immediately and the ticket plus receipt are emailed. Paid
tickets move to checkout first and are confirmed once payment clears.

### Custom questions (per event)

WMXKED is a niche event, so it needs specifics at registration that a birthday
party would not. You control those questions per event, not globally. In the event
editor there is a "Registration form" section where you add questions (short text,
long text, number, dropdown, multi-select, or a checkbox), mark each required or
optional, and save. Those questions then appear on the register page for that one
event, and the answers are stored against each registration.

For WMXKED specifically, the hardcoded intro heading ("A few questions" and "The
organizer asked for these details") has been switched off using the per-event
"Hide the intro heading" toggle, so the form shows only your own questions.

### The tickets-remaining countdown

To nudge people who are still deciding, the public event page and the register page
now show how many tickets are left. When any tier has a fixed quantity, the count
of remaining seats appears as a small "N tickets left" marker on the public page and
as an amber "Only N tickets remaining" banner on the register page. If everything is
sold out it reads "This event is sold out". The count is the sum of remaining seats
across all tiers that have a set quantity; tiers with unlimited capacity are not
counted, and if no tier has a limit the marker does not show at all.

### The VIP express link

Some guests should not have to fill the long form. The VIP express link is a
private, shareable link that lets a VIP register with name and email only, skipping
your custom questions, and get their ticket instantly.

How to create it: open the event in the dashboard, find the "VIP express link"
panel, and press Generate VIP link. Copy the link and send it to your VIP guests
however you like (email, WhatsApp, a printed QR, and so on). The link looks like
`orkora.events/e/WMXKED/vip?t=...` where the trailing part is a private token.

Notes on how it behaves:

- It is one shared link per event. Everyone you send it to uses the same link.
- Regenerate mints a fresh link and stops the old one from working, which is useful
  if a link was shared too widely. Remove link turns VIP registration off entirely.
- VIP guests are given a free ticket, so the event needs at least one free ticket
  tier for the link to work. If there is no free tier, the VIP page shows a clear
  message rather than charging anyone.
- Every VIP registration lands in the same registrations list as everyone else,
  tagged VIP, so you never have to reconcile a separate spreadsheet.

### Where the registration data lives, and how to export it

All registrations for an event, from every path above, appear on the event's
Registrations page: from the dashboard open the event, then Registrations (or go to
`/dashboard/events/<event>/registrations`). That page lists each attendee with
their tier, ticket count, status, when they registered, their answers to your
custom questions, and a VIP tag where it applies. You can filter by status and
search by name or email.

To export, press the "Export CSV" button on that Registrations page. The CSV
includes name, email, status, a VIP column (Yes or No), tier, the registration
timestamp, and one column per custom question. That file opens in Excel or Google
Sheets.

There is also an org-wide registrations view under `/dashboard/registrations`
("Across every event") that lists registrations from all your events in one place,
with filters by status and by event. It has its own "Export CSV" button that
exports every registration matching the current filters (name, email, event, event
code, status, tier, and the registration timestamp). Use the per-event export when
you want the custom-question answers and the VIP column; use the org-wide export
when you want everything across events in one file.

---

## 2. Event setup and management

This is the organizer's home base for a single event.

Creating an event: from `/dashboard/events` create a new event with its title,
description, type, timezone, and start and end times.

Editing after publishing: you can edit a published event. Open it, and the "Event
details" section lets you change the title, description, type, timezone, and the
start and end dates and times. You do not have to unpublish to make a change. (An
archived event is read only.)

The event editor is where you manage everything about the event in one place:

- Banner image, shown on the event card, the public page, the share preview, and
  the Story hero.
- Ticket tiers (Free, Standard, VIP, and so on), including group tickets that
  require a minimum number of people per order. Setting a quantity on a tier is
  what powers the tickets-remaining countdown described above.
- The registration form (custom questions) and the VIP express link, both covered
  in section 1.
- Discovery details (category and city) that help people find the event through
  search.
- Tracks, sessions, and speakers for the agenda.

Running the event: alongside the editor you have Story Mode, Registrations,
Check-in, Analytics, Feedback, Discounts, Recordings, and Live. Publish and
Unpublish control whether the public can see and register, and "Copy share link"
gives you the `orkora.events/e/WMXKED` URL to send out.

---

## 3. Story Mode

Story Mode is the immersive, scroll-through version of the public event page. Where
the classic page is a compact summary, Story Mode is built to sell the experience:
a full hero, then a sequence of blocks (your narrative, speakers, agenda, tickets,
and more) that a visitor scrolls through top to bottom.

You compose it from the event editor by opening Story Mode, arranging the blocks,
and publishing when ready. Once published, visitors to `orkora.events/e/WMXKED` see
the Story version. A floating "Get tickets" button follows the reader as they
scroll and, when a tier has limited seats, shows the remaining count next to it
(for example "Get tickets, 12 left"), so the urgency signal is present in Story Mode
too. The Tickets block is always present in the flow, and the floating button is the
always-accessible shortcut to it.

The event banner runs behind the Story hero as a background, so the image you set on
the event carries through to the shareable Story page rather than disappearing.

---

## 4. Brand Home

Brand Home is your organization's public page: `orkora.events/o/<your-slug>`. It is
the home that ties all your events together under one identity, so a guest who
arrives from one event can find the rest.

You compose it from `/dashboard/branding` ("Compose your brand home"). There you set
your brand colour, surface (background) colour, logo, and social links, and the
public Brand Home page renders in that style. The Branding page also shows Brand
Home views and where that traffic is coming from, so you can see how much the page
is doing for you.

Because your brand colour and logo live here, they also flow into event pages,
tickets, and share cards, which is what keeps everything looking like one brand
rather than a set of unrelated links.

---

## 5. The attendee (guest) workflow

This is what a guest experiences, end to end. Everything above exists to make this
path smooth.

1. The guest arrives at the event, usually from a link you shared:
   `orkora.events/e/WMXKED`. They see the event page (classic or Story Mode,
   depending on what you published), with the banner, the key details, the ticket
   options, and, when seats are limited, how many tickets remain.

2. They choose how to register:
   - Standard guests tap Register, pick a ticket tier, enter their details, answer
     your custom questions, and confirm.
   - VIP guests who received the VIP express link open it and enter only their name
     and email. They skip the ticket picker and the questions.

3. They confirm. A free or VIP ticket is issued immediately; a paid ticket goes
   through checkout first and is confirmed once payment succeeds.

4. They receive their ticket and receipt by email, and can open the ticket page to
   see the QR code used at check-in. They can also share a "I am going" card that
   carries your event branding.

5. On the day, your team runs Check-in from the dashboard, scanning the QR code (or
   entering the short ticket code by hand when no camera is available).

Behind all of this, whichever path the guest took, their registration appears on the
event's Registrations page in real time, tagged VIP where it applies, ready to view,
filter, search, and export to CSV.

---

## Quick reference

- Public event page: `orkora.events/e/WMXKED`
- Register (standard): `orkora.events/e/WMXKED/register`
- VIP express link: `orkora.events/e/WMXKED/vip?t=...` (generated in the event editor)
- Brand Home (public): `orkora.events/o/<your-slug>`
- Event editor: `/dashboard/events/<event>`
- Registrations and CSV export (per event): `/dashboard/events/<event>/registrations`
- Registrations and CSV export (all events): `/dashboard/registrations`
- Compose Brand Home: `/dashboard/branding`
