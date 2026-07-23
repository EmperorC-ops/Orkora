# D1 · Brand Home

**Feature:** Persistent public presence for an event brand
**URL:** `orkora.events/o/<brand-slug>`
**Ship target:** Weeks 2-3, then editor in weeks 4-5
**Owner:** Design + Engineering

---

## Purpose

Every organisation on Orkora becomes a brand. The Brand Home is that brand's public home on the internet. It lives between events, not only during them. New attendees who discover any single event now discover the whole brand; past attendees who want to know when the next drop happens have a place to check.

This is the surface where "event as transaction" ends and "brand as year-round world" begins.

---

## Success signals

- Brand Home dwell (median time on page) > 30 seconds
- 15% of ticket buyers arrive on an event page via `?source=brand_home`
- 80% of organisations have visited their Brand Home in the editor within four weeks of release
- Community subscribe rate > 8% of unique visitors for organisations that enable it

---

## User journeys

### Attendee: cross-event discovery

1. Alex clicks a link to an event page: `orkora.events/e/aurora-vol-5`.
2. In the event page header, they see the brand's name and logo: "Aurora".
3. They tap "Aurora" (the brand mark). Land on `orkora.events/o/aurora`.
4. They see a cinematic hero, brand story, three upcoming events, an archive strip of past editions, and a signup for the brand's audience.
5. They subscribe to the audience, then browse the next event.

### Attendee: brand direct

1. Attendee gets forwarded `orkora.events/o/aurora` from a friend.
2. Lands directly, feels the brand identity, subscribes, and taps into the next scheduled event.

### Organiser: composing the home

1. Sarah logs in, goes to `dashboard/branding`.
2. Sees a preview of her current default Brand Home in a device frame.
3. Clicks "Compose Brand Home".
4. Enters a block editor. Uploads a hero video, writes bio, curates featured artists, enables community subscribe, previews.
5. Publishes. Live at `orkora.events/o/<her-slug>`.

---

## Page structure

The public Brand Home is a single scrollable page composed of blocks. Six default blocks; five optional.

### Header (persistent)

- Left: brand logo (from `org.logoUrl`, fallback to Orkora mark if unset)
- Centre-left: brand name (from `org.name`) in Display L, or wordmark if set
- Right: nav links to `#events`, `#about`, `#connect`
- Right end: Subscribe button (opens community signup modal if enabled)
- Height: 72px on desktop, 56px mobile. Sticky on scroll with a subtle backdrop-blur once scrolled past hero.

### Hero block (default; required)

Two variants an organisation can pick between at compose time:

- **Cinematic**: full-width media (video preferred, image fallback). 16:9 on mobile, 21:9 on desktop. Autoplay muted, loop, click to unmute. Brand name in Display L overlaid, alignment configurable (bottom-left default). Tagline in Editorial style below. Two CTAs: primary (Next event) + secondary (Subscribe).
- **Editorial**: three-column split — a hero image at 50% width right, brand name and long-form bio at 50% left in Editorial typography. Same two CTAs.

Copy inputs: `org.name`, `org.tagline` (new field, 60 chars max), `org.heroMediaUrl` (new field, video or image), `org.heroBio` (new field, 280 chars for editorial variant).

Default (organisation has not composed): gradient background from `brandColor` to a darker shade, `org.name` centred in Display L, "The next event is coming" tagline in Editorial. Subscribe CTA only.

### Upcoming events block (default; required if org has upcoming events)

Grid of upcoming events. Card layout:

- Aspect ratio 3:4 (mobile stack; desktop 2 or 3 columns)
- Event banner as background with a gradient overlay (bottom-to-top, brandColor at 40% opacity)
- Event title at the bottom in Display S / 24px
- Date and city small above title
- "Get tickets" pill CTA in `brandColor`
- Hover: 8px translateY lift, saturate boost on banner

Sort order: by `startAt` ascending. Limit 6 by default; "See all" if more.

