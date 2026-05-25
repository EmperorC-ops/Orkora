#!/usr/bin/env node
// Forward-only SQL migration runner for Orkora.
//
// Why this exists: the database has SQL-only objects that schema.prisma does not
// model (the uuidv7() function, event_metrics, the event_daily_rollup
// materialized view, and the row-level-security policies). `prisma db push`
// diffs schema.prisma against the live DB and tries to DROP everything it does
// not know about, so it is unsafe on any real database. Instead:
//
//   - schema.sql is the canonical fresh-install script (full DDL + RLS).
//   - Every incremental change ships as a numbered, forward-only .sql file in
//     apps/api/migrations/ AND is folded into schema.sql for fresh installs.
//   - This runner applies any migrations not yet recorded in schema_migrations,
//     each inside its own transaction, under a Postgres advisory lock so
//     concurrent instances cannot race.
//
// Usage:
//   node scripts/migrate.mjs            apply all pending migrations
//   node scripts/migrate.mjs --status   list applied + pending, apply nothing
//   node scripts/migrate.mjs --url=...  override the connection string
//
// Connection string resolution: --url > $DATABASE_URL > DATABASE_URL in
// apps/api/.env (for local dev). Exit codes: 0 ok, 1 failure.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, '..', 'migrations');
const ENV_FILE = join(HERE, '..', '.env');
const LOCK_KEY = 727274; // arbitrary, stable advisory-lock id for migrations

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes('--status');
const urlArg = args.find((a) => a.startsWith('--url='));

function log(msg) {
  process.stdout.write(`[migrate] ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`[migrate] ERROR: ${msg}\n`);
  process.exit(1);
}

// Minimal .env loader so `pnpm db:migrate` works locally without dotenv. Does
// not override variables already present in the real environment (prod).
function loadDotEnv() {
  if (process.env.DATABASE_URL || !existsSync(ENV_FILE)) return;
  for (const raw of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function resolveConnectionString() {
  if (urlArg) return urlArg.slice('--url='.length);
  loadDotEnv();
  if (!process.env.DATABASE_URL) {
    fail('No connection string. Pass --url=... or set DATABASE_URL (or apps/api/.env).');
  }
  return process.env.DATABASE_URL;
}

// Neon and other hosted Postgres require TLS; local Postgres usually does not.
function sslFor(connectionString) {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  if (isLocal && !/sslmode=require/.test(connectionString)) return false;
  return { rejectUnauthorized: false };
}

function checksum(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function loadMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // lexicographic; zero-padded numeric prefixes sort correctly
    .map((file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      return { id: file, sql, checksum: checksum(sql) };
    });
}

async function main() {
  const connectionString = resolveConnectionString();
  const client = new Client({ connectionString, ssl: sslFor(connectionString) });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        id          text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )
    `);

    const files = loadMigrationFiles();
    const { rows: appliedRows } = await client.query(
      'select id, checksum from schema_migrations order by id',
    );
    const applied = new Map(appliedRows.map((r) => [r.id, r.checksum]));

    // Drift guard: a migration that was already applied must never be edited.
    for (const f of files) {
      const prev = applied.get(f.id);
      if (prev && prev !== f.checksum) {
        fail(
          `Migration ${f.id} was already applied but its contents changed ` +
            `(checksum mismatch). Forward-only migrations are immutable; add a new ` +
            `migration instead of editing this one.`,
        );
      }
    }

    const pending = files.filter((f) => !applied.has(f.id));

    if (STATUS_ONLY) {
      log(`${applied.size} applied, ${pending.length} pending`);
      for (const f of files) {
        log(`  ${applied.has(f.id) ? 'applied ' : 'PENDING '} ${f.id}`);
      }
      // Flag rows recorded in the DB whose file is missing from the repo.
      for (const id of applied.keys()) {
        if (!files.some((f) => f.id === id)) log(`  MISSING  ${id} (in DB, no file)`);
      }
      return;
    }

    if (pending.length === 0) {
      log('database is up to date; nothing to apply');
      return;
    }

    // Serialize concurrent runners (multiple instances deploying at once).
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      // Re-read applied set inside the lock in case another runner just finished.
      const { rows: freshRows } = await client.query('select id from schema_migrations');
      const freshApplied = new Set(freshRows.map((r) => r.id));
      for (const f of pending) {
        if (freshApplied.has(f.id)) {
          log(`skip ${f.id} (applied by a concurrent runner)`);
          continue;
        }
        log(`applying ${f.id} ...`);
        try {
          await client.query('begin');
          await client.query(f.sql);
          await client.query(
            'insert into schema_migrations (id, checksum) values ($1, $2)',
            [f.id, f.checksum],
          );
          await client.query('commit');
          log(`applied ${f.id}`);
        } catch (err) {
          await client.query('rollback').catch(() => {});
          fail(`migration ${f.id} failed and was rolled back: ${err.message}`);
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }

    log('all pending migrations applied');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => fail(err?.message ?? String(err)));
