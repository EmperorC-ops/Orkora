#!/usr/bin/env node
// One-shot local dev bootstrap.
// Creates apps/api/.env, apps/web/.env, and the root .env if they don't exist,
// generates a fresh RSA keypair for JWT signing, and a strong refresh-token pepper.
// Idempotent: re-running will not overwrite existing .env files.

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function copyIfMissing(srcRel, destRel) {
  const src = resolve(root, srcRel);
  const dest = resolve(root, destRel);
  if (existsSync(dest)) {
    console.log(`  skip  ${destRel} (already exists)`);
    return false;
  }
  if (!existsSync(src)) {
    console.log(`  warn  ${srcRel} not found, cannot create ${destRel}`);
    return false;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src, 'utf8'));
  console.log(`  wrote ${destRel}`);
  return true;
}

function patchApiEnv() {
  const apiEnv = resolve(root, 'apps/api/.env');
  if (!existsSync(apiEnv)) {
    console.log('  warn  apps/api/.env was not created, skipping JWT injection');
    return;
  }
  let body = readFileSync(apiEnv, 'utf8');

  const needsKeys =
    /JWT_PRIVATE_KEY=\s*$/m.test(body) ||
    /JWT_PRIVATE_KEY=$/m.test(body) ||
    !/-----BEGIN/.test(body);
  const needsPepper = /REFRESH_TOKEN_PEPPER=change-me/.test(body) ||
    /REFRESH_TOKEN_PEPPER=\s*$/m.test(body);
  const ticketLine = body.match(/^TICKET_SIGNING_SECRET=(.*)$/m);
  const needsTicket =
    !ticketLine ||
    ticketLine[1].trim() === '' ||
    ticketLine[1].startsWith('change-me');

  if (!needsKeys && !needsPepper && !needsTicket) {
    console.log('  skip  apps/api/.env already has JWT keys, pepper, and ticket secret');
    return;
  }

  if (needsKeys) {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    // dotenv preserves newlines inside double-quoted values, which is what
    // passport-jwt + RS256 needs.
    body = body.replace(/JWT_PRIVATE_KEY=.*$/m, `JWT_PRIVATE_KEY="${privateKey.trim()}"`);
    body = body.replace(/JWT_PUBLIC_KEY=.*$/m, `JWT_PUBLIC_KEY="${publicKey.trim()}"`);
    console.log('  injected JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (RS256, 2048-bit)');
  }

  if (needsPepper) {
    const pepper = randomBytes(32).toString('hex');
    body = body.replace(/REFRESH_TOKEN_PEPPER=.*$/m, `REFRESH_TOKEN_PEPPER=${pepper}`);
    console.log('  injected REFRESH_TOKEN_PEPPER (32 random bytes)');
  }

  if (needsTicket) {
    const secret = randomBytes(32).toString('hex');
    if (/TICKET_SIGNING_SECRET=/.test(body)) {
      body = body.replace(/TICKET_SIGNING_SECRET=.*$/m, `TICKET_SIGNING_SECRET=${secret}`);
    } else {
      body = body.trimEnd() + `\nTICKET_SIGNING_SECRET=${secret}\n`;
    }
    console.log('  injected TICKET_SIGNING_SECRET (32 random bytes)');
  }

  writeFileSync(apiEnv, body);
}

console.log('Orkora dev bootstrap');
console.log('---');
copyIfMissing('.env.example', '.env');
copyIfMissing('apps/api/.env.example', 'apps/api/.env');
copyIfMissing('apps/web/.env.example', 'apps/web/.env');
patchApiEnv();
console.log('---');
console.log('Done. Next steps:');
console.log('  1. pnpm --filter @orkora/api exec prisma generate');
console.log('  2. pnpm db:seed');
console.log('  3. pnpm dev');