### About block (default; optional)

Long-form bio content. Editorial typography. Optional pull-quote block within. Organisers can add photo(s) or leave text-only.

Copy input: `org.longBio` (new field, unlimited chars, markdown-supported).

### Past events archive block (default; optional)

Horizontal scroll strip of past event thumbnails. Each card links to the event's archive page (Story Mode read-only view). Hover shows title + date overlay. Tap opens.

Sort order: by `endAt` descending. Limit 12 in the strip, "See all" links to `orkora.events/o/<slug>/past`.

### Cast block (default; optional)

Featured collaborators (artists, DJs, designers, brand collabs). CardGrid layout. Each card:

- Circular avatar 96px
- Name in Display S
- Role in small caps
- Social handle
- Optional: link to their profile page

Copy input: `org.cast` (new field, JSONB array of `{name, role, avatarUrl, socialHandle}`)

### Community block (default; optional)

Subscribe to the brand's audience. Single-input form.

- Headline: configurable (default: "Get on the list")
- Sub-headline: configurable (default: "Be first to hear about the next drop")
- Email input + Subscribe button in `brandColor`
- Fine print: "We only email you about our own events. Unsubscribe any time."

Backend: creates a `community_subscribers` row (new table: `id, organizationId, email, subscribedAt, unsubscribedAt, source`). Consented under Privacy Policy §3 (marketing communications, first-party).

### Connect block (default; optional)

Socials row + contact line.

- Instagram, TikTok, X, WhatsApp channel, YouTube. Icons in `brandColor`, hover in `brandAccent`.
- Line: "Reach out at hello@<brand-domain>" (from `org.contactEmail`, new field).

### Footer

- Small line: "Powered by Orkora · A VoltAfrica company"
- Legal: Privacy, Terms
- Copyright: `© <year> <org.name>. All rights reserved.`

---

## Editor UX

Route: `dashboard/branding`. Extends the existing Brand tab.

### Editor layout

- Left rail (30% width): block list with drag-drop reorder. Each block shows a small preview thumbnail and edit / hide toggles.
- Centre (55%): device preview frame (desktop / tablet / mobile toggle at top). Live preview of the composed home.
- Right rail (15%): properties panel for the currently selected block.

### Block editing

Each block has an inline edit surface in the preview. Click into hero → hero properties (media picker, headline, CTA text) appear in right rail. Change flows immediately into preview.

### Templates

Not templates as in "pre-composed layouts". Templates as in "one-click starting points". Three:

- **Fresh**: empty. Default text placeholders. For brands starting from zero.
- **Migrated**: what the org already has (logo, name, colour, event list) rendered as the default home. Starting point for iteration.
- **Signature**: a demo version with example content, so the organiser can see what a "done" home looks like. Read-only, they clone-to-edit.

### Save + publish

- Autosave every 30 seconds to a draft
- Explicit "Publish" button in the top-right; makes changes live at `orkora.events/o/<slug>`
- Revision history for the last 30 revisions accessible via a small "History" affordance

### Preview

"View live" opens `orkora.events/o/<slug>` in a new tab. "Preview" opens the same in an in-editor iframe.

---

## Data model changes

### `organizations` table (extensions)

```sql
ALTER TABLE organizations
  ADD COLUMN tagline VARCHAR(120),
  ADD COLUMN hero_media_url VARCHAR(500),
  ADD COLUMN hero_bio TEXT,
  ADD COLUMN long_bio TEXT,
  ADD COLUMN contact_email VARCHAR(320),
  ADD COLUMN brand_accent VARCHAR(7),
  ADD COLUMN brand_surface VARCHAR(7),
  ADD COLUMN home_blocks JSONB DEFAULT '{}',
  ADD COLUMN home_published_at TIMESTAMPTZ,
  ADD COLUMN cast JSONB DEFAULT '[]',
  ADD COLUMN socials JSONB DEFAULT '{}',
  ADD COLUMN community_enabled BOOLEAN DEFAULT FALSE;
```

