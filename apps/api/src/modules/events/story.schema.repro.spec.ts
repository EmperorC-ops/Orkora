import { StoryCompositionSchema, hasVisibleTicketsBlock } from './story.schema';

/**
 * Reproduction harness for the production incident where every Story Mode save
 * on an event returned 400 "Invalid story composition", the stored composition
 * stayed empty, and the composer autosaved in a loop forever.
 *
 * These payloads are the exact shapes the deployed API rejected, captured off
 * the wire in the browser. Their only job is to answer one question:
 *
 *   Does the schema IN THIS REPO reject them too?
 *
 * If these tests PASS, the repo is fine and the API running on Render is not
 * this code. That is a deploy problem, not a code problem, and no amount of
 * editing the composer will fix it.
 *
 * If these tests FAIL, zod's issue list is printed below each failure and names
 * the offending field directly.
 *
 * Run:  npx jest story.schema.repro
 */

function explain(label: string, blocks: unknown): void {
  const parsed = StoryCompositionSchema.safeParse(blocks);
  if (parsed.success) {
    // eslint-disable-next-line no-console
    console.log(`ACCEPTED  ${label}  (visible tickets: ${hasVisibleTicketsBlock(parsed.data)})`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`REJECTED  ${label}\n${JSON.stringify(parsed.error.issues, null, 2)}`);
}

describe('story composition: production repro', () => {
  it('accepts an empty array (the array schema itself is not the problem)', () => {
    explain('empty array', []);
    expect(StoryCompositionSchema.safeParse([]).success).toBe(true);
  });

  it('accepts the minimum block: id and type only', () => {
    const blocks = [{ id: 'blk_probe000001', type: 'tickets' }];
    explain('id + type only', blocks);
    expect(StoryCompositionSchema.safeParse(blocks).success).toBe(true);
  });

  it('accepts the exact block the deployed API rejected with data stripped', () => {
    const blocks = [{ id: 'blk_f6d5d54691c9', type: 'tickets', hidden: false }];
    explain('captured tickets, data stripped', blocks);
    expect(StoryCompositionSchema.safeParse(blocks).success).toBe(true);
  });

  it('accepts a full eight-block cinematic composition with default data', () => {
    const blocks = [
      {
        id: 'blk_3ac6052db32c',
        type: 'hero',
        hidden: false,
        variant: 'image',
        data: {
          mediaUrl: null,
          mediaType: null,
          headline: '',
          subheadline: '',
          dateCityLine: '',
          ctaPrimaryText: 'Get tickets',
          ctaSecondaryText: 'Add to calendar',
        },
      },
      { id: 'blk_fe347b264130', type: 'editorial', hidden: false, data: { body: '', pullQuote: null, imageUrl: null } },
      { id: 'blk_88c6b9fa544e', type: 'moodboard', hidden: false, data: { tiles: [] } },
      {
        id: 'blk_0d4b44929130',
        type: 'cast',
        hidden: false,
        data: { variant: 'grid', columns: 3, people: [], useEventSpeakers: true },
      },
      {
        id: 'blk_a83af049f483',
        type: 'playlist',
        hidden: false,
        data: { variant: 'embed', provider: null, embedUrl: null, tracks: [] },
      },
      { id: 'blk_f6d5d54691c9', type: 'tickets', hidden: false, data: { heading: 'Tickets' } },
      { id: 'blk_8bb95eea70d4', type: 'agenda', hidden: false, data: { heading: 'Agenda' } },
      { id: 'blk_e345bdc6a044', type: 'faq', hidden: false, data: { heading: 'Questions', items: [] } },
    ];
    explain('full cinematic seed', blocks);
    const parsed = StoryCompositionSchema.safeParse(blocks);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(hasVisibleTicketsBlock(parsed.data)).toBe(true);
  });

  it('rejects a null variant, which is the trap .optional() does not cover', () => {
    const blocks = [{ id: 'blk_x', type: 'tickets', hidden: false, variant: null, data: {} }];
    explain('null variant (expected to be rejected)', blocks);
    expect(StoryCompositionSchema.safeParse(blocks).success).toBe(false);
  });

  it('rejects a null hidden, which .default() does not cover either', () => {
    const blocks = [{ id: 'blk_x', type: 'tickets', hidden: null, data: {} }];
    explain('null hidden (expected to be rejected)', blocks);
    expect(StoryCompositionSchema.safeParse(blocks).success).toBe(false);
  });

  it('records the zod version actually resolved, since v4 changed z.record', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const version = (require('zod/package.json') as { version: string }).version;
    // eslint-disable-next-line no-console
    console.log(`zod resolved at: ${version}`);
    expect(version.startsWith('3.')).toBe(true);
  });
});
