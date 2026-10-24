/**
 * Organizer help, served by the API so each section reaches only the roles
 * that need it. The public help page (apps/web/help/public.md) covers what
 * anyone may read; everything here is for signed-in team members.
 *
 * minRole uses the organization role hierarchy (staff < organizer < admin <
 * owner). A section is returned when the caller's role is at or above it.
 *
 * Body format: the small Markdown subset rendered by apps/web/lib/help-markdown:
 * paragraphs, **bold**, `code`, [links](/path), "- " lists, "1. " lists and
 * pipe tables. Keep answers in user terms: no limits, internals or mechanics
 * that would help someone probe the platform.
 */

export type HelpMinRole = 'staff' | 'organizer' | 'admin';

export interface HelpSection {
  id: string;
  title: string;
  minRole: HelpMinRole;
  body: string;
}

export const HELP_SECTIONS: HelpSection[] = [
  // ---------------------------------------------------------------- staff
  {
    id: 'check-in',
    title: 'Check-in on the day',
    minRole: 'staff',
    body: `**How do I check people in?**
Open the event and choose **Run check-in**, then use any of these:

- **Scan:** point the camera at the attendee's QR code.
- **Code:** type the ticket code by hand.
- **Roster:** find the person in the event's **Registrations** list and choose **Check in**. No QR code or ticket code is needed.

**I scanned the wrong ticket. Can I undo it?**
Yes. Use **Undo** on the check-in screen straight after the scan.

**The camera will not start.**
Allow camera access when your browser asks. If you blocked it earlier, re-enable it in your browser's site settings and reload the page. If the device has no camera, use code entry or the roster.

**What does "Already checked in" mean?**
That ticket has already been used. If it was a mistake, undo the earlier check-in first.

**Can several of us check guests in at once?**
Yes. Each person checks in on their own phone and the checked-in count updates for everyone.`,
  },
  {
    id: 'attendees',
    title: 'Registrations and attendees',
    minRole: 'staff',
    body: `**Where do I see who has registered?**
Open the event, then **Registrations**. The tabs are **All**, **Confirmed**, **Pending**, **Cancelled** and **VIP**. The header shows the totals and the live checked-in count.

**Why can the ticket count be higher than the registration count?**
One registration can hold several tickets, for example a group order. Registrations count people who signed up; tickets count seats.

**An attendee did not get their ticket email.**
1. Ask them to check spam, junk or Promotions, and to search for "Orkora".
2. They can open **orkora.events/me/tickets**, sign in with the email they registered with using **Email me a sign-in code**, and show the ticket from there.
3. At the door, check them in from the registrations list. No QR code is needed.

**Can I export the attendee list?**
Yes. Choose **Export CSV** on the registrations page. The export includes the answers to the registration questions.`,
  },
  {
    id: 'analytics',
    title: 'Analytics',
    minRole: 'staff',
    body: `**What do the analytics show?**
- **Per event:** registrations over time, sell-through, sales by tier, check-in rate, chat messages and poll votes.
- **Across all events (Analytics in the menu):** a 12-month trend, a conversion funnel and an events breakdown.

**Can I filter by date, tier or registration answers?**
Yes. Open the event's **Analytics** and scroll to **Insights**. Filter by when people registered, tier, status, VIP and any dropdown or checkbox question on your registration form. **Compare by** shows the same numbers side by side (for example check-in rate per tier, or registrations per "How did you hear about us?" answer), and **Arrivals** shows check-ins every 15 minutes on the day.

**Can I download exactly what I filtered?**
Yes. **Export CSV** in Insights downloads the attendees in the current view, with their answers.`,
  },

  // ------------------------------------------------------------ organizer
  {
    id: 'events',
    title: 'Creating and editing events',
    minRole: 'organizer',
    body: `**How do I create an event?**
**Events, then Create a new event.** Add a title, description, format (in person, virtual or hybrid), start and end times, timezone and location. You can change all of it later.

**Which timezone do event times use?**
The one you choose for the event. Everyone sees the event's local time. Set it before you publish.

**Is a new event public straight away?**
No. It starts as a draft. Choose **Publish** when you are ready, and **Unpublish** to hide it again. Your organization must have accepted the Organizer Agreement before it can publish.

**Can I edit an event after publishing?**
Yes, under **Event details**. Changes go live immediately.

**Can I hide the venue until people register?**
Yes. Turn on **Reveal the venue only on the ticket**. The public page then shows only the city; the venue, address and online join link appear on the ticket.

**What are sessions, tracks and speakers?**
- **Sessions** are agenda items: talks, workshops, panels.
- **Tracks** group sessions, for example "Main Stage".
- **Speakers** are the people leading sessions.

All three are optional. Polls can run for the whole event or for one session.

**How do I take an event down?**
**Unpublish** hides it. **Archive** retires it for good; archiving needs an owner or admin.`,
  },
  {
    id: 'tickets',
    title: 'Tickets and registration',
    minRole: 'organizer',
    body: `**How do I add tickets?**
Under **Ticket tiers**, choose **Add tier**. Set a name, price (0 for free), currency and quantity.

**Can I change a tier after people have registered?**
Yes: name, price, currency and quantity. The quantity cannot go below what has been sold, and a tier with sales or check-ins is protected from deletion.

**How do I close registration at a set time?**
Edit the tier and set **Sales close**, in the event's timezone. When every tier has closed, the event page shows **Registration closed**. To reopen, set a later time.

**Can someone register twice?**
One registration per email address per event. Submitting the form again does not create a second ticket.

**Can one person register a group?**
Yes. Make the tier a **Group ticket** and set the **Minimum group size** and **Maximum per order**.

**Can I ask my own questions at registration?**
Yes, under **Registration form**. Types: short text, paragraph, dropdown, checkboxes, number, date, consent checkbox, and a **Note / info** block (no answer, can include links). Questions can be required, and **Show only if** makes a question appear after a particular answer.

**What is a VIP express link?**
A private link for guests to register through a short form. They are tagged VIP and appear under the **VIP** tab. Choose **Generate VIP link** (optionally with a custom word), then **Copy link** and share it privately. VIP guests get a free ticket, so the event needs a free tier.`,
  },
  {
    id: 'story',
    title: 'Story Mode',
    minRole: 'organizer',
    body: `**What is Story Mode?**
A richer, scrolling event page built from blocks: hero, schedule, speakers, gallery, quotes, tickets and more. Open the **Story** tab, compose and preview, then publish. It shows a "Starts in" countdown before the event and a "Happening now" band during it.

**Can I go back to the standard page?**
Yes. Unpublish Story Mode at any time; your composition is kept.

**How is my Story page doing?**
The Story tab shows views, how many visitors reached the tickets section, and which block got the most attention.`,
  },
  {
    id: 'live',
    title: 'The live room: Q&A, polls, chat and spotlight',
    minRole: 'organizer',
    body: `**What is the live room?**
A second screen for attendees during the event: ask and upvote questions, vote in polls, chat. Attendees open it from **Join live** on their ticket.

**How do I run it?**
Open the event, then **Live control**. Create polls, answer and hide questions, moderate chat and put something on screen.

**Do I need sessions to run polls?**
No. Choose **Whole event** in the Session box, or pick a session to tie the poll to it.

**Can attendees ask anonymously?**
Yes, with **Ask anonymously**. Anonymous questions show as "Anonymous" to everyone, organizers included.

**What is "On screen now"?**
The spotlight. Push an announcement, a link or a video to every attendee's live room until you take it off.

**Can I remove an inappropriate message?**
Yes. Hide it from Live control.`,
  },
  {
    id: 'extras',
    title: 'Discounts, recordings and feedback',
    minRole: 'organizer',
    body: `**How do I create a discount code?**
On the event, **Discounts, then New code**. Choose **Percentage off** (1 to 100) or **Fixed amount off**, and optionally a maximum number of uses, an expiry and a specific tier.

**Can I share recordings after the event?**
Yes. Under **Recordings**, add a recording and optionally restrict it to holders of a specific tier. Viewers watch it from the event's watch page.

**How do I collect feedback?**
Attendees leave a rating, a 0 to 10 score and comments from the event page. See the results under **Feedback** on the event.`,
  },

  // ---------------------------------------------------------------- admin
  {
    id: 'team',
    title: 'Your team: roles and access',
    minRole: 'admin',
    body: `**How do I add someone?**
**Settings, then Invite a teammate.** Enter their email and choose a role. They receive an email with an accept link.

**Which role should I give?**

| Role | Can do |
|---|---|
| Staff | View events, registrations and analytics, and check people in. Cannot change events. |
| Organizer | Staff, plus create and edit events, tickets, sessions and Story Mode, and run the live room. |
| Admin | Organizer, plus campaigns, team, payouts, refunds and branding. |
| Owner | Everything, including changing members' roles. |

Roles cover every event in the organization.

**How does a teammate accept?**
1. They open the invitation email and choose the accept link.
2. They sign in with **the email the invitation was sent to**, using **Email me a sign-in code**. No password is needed.
3. They land in your dashboard. Next time they sign in at **orkora.events/login** the same way. The invitation link works once.

**The invite says it is for a different email.**
The browser is signed in to another account. Choose **Sign out and use the invited email**, or use the teammate's own phone or a private window.

**How long does an invitation last?**
14 days. Send a new one if it expires.

**How do I remove someone?**
**Settings, then Members.** Their access ends shortly afterwards.`,
  },
  {
    id: 'campaigns',
    title: 'Email campaigns',
    minRole: 'admin',
    body: `**How do I email attendees?**
**Campaigns** in the menu. Choose an audience, then write the email.

**Can I personalise it?**
Yes. Use \`{{first_name}}\`, \`{{full_name}}\` and \`{{email}}\` in the subject, preview text or body.

**What is preview text?**
The short line shown next to the subject in the inbox.

**Can I add a flyer?**
Yes, as an image (PNG, JPEG or WEBP, up to 5 MB). It appears in the email with a **Download flyer** button. Convert PDFs to an image first.

**Can I include a PDF, such as a newsletter?**
Yes. Under **Document**, upload a PDF of up to 10 MB. Recipients get a **Download PDF** button, and after sending the campaign page shows how many recipients opened it.

**How do I test first?**
**Send test** sends it to you, with tokens filled in using your name.

**Whose name and logo appear?**
Your organization's logo, or its name if there is no logo. The mailing address set under **Settings, then Branding** appears in the footer.

**Is there a sending limit?**
Yes, a daily limit per organization. Contact us before emailing a very large audience in one day.`,
  },
  {
    id: 'payments',
    title: 'Paid events, payouts and refunds',
    minRole: 'admin',
    body: `**How do I sell paid tickets?**
Set a price on the tier and connect a payout account under **Settings, then Payout accounts**: pick your bank, enter the account number, verify it and connect.

**Which providers are supported?**
Paystack is the main provider. Choose the provider for each currency under **Settings, then Provider preferences**.

**What does Orkora charge?**
A platform fee on each paid ticket, shown on the **Billing** page. Free tickets carry no fee. For each event you choose **I will absorb the fee** or **Pass the fee on to attendees**; if passed on, buyers see the exact fee before paying. Your payment provider also charges its own processing fee.

**When do I get paid?**
On your payment provider's settlement schedule, into the connected account.

**A buyer paid but has no ticket.**
This is rare. Payments that cannot be confirmed automatically are held for review and no ticket is issued until they are resolved. Contact us with the buyer's email.

**How do I refund someone?**
Open **Attendees**, choose the person, then **Refund** on the order. The buyer is refunded in full, including any platform fee, and the ticket is cancelled.

**Where do I see revenue?**
**Billing** shows revenue and refunds by currency, with a CSV of orders. **Analytics** shows revenue per event.`,
  },
  {
    id: 'brand',
    title: 'Brand Home and branding',
    minRole: 'admin',
    body: `**What is Brand Home?**
A public page for your organization at **orkora.events/o/your-name**, listing upcoming and past events, where visitors can subscribe for new ones. Set it up under **Brand Home** in the menu.

**How do I add my logo and colours?**
Under **Settings, then Branding**. The logo also heads your campaign emails.

**Can I change the organization's name or link?**
Yes, under **Settings, then Organization profile**.`,
  },
];

const RANK: Record<string, number> = {
  vendor: 1,
  staff: 2,
  organizer: 3,
  admin: 4,
  owner: 5,
};

/** Sections a caller with this organization role may read. */
export function helpSectionsForRole(role: string | undefined | null): HelpSection[] {
  const rank = RANK[role ?? ''] ?? 0;
  return HELP_SECTIONS.filter((s) => rank >= RANK[s.minRole]!);
}
