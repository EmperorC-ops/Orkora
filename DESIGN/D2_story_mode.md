# D2 · Story Mode

**Feature:** Compose the event page as a scroll-narrative, not a checkout form
**URL:** `orkora.events/e/<event-slug>`
**Ship target:** Renderer weeks 3-4; editor weeks 4-5
**Owner:** Design + Engineering

---

## Purpose

The event page is where the world of the brand meets the wallet of the attendee. Today it is a form. In the new category, it should be a designed narrative that makes the attendee feel the event before they see the price.

Story Mode gives organisers a block-based composition surface for the event page. Four preset templates get them from zero to a beautiful page in under ten minutes. The ticket picker is always present, always accessible, always the last thing an attendee sees before they buy.

---

## Success signals

- 60% of new events created with a Story Mode template other than Classic within four weeks of release
- Median time-on-page on Story Mode events > 60 seconds (vs today's average of ~35 seconds)
- Conversion (unique visitors → ticket purchases) at least equal to Classic layout at launch, trending up
- Story Mode composition time (event created → Story Mode published) median under 15 minutes

---

## Four templates

Each template is a starting block sequence and a set of style tokens. The organiser picks one at event creation, gets a working page immediately, and can then compose further.

### Editorial

Long-form, magazine-style. Best for cultural nights and curated dinners where the story matters more than the visuals.

Block sequence:

1. Hero (image variant, editorial crop)
2. Pull-quote
3. About the night
4. Featured artists / speakers (Cast block)
5. Playlist embed
6. Agenda
7. Tickets

Typography: Editorial 22px body, Display L for section headings, generous whitespace.

### Cinematic

Video-first, image-heavy. Best for festivals and larger productions where atmosphere sells the ticket.

Block sequence:

1. Hero (video variant, full-bleed)
2. Editorial paragraph (short)
3. Moodboard (masonry, 6 tiles)
4. Cast block (2-column card grid)
5. Playlist embed
6. Tickets
7. Agenda
8. FAQ

Typography: Display XL for hero, tighter body copy, saturated brand colours.

### Underground

Text-forward, restraint-driven. Best for members-only sessions and taste-driven small events where "less is more" is the whole point.

Block sequence:

1. Hero (minimal — event title in Display XL over solid `brandColor`)
2. Editorial paragraph (single paragraph, 300 chars max recommended)
3. Cast block (list variant, no avatars)
4. Location tease (city + week, exact address after ticket purchase)
5. Tickets

Typography: monospaced accents in section labels, otherwise Editorial.

### Runway

Fashion-adjacent, image-grid-heavy. Best for showcase-style events, brand launches, or fashion-adjacent culture nights where visuals sell.

Block sequence:

1. Hero (image, full-bleed, landscape crop)
2. Cast block (avatar-forward, 4-col grid)
3. Moodboard (masonry, 9 tiles)
4. Editorial paragraph (short)
5. Playlist embed
6. Tickets
7. Agenda

Typography: Display L for section headings, image-first hierarchy.

### Classic (the migration default)

The current event page. Preserved as the default for existing events. Available as a fifth template choice for organisers who prefer the traditional form-first layout.

---

## Block library

Ten block types. Organisers compose from these; templates just seed the initial sequence.

### Hero

- Variants: Video (full-bleed autoplay muted), Image (full-bleed), Minimal (typography-only on solid colour)
- Slots: media, headline (defaults to event.title), sub-headline, date + city line, two CTAs (primary Tickets, secondary Add to calendar)
- Responsive: full viewport height on desktop, 60vh on mobile

### Editorial paragraph

- Long-form body copy in Editorial 22px
- Supports inline bold, italic, links
- Optional pull-quote insertion mid-paragraph
- Optional inline image (max 60% column width)

### Pull-quote

- Standalone block: single large quote in Display L, 400 char max
- Attribution line below
- Left border in `brandColor`, 4px

### Cast

- Grid or list variant
- Slots per person: avatar, name, role, social handle, optional bio
- Grid: 2, 3, or 4 columns configurable
- Order: sorted manually or by role

### Moodboard

- Masonry grid, 3-9 items
- Each tile: image, optional caption
- Click any tile to expand into a lightbox
- Aspect ratios vary; masonry handles

### Playlist

- Embed variant: Spotify, Apple Music, SoundCloud, YouTube. Uniform card wrapper in `brandColor`.
- Track-list variant: manually curated list, no embed. For when the playlist is a curation piece.

### Agenda

- Read-only view of the event's existing tracks and sessions
- Timeline format: hour column + session cards
- Auto-populated from event data; no separate content

### Tickets

- The ticket picker. Always present, always accessible.
- Fixed to the bottom-right as a floating "Get tickets" button once scrolled past the hero.
- Full picker card appears when scrolled past the last non-ticket block, or when Get tickets is tapped.

### FAQ

- Accordion list
- Slots per Q: question, answer (Editorial body)

### Brand collab callout

- Half-width card, image + text
- "In partnership with [X]"
- Link to collab partner's site or brand page

### Location

- Map embed (Mapbox or OSM), address, "Directions" link
- Optional "Approximate — exact address sent after ticket purchase" toggle for private events

---

## Renderer behaviour

### Public route

`orkora.events/e/<slug>` reads `events.story_blocks` JSONB and renders block by block. Server-side rendered for SEO. Meta tags derived from the Hero block content and `event.bannerUrl`.

### Ticket picker persistence

The Tickets block is required in every Story Mode composition. If an organiser tries to remove it, the composer refuses with a message: "Every event page needs a way to buy tickets."

The floating "Get tickets" button appears once the user scrolls past the hero and hides only when the Tickets block is on screen. Tap scrolls to the picker.

### Analytics

- Impression per block: `story_mode.block_viewed { event_id, block_type, block_index }`. Uses IntersectionObserver.
- Scroll depth: `story_mode.scroll_depth { event_id, depth_percent }` on 25%, 50%, 75%, 100%.
- Ticket picker interaction: `story_mode.tickets_opened`, `story_mode.tickets_scrolled_to`.

### Performance

- LCP target: < 2.5s on 4G mid-tier phone
- Hero media lazy loaded below the fold; preloaded when Hero is a Video variant
- Fonts subset to used glyphs
- Images served via Next.js Image with brand-aware placeholder colours

---

## Editor UX

Route: `dashboard/events/<id>/story`. New route, tabbed under the event detail page.

### Layout

- Left rail (25%): block list with drag-drop reorder. Show block type icon, first 40 chars of content, add / delete affordances.
- Centre (55%): live preview with responsive frame toggle (desktop, tablet, mobile).
- Right rail (20%): properties panel for the selected block.

### First-time flow

1. Organiser creates an event.
2. Modal opens on event detail: "Compose your event story". Two buttons: "Pick a template" and "Skip for now".
3. Skip → Classic layout. Prompt reappears once per session for the next 3 visits.
4. Pick a template → template picker with visual previews of the four templates + Classic.
5. Template chosen → editor opens with the template's block sequence pre-populated.

### Block operations

- Add: "+" between any two blocks reveals a block-type picker.
- Duplicate: right-click / long-press on a block.
- Delete: X on the block header. Confirms.
- Reorder: drag from the block's grab handle in the left rail. Preview updates live.
- Hide: eye icon on the block header. Hidden blocks stay in the composition but do not render publicly.

### Save + publish

- Autosave to draft every 30s
- Explicit "Publish" button pushes changes live at `orkora.events/e/<slug>`
- "Preview" button opens the draft as a private URL (`orkora.events/e/<slug>?preview=<token>`) that renders the unpublished draft. Token expires in 24h.

### Templates as diffs

The four templates are not a lock-in; they are a starting point. Once an organiser starts editing, they own the composition. Switching templates mid-edit prompts a confirmation: "This will reset your composition. Continue?" Templates are seeds, not styles.

---

## Data model changes

### `events` table (extensions)

```sql
ALTER TABLE events
  ADD COLUMN story_blocks JSONB DEFAULT '[]',
  ADD COLUMN story_template VARCHAR(20) DEFAULT 'classic',
  ADD COLUMN story_published_at TIMESTAMPTZ;
```

### `story_blocks` JSONB shape

```json
[
  {
    "id": "blk_abc123",
    "type": "hero",
    "variant": "video",
    "hidden": false,
    "data": {
      "mediaUrl": "https://cdn.orkora.events/heroes/aurora-vol-5.mp4",
      "headline": "Aurora Vol. 5",
      "subheadline": "One night. One city. One sound.",
      "dateCityLine": "Saturday 22 August · Lagos",
      "ctaPrimaryText": "Get tickets",
      "ctaSecondaryText": "Add to calendar"
    }
  },
  {
    "id": "blk_def456",
    "type": "moodboard",
    "hidden": false,
    "data": {
      "tiles": [
        { "url": "...", "caption": "" },
        { "url": "...", "caption": "The lookbook" }
      ]
    }
  },
  { "id": "blk_ghi789", "type": "tickets", "hidden": false, "data": {} }
]
```

Block types listed above have their own per-type `data` schema. Documented in a shared TypeScript interface in `packages/contracts/src/story-blocks.ts`.

### API endpoints

- `GET /v1/public/events/<slug>` — returns event data with composed `story_blocks`. Public, CDN cache 60s.
- `PATCH /v1/organizations/<orgId>/events/<eventId>/story` — updates `story_blocks` and `story_template`. Guard: owner, admin, or organizer.
- `POST /v1/organizations/<orgId>/events/<eventId>/story/publish` — sets `story_published_at`.

---

## Migration plan

### Day-of-release

1. Migration 0007 adds `events.story_blocks`, `events.story_template`, `events.story_published_at`.
2. Backfill script generates a Classic-template `story_blocks` for every existing event: Hero (from banner) + Editorial paragraph (from description) + Agenda + Speakers + Tickets. Idempotent.
3. Every existing event page renders identically to before the release, but through the Story Mode renderer under the hood.
4. `story_template = 'classic'` on all existing events.

### For new events

- The event create form gains a "Story template" picker after the basic fields.
- Default selection: Classic (so existing muscle memory works).
- Featured templates: Editorial, Cinematic, Underground, Runway.

### Backwards compatibility

Every existing event public URL keeps working. Every existing event dashboard editing surface keeps working. The Story Mode composer is opt-in via the new "Story" tab in the event detail.

---

## Edge cases

- **Very long story composition**: no artificial block limit, but soft-warn if the page exceeds 15 blocks or 20MB of media.
- **All blocks hidden**: renderer shows a placeholder "This event is not ready for view yet." for public visitors; organisers see the composer.
- **Ticket block removed** (attempted): editor refuses at save time.
- **Media block with missing asset**: falls back to a placeholder tile with the media's alt text.
- **Preview token abused / shared**: 24h expiry, one-use recommendation (post-R1). For R1, 24h expiry is enough.

---

## What we are NOT building in R1

- Free-form block creation (custom HTML blocks, custom code blocks). Preset blocks only.
- Third-party embeds beyond Spotify / Apple Music / SoundCloud / YouTube. No arbitrary iframe.
- Version control / branching (multiple story drafts). One draft, one published.
- A/B testing of Story Mode variants. Post-R2.
- AI-assisted composition ("write this hero block for me"). Considered for R2.
- Import / export of story compositions. Copy-paste within an org's events only in R2.
- Fully-headless API for reading story blocks into an organiser's own site. Post-launch.

---

## Handoff checklist

- Figma file for all ten block types × three breakpoints
- Figma file for the four templates as complete example pages
- Component tokens for eight new components documented in Storybook
- Motion primitives documented (reveal, hover-lift, media play/pause)
- `story-blocks.ts` TypeScript interface published in `packages/contracts`
- Block-type icons designed (small monoline icons for the left-rail block list)
- Empty-state art for "This event is not ready yet"
- Loading skeletons for public Story Mode render
- Accessibility check: block reading order, keyboard nav for the editor, screen-reader labels on hero media
- OG image spec for Story Mode events (uses hero block media if set, `event.bannerUrl` fallback)
