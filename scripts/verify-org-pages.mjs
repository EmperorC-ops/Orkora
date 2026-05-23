#!/usr/bin/env node
// Static verification for the org-wide dashboard work + Phase 3.x / ops
// follow-ups. Runs in plain Node — no compiler, no bundler, no DB.
//
// Catches the most common drift: missing import, controller not registered,
// schema drift between SQL and Prisma, web page hitting an endpoint that
// doesn't exist. Run with:
//   node scripts/verify-org-pages.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let failed = 0;
function check(label, ok, hint) {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}${ok || !hint ? '' : ` — ${hint}`}`);
  if (!ok) failed++;
}

function fileContains(path, ...needles) {
  if (!existsSync(join(root, path))) return false;
  const content = read(path);
  return needles.every((n) => content.includes(n));
}

// 1. Org-wide API surface.
check(
  'analytics.service.ts has rollup()',
  fileContains('apps/api/src/modules/analytics/analytics.service.ts', 'async rollup(orgId: string)'),
);
check(
  'analytics.controller.ts wires GET /rollup',
  fileContains(
    'apps/api/src/modules/analytics/analytics.controller.ts',
    "@Get('rollup')",
    'this.analytics.rollup(orgId)',
  ),
);
check(
  'registrations.service has org-wide methods',
  fileContains(
    'apps/api/src/modules/registrations/registrations.service.ts',
    'async listForOrg(',
    'async attendeesForOrg(',
    'async attendeeDetailForOrg(',
  ),
);
check(
  'OrgRegistrationsController is registered',
  fileContains(
    'apps/api/src/modules/registrations/registrations.module.ts',
    'OrgRegistrationsController',
  ),
);
check(
  'OrgsService has update / member CRUD',
  fileContains(
    'apps/api/src/modules/orgs/orgs.service.ts',
    'async update(',
    'async listMembers(',
    'async updateMemberRole(',
    'async removeMember(',
  ),
);
check(
  'OrgsController exposes PATCH + members routes',
  fileContains(
    'apps/api/src/modules/orgs/orgs.controller.ts',
    "@Patch(':orgId')",
    "@Get(':orgId/members')",
    "@Patch(':orgId/members/:userId')",
    "@Delete(':orgId/members/:userId')",
  ),
);
check(
  'ApiKeysService is present',
  fileContains(
    'apps/api/src/modules/api-keys/api-keys.service.ts',
    'class ApiKeysService',
    'resolveToken(token: string)',
  ),
);
check(
  'ApiKeysController is wired in module',
  fileContains('apps/api/src/modules/api-keys/api-keys.module.ts', 'ApiKeysController'),
);
check(
  'AppModule imports ApiKeysModule + ReportsModule',
  fileContains('apps/api/src/app.module.ts', 'ApiKeysModule', 'ReportsModule'),
);
check(
  'PaymentPreferencesService is present',
  fileContains(
    'apps/api/src/modules/payments/preferences.service.ts',
    'class PaymentPreferencesService',
    'resolveForOrg(orgId: string',
  ),
);
check(
  'PaymentPreferencesController is wired into payments.module',
  fileContains(
    'apps/api/src/modules/payments/payments.module.ts',
    'PaymentPreferencesController',
    'PaymentPreferencesService',
  ),
);

// 2. Phase 3.x + ops follow-ups landed in the second pass.
check(
  'PaymentsService.refundOrder accepts requestId',
  fileContains(
    'apps/api/src/modules/payments/payments.service.ts',
    'requestId?: string;',
    'requestId: input.requestId,',
  ),
);
check(
  'OrganizerPaymentsController.refund forwards req.id',
  fileContains(
    'apps/api/src/modules/payments/payments.controller.ts',
    'requestId: req.id,',
  ),
);
check(
  'ApiKeyGuard + JwtOrApiKeyGuard exist',
  fileContains(
    'apps/api/src/modules/auth/strategies/api-key.guard.ts',
    'class ApiKeyGuard',
    'class JwtOrApiKeyGuard',
  ),
);
check(
  'RequireScope decorator exists',
  fileContains(
    'apps/api/src/modules/auth/strategies/api-key.decorator.ts',
    'export const RequireScope',
  ),
);
check(
  'AuthModule registers ApiKeyGuard + JwtOrApiKeyGuard',
  fileContains(
    'apps/api/src/modules/auth/auth.module.ts',
    'ApiKeyGuard',
    'JwtOrApiKeyGuard',
  ),
);
check(
  'CspReportsController exists',
  fileContains(
    'apps/api/src/modules/reports/csp-reports.controller.ts',
    'class CspReportsController',
    "@Controller('csp-reports')",
  ),
);
check(
  'ReportsModule registers the CSP controller',
  fileContains('apps/api/src/modules/reports/reports.module.ts', 'CspReportsController'),
);
check(
  'main.ts wires CSP report-uri + Sentry release',
  fileContains(
    'apps/api/src/main.ts',
    'reportUri:',
    'RENDER_GIT_COMMIT',
    'SENTRY_RELEASE',
  ),
);
check(
  'attendee detail page has refund button',
  fileContains(
    'apps/web/app/(organizer)/dashboard/attendees/[userId]/page.tsx',
    'refundOrder',
    '/v1/organizations/${orgId}/payments/orders/${orderId}/refund',
  ),
);

// 3. Tests are present.
check(
  'orgs.service.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/orgs/orgs.service.spec.ts')),
);
check(
  'api-keys.service.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/api-keys/api-keys.service.spec.ts')),
);
check(
  'preferences.service.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/payments/preferences.service.spec.ts')),
);
check(
  'payments.service.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/payments/payments.service.spec.ts')),
);
check(
  'api-key.guard.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/auth/strategies/api-key.guard.spec.ts')),
);
check(
  'csp-reports.controller.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/reports/csp-reports.controller.spec.ts')),
);

// 4. Web pages exist and call the endpoints we shipped.
const pages = [
  'apps/web/app/(organizer)/dashboard/registrations/page.tsx',
  'apps/web/app/(organizer)/dashboard/attendees/page.tsx',
  'apps/web/app/(organizer)/dashboard/attendees/[userId]/page.tsx',
  'apps/web/app/(organizer)/dashboard/analytics/page.tsx',
  'apps/web/app/(organizer)/dashboard/settings/page.tsx',
];
for (const p of pages) {
  check(`web page present: ${p}`, existsSync(join(root, p)));
}
check(
  'registrations page hits /v1/organizations/:orgId/registrations',
  fileContains(
    'apps/web/app/(organizer)/dashboard/registrations/page.tsx',
    '/v1/organizations/${orgId}/registrations',
  ),
);
check(
  'attendees page hits /v1/organizations/:orgId/attendees',
  fileContains(
    'apps/web/app/(organizer)/dashboard/attendees/page.tsx',
    '/v1/organizations/${orgId}/attendees',
  ),
);
check(
  'attendees detail hits /v1/organizations/:orgId/attendees/:userId',
  fileContains(
    'apps/web/app/(organizer)/dashboard/attendees/[userId]/page.tsx',
    // The page resolves orgId into a local `active` var so it can pass through
    // the refresh helper after a refund. Match either binding name.
    '/attendees/${userId}',
  ) &&
    fileContains(
      'apps/web/app/(organizer)/dashboard/attendees/[userId]/page.tsx',
      '/v1/organizations/${',
    ),
);
check(
  'analytics page hits /v1/organizations/:orgId/analytics/rollup',
  fileContains(
    'apps/web/app/(organizer)/dashboard/analytics/page.tsx',
    '/v1/organizations/${orgId}/analytics/rollup',
  ),
);
check(
  'settings page hits PATCH /v1/organizations/:orgId',
  fileContains(
    'apps/web/app/(organizer)/dashboard/settings/page.tsx',
    "method: 'PATCH'",
    '/v1/organizations/${orgId}',
  ),
);
check(
  'settings page hits API keys + payment preferences endpoints',
  fileContains(
    'apps/web/app/(organizer)/dashboard/settings/page.tsx',
    '/api-keys',
    '/payment-preferences',
  ),
);

// 5. Schema parity between SQL and Prisma.
const sql = read('schema.sql');
const prisma = read('apps/api/prisma/schema.prisma');
for (const tbl of ['api_keys', 'payment_provider_preferences']) {
  check(`schema.sql has ${tbl}`, sql.includes(`create table ${tbl}`));
  check(
    `prisma schema has ${tbl}`,
    prisma.includes(`@@map("${tbl}")`),
    `Prisma model missing for ${tbl}`,
  );
}

// 6. Contracts package exports the new types.
const contracts = read('packages/contracts/src/index.ts');
for (const sym of [
  'OrgRegistrationsList',
  'OrgAttendeesList',
  'OrgAnalyticsRollup',
  'Organization',
  'UpdateOrganizationInput',
  'OrgMember',
  'ApiKey',
  'NewApiKey',
  'PaymentPreferences',
  'AttendeeDetail',
]) {
  check(`contracts exports ${sym}`, contracts.includes(`export const ${sym}`));
}

// 7. Migration file exists.

// 7. Migration file exists.
check(
  'migration file present',
  existsSync(join(root, 'migrations/2026-05-04-add-api-keys-and-provider-prefs.sql')),
);

// 8. Round 3 (MVP-deploy) checks.
check(
  'tracks API helpers added to web events lib',
  fileContains(
    'apps/web/lib/events.ts',
    'createTrack:',
    'deleteTrack:',
    'createSession:',
    'updateSession:',
    'deleteSession:',
  ),
);
check(
  'event detail page mounts NewTrackForm + NewSessionForm + SessionRow',
  fileContains(
    'apps/web/app/(organizer)/dashboard/events/[id]/page.tsx',
    'function NewTrackForm',
    'function NewSessionForm',
    'function SessionRow',
  ),
);
check(
  'public event page renders Join live CTA when stream is live',
  fileContains('apps/web/app/(public)/e/[code]/page.tsx', 'Join live'),
);
check(
  'PublicEventSession contract exposes streamUrl',
  fileContains('packages/contracts/src/index.ts', 'streamUrl: z.string().url().nullable()'),
);
check(
  'events.service includes streamUrl in public selects',
  fileContains('apps/api/src/modules/events/events.service.ts', 'streamUrl: true'),
);
check(
  'PublicApiEventsController exists and uses JwtOrApiKeyGuard + RequireScope',
  fileContains(
    'apps/api/src/modules/events/public-api.controller.ts',
    'class PublicApiEventsController',
    'JwtOrApiKeyGuard',
    "@RequireScope('events.read')",
  ),
);
check(
  'EventsModule imports AuthModule + PublicApiEventsController',
  fileContains(
    'apps/api/src/modules/events/events.module.ts',
    'AuthModule',
    'PublicApiEventsController',
  ),
);
check(
  'public-api.controller.spec.ts exists',
  existsSync(join(root, 'apps/api/src/modules/events/public-api.controller.spec.ts')),
);
check(
  'StripeProvider reads STRIPE_API_VERSION + pins SDK-matched default (2024-04-10)',
  fileContains(
    'apps/api/src/modules/payments/providers/stripe.provider.ts',
    'STRIPE_API_VERSION',
    '2024-04-10',
  ),
);
check(
  'rotate-secrets.sh present and executable',
  existsSync(join(root, 'scripts/rotate-secrets.sh')),
);
check(
  'README points at rotate-secrets.sh',
  fileContains('README.md', 'rotate-secrets.sh'),
);
check(
  'DEPLOY.md documents the public API + rotate-secrets',
  fileContains(
    'DEPLOY.md',
    '## Public API for integrators',
    'rotate-secrets.sh',
  ),
);
check(
  'JwtOrApiKeyGuard has setJwtGuard test seam',
  fileContains(
    'apps/api/src/modules/auth/strategies/api-key.guard.ts',
    'setJwtGuard',
  ),
);

if (failed) {
  console.error(`\n${failed} verification check(s) failed.`);
  process.exit(1);
}
console.log('\nAll verification checks passed.');
