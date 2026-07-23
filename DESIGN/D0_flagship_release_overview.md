# D0 · Flagship Release Overview

**Orkora for Event Brands · Release 1**

**Prepared:** 8 July 2026
**Owner:** Product + Design
**Target ship:** 6-8 weeks from kickoff
**Audience:** designers, engineers, marketing

---

## The frame

The category has moved. Event brands stopped selling tickets a while ago. They now sell social identity, cultural belonging, and worlds people want to be seen inside of. Every existing platform treats an event as a discrete transaction. Orkora is rebuilding the surface for how modern event brands actually work: as year-round worlds with audiences that compound, not as a series of ticket sales.

This release ships the three foundations of that reframe: a persistent public presence for the brand (Brand Home), a designed narrative surface for each event (Story Mode), and a growth loop built into every purchase (Shareable Ticket Cards). Together they turn Orkora from a ticketing platform into event brand infrastructure.

Three briefs follow this overview, one per feature. This document holds what is shared across all three: the design system update, the information architecture change, the sequencing of the ship, the migration plan for existing organisations, and the launch beat.

---

## What ships in Release 1

- **Brand Home** at `orkora.events/o/<brand-slug>`. See D1.
- **Story Mode** on every event page at `orkora.events/e/<event-slug>`. See D2.
- **Shareable Ticket Cards** delivered via the ticket page, the confirmation email, and the mobile app. See D3.

What is deliberately not in this release: Ambassador tools, Campaigns Series, on-day content capture, content-first analytics, Membership subscriptions. Those ship in Release 2 and later. Keeping the flagship tight matters more than covering the whole roadmap.

---

## Success metrics

The metric on this release is not tickets sold. It is:

- **Reach amplification per ticket sold**: number of Shareable Card views (via unique share URL) divided by number of tickets sold in the same window. Target above 3.0 in the first four weeks with launch partners.
- **Brand Home dwell**: median time-on-page for `orkora.events/o/<slug>`. Target above 30 seconds. If people land there and leave in 5 seconds, we did not build a home.
- **Story Mode adoption**: percentage of new events created with a Story Mode template other than "Classic". Target above 60% by week four.
- **Cross-event discovery**: percentage of ticket buyers who arrive on an event page via the org's Brand Home (not direct link, not paid). Target above 15%.

Tracked in analytics with `source=brand_home`, `source=shareable_card_ig`, etc. All events land in the existing analytics module; no new pipeline required.

---

## Shared design system update

The existing brand mark and colour palette do not change. The additions are:

### Motion primitives

- **Reveal**: 200ms ease-out on scroll for cards and sections in Brand Home and Story Mode. Uses IntersectionObserver, no library needed.
- **Hover-lift**: 8px translateY on hover for interactive cards, 150ms cubic-bezier.
- **Share-flash**: 300ms saturate boost + brief scale-up on Shareable Card generation.

### Typography scale extension

Story Mode needs two heading weights the current design system does not have:

- **Display XL**: 72px / 80px line-height / -0.03em tracking / 700 weight. For Story Mode hero.
- **Display L**: 56px / 62px / -0.02em / 700. For Brand Home hero.
- **Editorial**: 22px / 34px / -0.005em / 400. For pull-quotes and hero sub-copy.

Existing scale is preserved for body and dashboard surfaces.

### Component additions

Design system gains eight new components. Detailed specs in D1, D2, D3:

- HeroMediaBlock (video or image, cinematic 21:9 crop, gradient overlay)
- EditorialParagraph (large body copy with pull-quote support)
- CardGrid (2-4 col responsive, used for artists, collabs, past events)
- Moodboard (masonry 3-6 items, click to expand)
- PlaylistEmbed (Spotify / Apple Music / SoundCloud, uniform card)
- BrandHome SocialsBar (Instagram, TikTok, X, WhatsApp channel)
- ShareableCardCanvas (SVG-driven, brand-styled, exports to PNG)
- StoryBlockEditor (block-based editor shell, DnD reorder)

### Colour surface rules for Story Mode

Brands upload a `brandColor` today. Story Mode adds a secondary and a surface colour:

- `brandColor`: primary interactive (buttons, links). Existing.
- `brandAccent`: hover, secondary CTA. New. Auto-derived from `brandColor` shifted 15% hue if not set.
- `brandSurface`: page background for Brand Home and Story Mode dark sections. New. Defaults to Orkora's surface-deep if not set.

All three are set in Org Settings → Brand. Editor shows a preview.

---

## Information architecture changes

### New public routes

- `orkora.events/o/<brand-slug>` — Brand Home. New.
- `orkora.events/e/<event-slug>` — Event page. Existing route, now with Story Mode composition.
- `orkora.events/o/<brand-slug>/past` — full archive of past events. New. Linked from Brand Home.
- `orkora.events/t/<code>` — ticket page. Existing, gets Shareable Card share sheet added.

### Editor routes (organiser-facing)

- `/dashboard/branding` — existing Brand tab, extended with Brand Home composer.
- `/dashboard/events/<id>/story` — new route. Story Mode block editor.
- `/dashboard/events/<id>` — existing event detail, gains a "Story Mode" tab in the header nav.

### Sitemap changes

- Brand Homes indexed at `/sitemap.xml`
- Event pages indexed with Story Mode meta (og:image from hero block)
- Ticket pages remain noindex

---

## Migration plan for existing organisations and events

The three features must land without breaking any existing organisation or event.

### Existing organisations

Every org gets a **default Brand Home** rendered from data already in the database on the day of release:

