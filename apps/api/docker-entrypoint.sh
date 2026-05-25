#!/bin/sh
# Production entrypoint.
# Schema.sql is the canonical source of truth, applied once at first boot of a
# brand-new database (BOOTSTRAP_SCHEMA=true). Subsequent schema changes ship as
# numbered, forward-only SQL files under /app/migrations and are applied by the
# migration runner (scripts/migrate.mjs) on every boot, tracked in the
# schema_migrations table and serialized with a Postgres advisory lock so
# concurrent instances cannot race. We never run `prisma migrate deploy` or
# `prisma db push`: the project keeps its DDL in schema.sql + migrations, and
# db push would try to drop the SQL-only objects (uuidv7(), event_metrics,
# event_daily_rollup, RLS policies) that schema.prisma does not model.
set -e

# Optional bootstrap: apply schema.sql when the DB is empty. Detects
# emptiness by checking for the well-known `users` table. Idempotent.
if [ "${BOOTSTRAP_SCHEMA:-false}" = "true" ]; then
  echo "[entrypoint] BOOTSTRAP_SCHEMA=true; checking if schema is already applied"
  HAS_USERS=$(node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect().then(() =>
      c.query(\"select to_regclass('public.users') as t\")
    ).then(r => {
      console.log(r.rows[0].t || '');
      return c.end();
    }).catch(e => { console.error(e.message); process.exit(2); });
  ")
  if [ -z "$HAS_USERS" ]; then
    echo "[entrypoint] schema is empty; applying schema.sql"
    node -e "
      const { Client } = require('pg');
      const fs = require('fs');
      const sql = fs.readFileSync('/app/schema.sql', 'utf8');
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      c.connect().then(() => c.query(sql)).then(() => c.end());
    "
  else
    echo "[entrypoint] schema already applied"
  fi
fi

# Apply any pending forward-only migrations before the app starts, so the
# running code never sees a database missing a column it expects. Safe to run on
# every boot and across multiple instances (advisory-locked, idempotent).
# Set RUN_MIGRATIONS_ON_BOOT=false to apply them out-of-band instead (e.g. a
# Render Pre-Deploy Command running `node scripts/migrate.mjs`).
if [ "${RUN_MIGRATIONS_ON_BOOT:-true}" = "true" ]; then
  echo "[entrypoint] applying pending migrations"
  node scripts/migrate.mjs
fi

# Optional one-time seed for the first preview boot.
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_BOOT=true; running seed"
  node prisma/seed.js || echo "[entrypoint] seed step failed (non-fatal)"
fi

echo "[entrypoint] starting API: $@"
exec "$@"
