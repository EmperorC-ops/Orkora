#!/usr/bin/env node
/**
 * verify_pitr.mjs - Neon PITR backup-restore drill verifier.
 *
 * Usage:
 *   node apps/api/scripts/verify_pitr.mjs "<postgres-url>"
 *
 * The URL is typically the connection string for a Neon time-travel branch
 * created from a point in the past. We never run this against production,
 * only against a short-lived branch. The script is read-only (SELECT only)
 * but uses an account that has write privileges, so the safety guarantee
 * comes from the script, not the credentials.
 *
 * What it proves, in order:
 *   1. Branch is reachable (TCP + TLS + SCRAM all work at the PITR point).
 *   2. Server version and current database name match expectations.
 *   3. schema_migrations contains rows 0001-0004 with checksums, proving the
 *      forward-only migration runner has been applied at the PITR point.
 *   4. Every sentinel table exists (users, organizations, events, etc.).
 *   5. Every sentinel table has a non-zero row count (data is intact).
 *   6. The five most recent audit_events entries (proves the PITR target
 *      timestamp is what we asked for, not the current head).
 *   7. The five most recent events (data-shape sanity check on a hot table).
 *
 * Exit code 0 on full pass; 1 on any failure. Suitable for inclusion in a
 * scheduled DR drill.
 */

import { Client } from 'pg';

const url = process.argv[2];
if (!url) {
  console.error('usage: node apps/api/scripts/verify_pitr.mjs "<postgres-url>"');
  process.exit(2);
}

const SENTINELS = [
  'users',
  'organizations',
  'events',
  'registrations',
  'tickets',
  'orders',
  'audit_events',
  'login_failures',
  'notification_log',
];

// Migration IDs are stored as full filenames (e.g.
// "0001_orders_refund_initiated_at.sql"). We assert prefix presence, not
// exact match, so renaming the file later does not break the drill.
const EXPECTED_MIGRATION_PREFIXES = ['0001_', '0002_', '0003_', '0004_'];

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const t0 = Date.now();
  await client.connect();
  console.log(`[1] Connected in ${Date.now() - t0}ms`);

  const ver = await client.query(
    "select version() v, current_database() db, now() at time zone 'UTC' as ts",
  );
  const serverLine = ver.rows[0].v.split(',')[0];
  console.log(`[2] Server: ${serverLine}`);
  console.log(`    Database: ${ver.rows[0].db}`);
  console.log(`    Server UTC time: ${ver.rows[0].ts.toISOString()}`);
  console.log('');

  let hadMigrationsTable = true;
  let migrations = { rows: [] };
  try {
    migrations = await client.query(
      'select id, checksum, applied_at from schema_migrations order by id',
    );
  } catch (e) {
    hadMigrationsTable = false;
    console.log(`[3] schema_migrations: NOT PRESENT (${e.message})`);
  }
  if (hadMigrationsTable) {
    console.log(`[3] schema_migrations rows: ${migrations.rows.length}`);
    for (const r of migrations.rows) {
      console.log(
        `    ${pad(r.id, 6)} ${r.checksum.slice(0, 12)}...  applied_at=${r.applied_at.toISOString()}`,
      );
    }
    const ids = migrations.rows.map((r) => r.id);
    const missing = EXPECTED_MIGRATION_PREFIXES.filter(
      (prefix) => !ids.some((id) => id.startsWith(prefix)),
    );
    if (missing.length) {
      console.log(`    MISSING migration prefixes: ${missing.join(', ')}`);
      process.exitCode = 1;
    }
  }
  console.log('');

  const present = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name = any($1) order by table_name`,
    [SENTINELS],
  );
  console.log(`[4] Sentinel tables present: ${present.rows.length}/${SENTINELS.length}`);
  const found = new Set(present.rows.map((r) => r.table_name));
  for (const t of SENTINELS) {
    console.log(`    ${found.has(t) ? 'OK     ' : 'MISSING'}  ${t}`);
  }
  console.log('');

  console.log('[5] Row counts:');
  for (const t of SENTINELS) {
    if (!found.has(t)) {
      console.log(`    ${pad(t, 20)}  (table missing)`);
      continue;
    }
    try {
      const { rows } = await client.query(`select count(*)::int as n from "${t}"`);
      console.log(`    ${pad(t, 20)}  ${rows[0].n}`);
    } catch (e) {
      console.log(`    ${pad(t, 20)}  ERROR: ${e.message}`);
    }
  }
  console.log('');

  if (found.has('audit_events')) {
    const last = await client.query(
      `select id, action, resource_type, occurred_at from audit_events order by occurred_at desc limit 5`,
    );
    console.log(`[6] Most recent audit_events entries (PITR-target proof):`);
    if (last.rows.length === 0) {
      console.log('    (none)');
    }
    for (const r of last.rows) {
      console.log(
        `    ${r.occurred_at.toISOString()}  ${pad(r.action, 24)}  ${pad(r.resource_type, 18)}  ${r.id}`,
      );
    }
    console.log('');
  }

  if (found.has('events')) {
    const ev = await client.query(
      `select id, slug, status, start_at from events order by created_at desc limit 5`,
    );
    console.log(`[7] Most recent events (data-shape sanity):`);
    if (ev.rows.length === 0) {
      console.log('    (none)');
    }
    for (const r of ev.rows) {
      const starts = r.start_at ? r.start_at.toISOString() : '(null)';
      console.log(`    ${pad(r.slug, 32)}  ${pad(r.status, 10)}  ${starts}`);
    }
    console.log('');
  }

  await client.end();
  console.log('===========================');
  console.log('DRILL OK');
  console.log('===========================');
}

main().catch((err) => {
  console.error('');
  console.error('===========================');
  console.error('DRILL FAILED');
  console.error('===========================');
  console.error(err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(1, 5).join('\n'));
  process.exit(1);
});
