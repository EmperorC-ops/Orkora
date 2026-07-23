# D3 · Shareable Ticket Cards

**Feature:** Every ticket purchase generates a brand-styled, shareable card
**Delivered via:** ticket page, confirmation email, mobile app
**Ship target:** Weeks 2-4
**Owner:** Design + Engineering

---

## Purpose

Every ticket sold today is a receipt. Every ticket sold on Orkora will now also be a piece of marketing.

When an attendee completes checkout, the platform generates a personalised, brand-styled card in four social formats (Instagram Story, Instagram feed, WhatsApp, Twitter). The card shows the attendee's first name, the event, the date, and the brand's identity. It reads like something the attendee would proudly share, and it turns every buyer into acquisition.

This is a growth loop the strongest event brands already engineer manually. Orkora ships it as first-class product.

---

## Success signals

- Reach amplification per ticket sold > 3.0x (Shareable Card unique views / tickets sold in same window)
- 40% of ticket purchasers view the share sheet within 24h of purchase
- 20% of ticket purchasers share at least one card (via download or direct share intent)
- Card generation p95 latency < 800ms
- New tickets purchased from `?source=shareable_card_*` referral > 10% of total by week four

---

## User journeys

### Attendee: post-purchase share

1. Priya buys a ticket to Aurora Vol. 5.
2. Confirmation page loads. Top of page: "You're in. Share it." with the Instagram Story card rendered inline and a "Share" button.
3. Priya taps Share. Native share sheet opens (Web Share API on mobile; on desktop, download button).
4. She posts the card to her Instagram Story.
5. Two of her followers tap through the URL burned into the card, land on the event page, buy in.

### Attendee: post-purchase email

1. Confirmation email arrives.
2. The card renders as an inline image at the top of the email (linked to a hi-res version).
3. Email includes a "Share your ticket" link that opens the ticket page's share sheet.

### Attendee: later on the ticket page

1. Days later, Priya opens `orkora.events/t/<code>` on her phone.
2. Above the QR code, a "Share" button opens the same share sheet.
3. She shares the WhatsApp variant to a group chat.

### Organiser: viewing shares in analytics

1. Sarah checks the event's analytics dashboard.
2. A "Shareable Card" section shows: cards generated, cards viewed, cards shared, referral clicks, tickets sold from card referrals.
3. She sees which format is driving the most conversion (probably Instagram Story) and adjusts the confirmation email's default surfaced card next time.

---

## Four card formats

Each format is server-generated as PNG. Different aspect ratios, same content structure.

### Instagram Story · 1080 × 1920

- Full-bleed background: event banner blurred + darkened, `brandColor` gradient overlay
- Top 20%: brand logo + brand name in the brand's typographic style
- Middle 40%: "I'M GOING TO" in small caps, then event title in Display XL, then date + city
- Bottom 25%: attendee first name + "SEE YOU THERE" + Orkora + event URL in small text at very bottom
- QR code sub-block bottom-left (256px) linking to event, or omitted for elegant variant

### Instagram feed · 1080 × 1080 (square)

- Background: event banner + `brandColor` gradient overlay
- Centre: event title in Display L, date + city below
- Attendee name and "SEE YOU THERE" at the bottom
- Brand logo top-left, Orkora watermark bottom-right

### WhatsApp · 1080 × 1350 (4:5)

- Optimised for WhatsApp Status crops (which prefer 4:5)
- Same content as Instagram Story but recomposed for the taller aspect

### Twitter / X · 1200 × 675 (16:9)

- Landscape composition, denser text
- Brand logo left, event title centre, attendee name and date right
- Best for feed posts, not story-style shares

---

## Content structure per card

Every card renders from the same JSON payload; formats differ in layout only.

```json
{
  "attendee": { "firstName": "Priya" },
  "event": {
    "title": "Aurora Vol. 5",
    "dateLine": "Saturday 22 August · Lagos",
    "url": "orkora.events/e/aurora-vol-5"
  },
  "brand": {
    "name": "Aurora",
    "logoUrl": "https://cdn.orkora.events/logos/aurora.png",
    "brandColor": "#4C1D95",
    "brandAccent": "#7C3AED"
  },
  "banner": {
    "mediaUrl": "https://cdn.orkora.events/banners/aurora-vol-5.jpg"
  },
  "qrDataUrl": "data:image/svg+xml;base64,..."
}
```