Note: `home_blocks` is a JSONB representation of the block ordering and per-block config. Full block content lives in the columns above (bio, hero, cast, etc.); `home_blocks` just controls order and visibility so an organiser can hide or reorder without losing content.

### New `community_subscribers` table

```sql
CREATE TABLE community_subscribers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  source VARCHAR(40),
  UNIQUE (organization_id, email)
);
CREATE INDEX community_subscribers_org_idx ON community_subscribers (organization_id, subscribed_at DESC);
```

### API endpoints

- `GET /v1/public/orgs/<slug>` — returns the composed Brand Home data for public rendering. Cache 60s at the CDN.
- `PATCH /v1/organizations/<orgId>/home` — updates `home_blocks`, bio, hero, cast, socials. Guard: owner or admin.
- `POST /v1/public/orgs/<slug>/subscribe` — adds a `community_subscribers` row. Rate-limited by IP (10/hour).
- `POST /v1/public/orgs/<slug>/unsubscribe` — HMAC-signed link, no auth required.

---

## Migration plan

### Day-of-release

1. Migration 0006 adds the new columns and table with sensible defaults.
2. Backfill script iterates all orgs, sets `home_blocks` to a default preset (Migrated template).
3. Every org's Brand Home is live at `orkora.events/o/<slug>` with the default. Nothing breaks.

### Two-week composition window

1. Dashboard shows a "Compose your Brand Home" banner for orgs whose `home_published_at IS NULL`.
2. Banner dismisses if the org publishes or explicitly clicks "Not now".
3. Analytics tracks banner impression + click-through.

### Steady state

- Default (unedited) Brand Home is always valid. An org that never touches the composer still has a working public presence.
- Any org can delete their Brand Home entirely by setting `is_public = false` in Org Settings (new toggle). This 404s the public URL. Removed from sitemap.

---

## Edge cases

- **Archived org**: `orkora.events/o/<slug>` returns 410 Gone with a message: "This brand is no longer on Orkora."
- **Unpublished org (private)**: 404. Not indexed. Only visible via direct URL when signed in as an org member.
- **Org with zero events (ever)**: hero renders default, no Upcoming block, "Coming soon" placeholder.
- **Org with only past events**: hero renders default, no Upcoming block, Past events prominent, community CTA prominent.
- **Broken hero media**: falls back to gradient hero. Log Sentry warning.
- **Very long bio**: Editorial variant of the hero limits to 280 chars; long-form bio in the About block is unlimited.
- **Custom domain (out of scope for R1)**: parked. Docs Slice 3.
- **Reserved slugs**: `admin`, `login`, `signup`, `me`, `t`, `e`, `dashboard`, `legal`. Cannot be claimed. Slug validation in Org create + edit.

---

## What we are NOT building in R1

- Custom domain / white-label CNAME. Parked.
- Full block-editor with arbitrary block types (like Notion). Composer is preset blocks with content editing, not free-form composition.
- Multiple pages per Brand Home (`/o/<slug>/lookbook`, `/o/<slug>/press`). Single-scroll home only in R1.
- Language / locale switching. English-only.
- Custom fonts. Uses Orkora's typographic scale.
- Video hosting (heroMediaUrl accepts links to hosted video only; no upload-to-Orkora video pipeline).

---

## Handoff checklist

- Figma file with all block variants at three breakpoints (desktop 1440, tablet 768, mobile 375)
- Component tokens for the eight new components documented in Storybook
- Motion primitives documented as CSS variables in the design system reference
- Slug reserved list added to `apps/api/src/modules/orgs/orgs.service.ts:generateUniqueSlug` guard
- Empty state art for "Coming soon" hero
- Loading skeletons for public Brand Home render
- Accessibility check: heading order, contrast, keyboard nav, screen-reader for the subscribe form
- OG image spec for `/o/<slug>` (uses hero media if set, brand mark + colour gradient default)
