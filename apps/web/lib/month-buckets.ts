// Month keys for the dashboard charts. The analytics API returns buckets keyed
// "YYYY-MM"; the charts pad those to a fixed window of recent months.
//
// Keys are built from the LOCAL year and month numbers. Do not route a locally
// constructed date through toISOString(): local midnight on the 1st is still the
// previous day in UTC for anyone east of Greenwich, so the key lands on the
// previous month and every bar shows the wrong month's count.

export interface MonthBucket {
  /** "YYYY-MM", matches the `month` field returned by the analytics API. */
  key: string;
  /** Short month name for the axis, e.g. "Sept". */
  label: string;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The last `count` calendar months ending with the month of `now`, oldest first. */
export function recentMonthBuckets(now: Date, count: number): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: monthKey(d),
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
    });
  }
  return out;
}