- Header: `org.logoUrl`, `org.name`, `org.brandColor`
- Hero: gradient background from `brandColor` with `org.name` in Display L. No image required for the default.
- Upcoming: pulled from `events` where status = 'published' and endAt > now
- Past: pulled from `events` where status = 'published' and endAt < now
- No community signup by default

Organisers see a blue "Compose your Brand Home" banner in the dashboard for two weeks after release, prompting them into the editor. Non-composers keep the default forever; nothing breaks.

### Existing events

Every event gets a **Story Mode "Classic" auto-composition** on the day of release:

- Hero block: the current banner + event title + date
- Text block: current `description`
- Agenda block: current tracks and sessions
- Speakers block: current speakers
- Ticket block: current tiers

This is exactly what today's page renders, expressed as story blocks. Organisers see a "Compose your event story" prompt in the event dashboard. Non-composers keep the Classic layout forever.

Data migration writes `events.storyBlocks` JSONB column populated from the current shape. One-time migration, idempotent, safe to re-run.

### Existing tickets

No migration. Shareable Cards are generated on demand from existing ticket data.

---

## Sequencing (6-8 week ship)

Suggested critical path. Feature teams can parallelise where possible.

### Week 1

- Design: finalise Story Mode block system (D2) as the highest-risk piece. Do this in Figma before any code.
- Design: audit existing brand colour palette. Confirm four presets for Story Mode templates read well against `brandColor` variations.
- Engineering: schema migration for `orgs.bio`, `orgs.socials`, `orgs.heroMediaUrl`, `orgs.brandAccent`, `orgs.brandSurface`, `events.storyBlocks`.

### Week 2-3

- Engineering + Design: Brand Home (D1). Public route, default renderer, editor.
- Engineering: Shareable Card generation service (D3). Server-side SVG composition, PNG export.

### Week 3-4

- Engineering + Design: Story Mode public renderer (D2). Reads `events.storyBlocks`, outputs page.
- Engineering: Ticket page share sheet, confirmation email integration (D3).

### Week 4-5

- Engineering + Design: Story Mode editor (D2). Block-based composer, drag-drop reorder, template picker.
- Engineering + Design: Brand Home editor (D1). Composer that mirrors Story Mode's block system.

### Week 5-6

- QA: end-to-end tests for all three features against a real launch partner's actual event.
- Marketing: draft launch blog post (already in COPY/03), prep social assets, brief three launch partners.
- Migration script rehearsal on staging.

### Week 6-7

- Ship migration to prod. Feature flag on for launch partners; observe for 5 days.
- Address any bugs, monitor Sentry.

### Week 7-8

- Public launch: feature flag flipped for all organisations. Blog post published. Announcement to campaign audience. Launch partners' case studies published in the same week.

---

## Feature flag strategy

Three flags, one per feature. Naming: `feat.brand_home`, `feat.story_mode`, `feat.shareable_cards`.

- Default off for existing organisations for the first two weeks.
- On for the three named launch partners from day one.
- On for all new signups from week two (they never saw the old surface, no migration surprise).
- On for everyone at week four, feature flags removed shortly after.

Flags live in `apps/web/lib/flags.ts` (new file). Read from either a static config or a `feature_flags` env-based override. Not a full LaunchDarkly-style system; a single-file registry is enough for this release.

---

## Analytics events shipped with this release

Add to the existing analytics pipeline. Naming: `<surface>.<action>`.

- `brand_home.viewed` (org id, viewer session id, source)
- `brand_home.edited` (org id, block type, block count)
- `story_mode.template_picked` (event id, template name)
- `story_mode.block_added` (event id, block type)
- `story_mode.published` (event id, block count)
- `shareable_card.generated` (ticket id, format)
- `shareable_card.viewed` (ticket id, format, source domain)
- `shareable_card.downloaded` (ticket id, format)

Cross-event discovery attribution: any event page arrived at from a Brand Home stamps `?source=brand_home` on the URL; analytics groups by source.

---

## Risks and open questions

### Risks

- **Story Mode block editor complexity**: block-based editors are notoriously easy to underestimate. Ship the RENDERER first (which reads static JSONB), keep the EDITOR simple (four preset templates plus reorder, not a full Notion clone).
- **Shareable Card generation cost**: server-side image generation is CPU-heavy. Cache aggressively per ticket + format; regenerate only if the event artwork changes.
- **Brand Home SEO**: bad meta tags or poor performance would hurt discovery. Ship with proper OG, robots, and sitemap. Lighthouse >= 90 target.
- **Migration on production**: `events.storyBlocks` writes must be idempotent and reversible. Rehearse on staging with a copy of production data.

### Open questions

1. Does an organisation's Brand Home ever go dark? What happens if all their events are archived? Recommendation: still show the home with a "No upcoming events. Sign up to know when we announce the next one." card.
2. Do we let organisations disable Story Mode and stay on the Classic renderer forever? Recommendation: yes, first-class option. Not everyone wants a scroll-narrative.
3. Do Shareable Cards require branding upgrades (custom fonts)? Recommendation: start with a hard-coded typographic scale that works with any `brandColor`. Custom fonts land in Release 2.
4. Multilingual copy on Brand Home and Story Mode: does the current pipeline support locale switching? If not, English-only in Release 1, i18n in Release 3.

---

## What good looks like at the end of Release 1

- Three named launch partners running their next edition on the new stack with public case studies
- 60%+ of new events created in Story Mode (not Classic)
- 15%+ of ticket buyers arriving via a Brand Home
- Reach amplification per ticket > 3.0x from Shareable Cards
- Zero data-loss incidents from migration
- The blog post publishes on schedule with real screenshots and real testimonials
- Investor deck can be rebuilt against real numbers, not projections
