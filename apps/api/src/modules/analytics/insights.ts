/**
 * Per-event Insights: slice an event's registrations by date, tier, status,
 * VIP and registration-form answers, and summarise what is left.
 *
 * Pure (no database), so the rules are unit tested directly. The service loads
 * one event's registrations (bounded) and hands them here.
 */

export interface InsightTicket {
  tierId: string;
  tierName: string;
  status: string;
  checkedInAt: Date | null;
}

export interface InsightRegistration {
  id: string;
  createdAt: Date;
  status: string;
  isVip: boolean;
  formResponses: Record<string, unknown>;
  tickets: InsightTicket[];
  /** Paid orders on this registration, minor units, by currency. */
  paid: Array<{ totalMinor: number; currency: string }>;
}

export interface InsightField {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

export interface InsightFilters {
  from?: Date | null;
  to?: Date | null;
  tierId?: string | null;
  status?: string | null;
  vip?: 'yes' | 'no' | null;
  fieldId?: string | null;
  fieldValue?: string | null;
}

export type GroupBy = 'tier' | 'status' | 'vip' | `field:${string}`;

/** Ticket states that hold a seat for a real attendee. */
const LIVE = new Set(['issued', 'checked_in']);

/** Fields that can be used to slice: answers drawn from a fixed set. */
export function sliceableFields(fields: InsightField[]): InsightField[] {
  return fields.filter((f) => f.type === 'select' || f.type === 'multiselect' || f.type === 'checkbox');
}

/** The answer(s) a registration gave to a field, as display strings. */
export function answersFor(reg: InsightRegistration, field: InsightField): string[] {
  const raw = reg.formResponses?.[field.id];
  if (raw === undefined || raw === null || raw === '') return [];
  if (field.type === 'checkbox') {
    return [raw === true || raw === 'true' || raw === 'yes' ? 'Yes' : 'No'];
  }
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  return [String(raw)];
}

export function matches(reg: InsightRegistration, f: InsightFilters, fields: InsightField[]): boolean {
  if (f.from && reg.createdAt < f.from) return false;
  if (f.to && reg.createdAt > f.to) return false;
  if (f.status && reg.status !== f.status) return false;
  if (f.vip === 'yes' && !reg.isVip) return false;
  if (f.vip === 'no' && reg.isVip) return false;
  if (f.tierId && !reg.tickets.some((t) => t.tierId === f.tierId)) return false;
  if (f.fieldId && f.fieldValue) {
    const field = fields.find((x) => x.id === f.fieldId);
    if (!field) return false;
    if (!answersFor(reg, field).includes(f.fieldValue)) return false;
  }
  return true;
}

/** Tickets of a registration that count under the filter (tier narrows it). */
function ticketsInScope(reg: InsightRegistration, f: InsightFilters): InsightTicket[] {
  return reg.tickets.filter((t) => LIVE.has(t.status) && (!f.tierId || t.tierId === f.tierId));
}

/** Local calendar parts of an instant in an IANA timezone. */
function localParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: get('hour'), minute: get('minute') };
}

export interface InsightsResult {
  totals: {
    registrations: number;
    tickets: number;
    checkedIn: number;
    checkInRate: number;
    vip: number;
    revenueByCurrency: Record<string, number>;
  };
  /** Registrations per local day, or per local hour when hourly is set. */
  series: Array<{ key: string; count: number }>;
  hourly: boolean;
  /** Check-ins per 15 minutes, local time. */
  arrivals: Array<{ key: string; count: number }>;
  breakdown: {
    groupBy: GroupBy;
    rows: Array<{ key: string; registrations: number; tickets: number; checkedIn: number }>;
  };
}

export function computeInsights(input: {
  registrations: InsightRegistration[];
  fields: InsightField[];
  filters: InsightFilters;
  groupBy: GroupBy;
  timeZone: string;
  /** Bucket the series by hour instead of day (short windows). */
  hourly?: boolean;
}): InsightsResult {
  const { filters, fields, timeZone } = input;
  const regs = input.registrations.filter((r) => matches(r, filters, fields));
  const sliceable = sliceableFields(fields);

  let tickets = 0;
  let checkedIn = 0;
  let vip = 0;
  const revenue: Record<string, number> = {};
  const series = new Map<string, number>();
  const arrivals = new Map<string, number>();
  const rows = new Map<string, { registrations: number; tickets: number; checkedIn: number }>();

  const groupKeys = (r: InsightRegistration, scoped: InsightTicket[]): string[] => {
    if (input.groupBy === 'tier') {
      const names = Array.from(new Set(scoped.map((t) => t.tierName)));
      return names.length ? names : ['No live ticket'];
    }
    if (input.groupBy === 'status') return [r.status];
    if (input.groupBy === 'vip') return [r.isVip ? 'VIP' : 'Not VIP'];
    const fieldId = input.groupBy.slice('field:'.length);
    const field = sliceable.find((x) => x.id === fieldId);
    if (!field) return ['Unknown question'];
    const answers = answersFor(r, field);
    return answers.length ? answers : ['No answer'];
  };

  for (const r of regs) {
    const scoped = ticketsInScope(r, filters);
    const arrived = scoped.filter((t) => t.checkedInAt);
    tickets += scoped.length;
    checkedIn += arrived.length;
    if (r.isVip) vip += 1;
    for (const p of r.paid) revenue[p.currency] = (revenue[p.currency] ?? 0) + p.totalMinor;

    const lp = localParts(r.createdAt, timeZone);
    const sKey = input.hourly ? `${lp.date} ${lp.hour}:00` : lp.date;
    series.set(sKey, (series.get(sKey) ?? 0) + 1);

    for (const t of arrived) {
      const ap = localParts(t.checkedInAt!, timeZone);
      const q = String(Math.floor(Number(ap.minute) / 15) * 15).padStart(2, '0');
      const aKey = `${ap.date} ${ap.hour}:${q}`;
      arrivals.set(aKey, (arrivals.get(aKey) ?? 0) + 1);
    }

    for (const key of groupKeys(r, scoped)) {
      const row = rows.get(key) ?? { registrations: 0, tickets: 0, checkedIn: 0 };
      row.registrations += 1;
      const inGroup = input.groupBy === 'tier' ? scoped.filter((t) => t.tierName === key) : scoped;
      row.tickets += inGroup.length;
      row.checkedIn += inGroup.filter((t) => t.checkedInAt).length;
      rows.set(key, row);
    }
  }

  const sorted = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }));

  return {
    totals: {
      registrations: regs.length,
      tickets,
      checkedIn,
      checkInRate: tickets ? Math.round((checkedIn / tickets) * 1000) / 10 : 0,
      vip,
      revenueByCurrency: revenue,
    },
    series: sorted(series),
    hourly: Boolean(input.hourly),
    arrivals: sorted(arrivals),
    breakdown: {
      groupBy: input.groupBy,
      rows: Array.from(rows.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.registrations - a.registrations || a.key.localeCompare(b.key)),
    },
  };
}

/** One CSV-safe cell: quoted when needed, and never starting a formula. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('; ') : String(value);
  // Spreadsheet formula injection: neutralise a leading = + - @ (and tab/CR).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
