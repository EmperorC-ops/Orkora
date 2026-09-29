// Regression test for lib/month-buckets.ts, which keys the dashboard charts.
//
// The bug it guards: keys were built with `new Date(y, m, 1).toISOString()`,
// which shifts to the previous month for every timezone east of UTC (including
// Africa/Lagos), so each bar showed the previous month's count.
//
// apps/web has no test runner, so this transpiles the real file from disk and
// runs it under plain Node (same approach as test-safe-redirect.mjs). The
// timezone has to be fixed before the process starts, so the parent re-runs
// this script once per timezone with TZ set.
//
// Run: pnpm --filter @orkora/web test:months   (or: node scripts/test-month-buckets.mjs)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TIMEZONES = ['Africa/Lagos', 'America/New_York', 'UTC', 'Pacific/Kiritimati'];
const self = fileURLToPath(import.meta.url);

if (!process.env.MONTH_BUCKETS_TZ) {
  let failed = false;
  for (const tz of TIMEZONES) {
    const res = spawnSync(process.execPath, [self], {
      env: { ...process.env, TZ: tz, MONTH_BUCKETS_TZ: tz },
      stdio: 'inherit',
    });
    if (res.status !== 0) failed = true;
  }
  if (failed) {
    console.error('month-buckets: FAILED');
    process.exit(1);
  }
  console.log(`month-buckets: all checks passed in ${TIMEZONES.length} timezones`);
  process.exit(0);
}

const tz = process.env.MONTH_BUCKETS_TZ;
const src = readFileSync(join(dirname(self), '..', 'lib', 'month-buckets.ts'), 'utf8');
let js;
if (typeof nodeModule.stripTypeScriptTypes === 'function') {
  js = nodeModule.stripTypeScriptTypes(src);
} else {
  const ts = nodeModule.createRequire(import.meta.url)('typescript');
  js = ts.transpileModule(src, { compilerOptions: { target: 99 /* ESNext */ } }).outputText;
}
js = js.replace(/^export /gm, '');
const { monthKey, recentMonthBuckets } = new Function(
  `${js}; return { monthKey, recentMonthBuckets };`,
)();

let failures = 0;
const same = (actual, expected, msg) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL [${tz}] ${msg}: expected ${e}, got ${a}`);
  }
};

// Guard against a silently ignored TZ: the run would pass without testing anything.
same(Intl.DateTimeFormat().resolvedOptions().timeZone, tz, 'timezone is applied');

// Local midnight on the 1st is the exact instant the old code got wrong.
same(monthKey(new Date(2026, 8, 1)), '2026-09', 'first of September, local midnight');
same(monthKey(new Date(2026, 0, 1)), '2026-01', 'first of January pads the month');
same(monthKey(new Date(2026, 11, 31, 23, 59, 59)), '2026-12', 'last second of December');

// Six-month window, as used by the dashboard chart.
const six = recentMonthBuckets(new Date(2026, 8, 29, 12, 0, 0), 6);
same(
  six.map((m) => m.key),
  ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
  'six month window ends on the current month',
);
// Each label must name the same month as its key (the old bug broke this pairing).
same(
  six.map((m) => m.label.slice(0, 3)),
  ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  'labels match keys',
);

// Twelve-month window across a year boundary, as used by the analytics chart.
const twelve = recentMonthBuckets(new Date(2026, 1, 15), 12);
same(twelve.length, 12, 'twelve month window length');
same(twelve[0].key, '2025-03', 'twelve month window starts in the previous year');
same(twelve[11].key, '2026-02', 'twelve month window ends on the current month');

// Month-end "now" must not skip or repeat a month (31 March minus one month).
same(
  recentMonthBuckets(new Date(2026, 2, 31, 23, 0, 0), 3).map((m) => m.key),
  ['2026-01', '2026-02', '2026-03'],
  'month-end does not skip February',
);

// Joining against API rows: the September count lands on the September bar.
const api = [
  { month: '2026-08', count: 101 },
  { month: '2026-09', count: 159 },
];
const joined = six.map((m) => api.find((r) => r.month === m.key)?.count ?? 0);
same(joined, [0, 0, 0, 0, 101, 159], 'API rows join onto the right bars');

if (failures > 0) process.exit(1);
console.log(`ok [${tz}]`);