Cards do NOT include the attendee's last name, email, phone, or ticket code. The QR (if included) encodes the event URL only, not the signed ticket token — the ticket token is private to the ticket page, not shared to the world.

---

## Generation pipeline

Server-side SVG composition, exported to PNG via `sharp` (already installed for brand assets).

### Endpoint

`GET /v1/tickets/<code>/share.png?format=story|feed|whatsapp|twitter`

- No auth required. The ticket code in the URL is the auth (same pattern as `/t/<code>`).
- Response: `image/png`, `Cache-Control: public, max-age=31536000, immutable` (URL is immutable per ticket + format)
- 200: PNG binary
- 404: ticket not found
- 400: unknown format

### Rendering flow

1. Fetch ticket + event + org from DB.
2. Fetch banner image, brand logo, and any hero media into memory (small size, cached).
3. Compose SVG string from the format's template with all content interpolated.
4. Pass SVG to `sharp`, export PNG buffer.
5. Cache PNG in R2 at `share/<ticketId>/<format>.png` with 1-year TTL (immutable — banner + brand rarely changes).
6. Return PNG.

### Cache invalidation

- If the event's banner changes, all cached cards for that event are invalidated (background job).
- If the org's logo or brand colour changes, the same.
- Small event of "brand asset changed" fires a background purge on R2 cards for affected tickets.

### Performance targets

- Cold generation (cache miss): p50 < 400ms, p95 < 800ms
- Cache hit: p50 < 50ms (CDN edge cache)
- No new dependencies beyond `sharp` (already installed)

---

## Delivery surfaces

### Ticket page

Above the QR code, add a "Share your ticket" section:

- Preview card (currently-focused format thumbnail, 300px wide)
- Format selector: four small tabs (Story / Feed / WhatsApp / Twitter)
- Two buttons: **Share** (Web Share API on mobile) and **Download** (direct PNG download)
- Small link: "Post to Instagram Story" opens a deep link on mobile if IG is installed

### Confirmation email

- Insert an `<img>` at the top of the email body, above "Your ticket is ready":
  ```html
  <img src="https://api.orkora.events/v1/tickets/<code>/share.png?format=feed"
       alt="You're going to <event>" width="600" style="max-width:100%; border-radius: 12px;" />
  ```
- Below the image: "Share this on Instagram, WhatsApp, or wherever your people are. Or open your ticket to see other formats." with the ticket URL.
- Email template updates in `apps/api/src/modules/notifications/templates.ts`.

### Mobile app

- Ticket screen gains a "Share" button in the header.
- Tapping opens a native share sheet with the Story format PNG loaded via URL.
- Native iOS and Android sheets handle the platform-specific share intents.

### Direct share URL

For campaigns, tweets, and any manual share, we expose a canonical share URL:

`orkora.events/s/<ticket-code>?format=story`

This URL redirects to the appropriate PNG for the format, or on mobile, offers the native share sheet before redirecting. Also useful for QA and marketing.

---

## Analytics

### Events fired

- `shareable_card.generated { ticket_id, format, cache_hit }`
- `shareable_card.viewed { ticket_id, format, referer }` — when the PNG endpoint is hit
- `shareable_card.shared { ticket_id, format, intent }` — when the user taps Share (native intent captured)
- `shareable_card.downloaded { ticket_id, format }` — direct download button
- `shareable_card.attributed_ticket_sold { source_ticket_id, format, purchased_ticket_id }` — when a new ticket purchase's referer is a shareable card URL

### Attribution

Every shareable card URL includes `?source=shareable_card_<format>_<ticket-id>`. When a new visitor lands on the event page, that source is stored in a first-party cookie for 30 days. If they buy a ticket, the new ticket's `source_ticket_id` records the original ticket that drove the acquisition. This is a first-party growth-loop attribution — no third-party pixels required.

---

## Design specifications

### Typography

