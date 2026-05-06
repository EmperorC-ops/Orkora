#!/bin/sh
# Production entrypoint.
# Schema.sql is the canonical source of truth, applied once at first boot
# of a brand-new database. Subsequent schema changes ship as numbered SQL
# files under /migrations and run via `psql` from a one-off shell, not from
# this entrypoint. We never run `prisma migrate deploy` because the project
# does not maintain a Prisma migration history.
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

# Optional one-time seed for the first preview boot.
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_BOOT=true; running seed"
  node prisma/seed.js || echo "[entrypoint] seed step failed (non-fatal)"
fi

echo "[entrypoint] starting API: $@"
exec "$@"
