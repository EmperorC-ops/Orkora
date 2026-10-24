import { answersFor, computeInsights, csvCell, matches, type InsightRegistration } from './insights';

const FIELDS = [
  { id: 'source', label: 'How did you hear?', type: 'select', options: ['WhatsApp', 'Instagram'] },
  { id: 'topics', label: 'Topics', type: 'multiselect', options: ['Leadership', 'Finance'] },
  { id: 'consent', label: 'Photos OK', type: 'checkbox' },
  { id: 'note', label: 'Anything else', type: 'long_text' },
];

function reg(over: Partial<InsightRegistration> & { id: string }): InsightRegistration {
  return {
    createdAt: new Date('2026-10-20T10:00:00Z'),
    status: 'confirmed',
    isVip: false,
    formResponses: {},
    tickets: [{ tierId: 't-ga', tierName: 'General', status: 'issued', checkedInAt: null }],
    paid: [],
    ...over,
  };
}

const REGS: InsightRegistration[] = [
  reg({
    id: 'r1',
    formResponses: { source: 'WhatsApp', topics: ['Leadership', 'Finance'], consent: true },
    tickets: [{ tierId: 't-ga', tierName: 'General', status: 'checked_in', checkedInAt: new Date('2026-10-24T08:07:00Z') }],
  }),
  reg({
    id: 'r2',
    createdAt: new Date('2026-10-21T23:30:00Z'), // 22 Oct 00:30 in Lagos
    isVip: true,
    formResponses: { source: 'Instagram', consent: false },
    tickets: [{ tierId: 't-vip', tierName: 'VIP', status: 'checked_in', checkedInAt: new Date('2026-10-24T08:20:00Z') }],
    paid: [{ totalMinor: 500000, currency: 'NGN' }],
  }),
  reg({
    id: 'r3',
    status: 'cancelled',
    formResponses: { source: 'WhatsApp' },
    tickets: [{ tierId: 't-ga', tierName: 'General', status: 'cancelled', checkedInAt: null }],
  }),
  reg({
    id: 'r4',
    formResponses: {},
    tickets: [
      { tierId: 't-ga', tierName: 'General', status: 'issued', checkedInAt: null },
      { tierId: 't-ga', tierName: 'General', status: 'checked_in', checkedInAt: new Date('2026-10-24T09:01:00Z') },
    ],
  }),
];

const run = (filters = {}, groupBy: Parameters<typeof computeInsights>[0]['groupBy'] = 'tier', hourly = false) =>
  computeInsights({ registrations: REGS, fields: FIELDS, filters, groupBy, timeZone: 'Africa/Lagos', hourly });

describe('Insights filters', () => {
  it('counts everything with no filter, live tickets only', () => {
    const r = run();
    expect(r.totals).toEqual({
      registrations: 4,
      tickets: 4,
      checkedIn: 3,
      checkInRate: 75,
      vip: 1,
      revenueByCurrency: { NGN: 500000 },
    });
  });

  it('filters by status, VIP and tier', () => {
    expect(run({ status: 'cancelled' }).totals.registrations).toBe(1);
    expect(run({ vip: 'yes' }).totals.registrations).toBe(1);
    expect(run({ vip: 'no' }).totals.registrations).toBe(3);
    const vipTier = run({ tierId: 't-vip' });
    expect(vipTier.totals.registrations).toBe(1);
    expect(vipTier.totals.tickets).toBe(1);
  });

  it('filters by a dropdown, multi-choice and checkbox answer', () => {
    expect(run({ fieldId: 'source', fieldValue: 'WhatsApp' }).totals.registrations).toBe(2);
    expect(run({ fieldId: 'topics', fieldValue: 'Finance' }).totals.registrations).toBe(1);
    expect(run({ fieldId: 'consent', fieldValue: 'No' }).totals.registrations).toBe(1);
  });

  it('filters by registration date', () => {
    expect(run({ from: new Date('2026-10-21T00:00:00Z') }).totals.registrations).toBe(1);
  });
});

describe('Insights series, arrivals and breakdowns', () => {
  it('buckets registrations by local day in the event timezone', () => {
    expect(run().series).toEqual([
      { key: '2026-10-20', count: 3 },
      { key: '2026-10-22', count: 1 },
    ]);
  });

  it('buckets check-ins by local 15 minutes', () => {
    expect(run().arrivals).toEqual([
      { key: '2026-10-24 09:00', count: 1 },
      { key: '2026-10-24 09:15', count: 1 },
      { key: '2026-10-24 10:00', count: 1 },
    ]);
  });

  it('breaks down by tier, with check-ins per tier', () => {
    const rows = run({}, 'tier').breakdown.rows;
    expect(rows).toEqual([
      { key: 'General', registrations: 2, tickets: 3, checkedIn: 2 },
      { key: 'No live ticket', registrations: 1, tickets: 0, checkedIn: 0 },
      { key: 'VIP', registrations: 1, tickets: 1, checkedIn: 1 },
    ]);
  });

  it('breaks down by a question, counting no answer separately', () => {
    const rows = run({}, 'field:source').breakdown.rows;
    expect(rows.map((r) => [r.key, r.registrations])).toEqual([
      ['WhatsApp', 2],
      ['Instagram', 1],
      ['No answer', 1],
    ]);
  });

  it('reads checkbox answers as Yes or No', () => {
    expect(answersFor(REGS[0]!, FIELDS[2]!)).toEqual(['Yes']);
    expect(answersFor(REGS[3]!, FIELDS[2]!)).toEqual([]);
  });

  it('ignores a filter on an unknown question', () => {
    expect(matches(REGS[0]!, { fieldId: 'nope', fieldValue: 'x' }, FIELDS)).toBe(false);
  });
});

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+2348012345678')).toBe("'+2348012345678");
  });

  it('joins arrays and blanks nulls', () => {
    expect(csvCell(['a', 'b'])).toBe('a; b');
    expect(csvCell(null)).toBe('');
  });
});