- **Event title** in the card: Display XL for Story / WhatsApp; Display L for Feed / Twitter
- **Attendee name**: Editorial 22px, uppercased
- **Small caps labels** ("I'M GOING TO"): 12px, letter-spaced 0.15em, Editorial regular
- **Small text** (URL, watermark): 10px, letter-spaced 0.05em

### Colour usage

- Card background: `brandColor` at 100%, then event banner blended at 40% opacity with `mix-blend-mode: multiply`
- Foreground: white text with subtle drop-shadow for contrast on busy banners
- Accent bar (top or bottom edge, 8px): `brandAccent`
- Orkora watermark: `#B39DDB` at 50% opacity, small

### Brand-safe variations

If the org's `brandColor` produces poor contrast with white text, the pipeline auto-adjusts: darken `brandColor` by 15% for background use, keep original for accents. Ensures WCAG AA on every card.

### Logo placement

- Story / WhatsApp: top-left, max 64px height, respecting logo's aspect ratio
- Feed / Twitter: top-left or top-right depending on visual balance with event title
- Falls back to brand name in Display S if logo is missing

---

## Migration plan

### Day-of-release

No data migration. Cards generate on demand from existing ticket data.

- Existing tickets already have all required fields (event, org, banner, brandColor)
- The share.png endpoint is a new route, no impact on existing routes
- Confirmation email template is updated in a single commit; new emails include the card, old emails do not (but old attendees can still get the share sheet on their ticket page)

### Retro-fire share sheet for existing tickets

- All existing tickets automatically get the share sheet on their ticket page after this release lands
- No email is re-sent for old purchases (no unwanted resurfacing)
- Analytics starts tracking share activity on all tickets, old and new

---

## Edge cases

- **Attendee has no first name**: fall back to "You". "YOU'RE GOING TO Aurora Vol. 5"
- **Very long event title**: auto-shrink to fit; two-line max in Display XL / Display L
- **Very long brand name**: single line, letter-spacing tightened; hard truncate at 32 chars
- **No event banner uploaded**: gradient hero using `brandColor` to `brandAccent`, event title stays prominent
- **Org has no brand logo**: brand name in Display S replaces logo slot
- **QR code disabled** (organiser toggle for privacy-sensitive events): card renders without QR sub-block, small "Ticket ready at orkora.events/t/<code>" text replaces it
- **Ticket refunded**: `share.png` returns the card with a diagonal watermark: "TICKET REFUNDED — no longer valid". Prevents refunded tickets from being marketed as still active.
- **Card generation service down**: confirmation email falls back to a plain text version with the ticket URL; ticket page shows a friendly "Sharing coming shortly" note.

---

## Privacy and PII considerations

- No email addresses in cards
- No last names in cards
- QR encodes public URL, not signed ticket token
- Attribution cookie is first-party, 30 days
- Consent implied by purchase; opt-out available in account settings (post-R1) — hides your name from any future card generations

Documented in the privacy policy §3 (marketing communications, first-party) and privacy policy §6 (payment and ticketing data).

---

## What we are NOT building in R1

- Editable card compositions (organiser edits the card layout). Cards use the format templates; brand colour + logo are the only customisation.
- Video-format shareables (a 5-second animated card). Considered for R2.
- Multi-attendee shareables (a card showing "Priya, Ade, and Kwame are going"). Solo cards only in R1.
- Direct-to-Instagram publishing (via Meta API). Web Share API + manual save-and-post covers 95% of intent.
- Cards with the attendee's own selfie or photo. Selfie ticketing is a whole other feature.
- Watermark-free / premium cards. Post-launch.

---

## Handoff checklist

- Figma file with all four format templates, three example events each (varying banner styles)
- SVG composition templates (one per format) for the generation service
- Content-safety validator for brand colour → contrast → foreground colour adjustment
- Confirmation email template updates in `templates.ts`
- Ticket page share-sheet UI at three breakpoints (desktop, tablet, mobile)
- Mobile app share button + native share sheet integration
- Sharp export presets tested against all four formats for file-size targets (< 300KB per PNG)
- Analytics events wired into the existing pipeline
- Sentry breadcrumbs on generation failures
- Load-test the share.png endpoint at 100 concurrent requests
- Accessibility check: alt text for the confirmation-email `<img>`, keyboard nav on the format selector, screen-reader labels
