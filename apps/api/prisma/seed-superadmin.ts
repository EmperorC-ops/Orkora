import { PrismaClient } from '@prisma/client';

/**
 * One-time bootstrap for the Orkora master account (platform super admin).
 *
 * Reads SUPERADMIN_EMAIL (required) and SUPERADMIN_NAME (optional) from the
 * environment, then creates that user with platformRole=superadmin, or promotes
 * the user if it already exists. The account has no password: sign in with the
 * passwordless "Email me a sign-in code" flow.
 *
 * Run against the target database, e.g.:
 *   SUPERADMIN_EMAIL=admin@orkora.events pnpm --filter @orkora/api run seed:superadmin
 *
 * It is idempotent and safe to re-run.
 */
async function main(): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    // eslint-disable-next-line no-console
    console.error('SUPERADMIN_EMAIL is not set. Set it and re-run. Aborting.');
    process.exit(1);
  }
  const fullName = process.env.SUPERADMIN_NAME?.trim() || 'Orkora Admin';

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { platformRole: 'superadmin', emailVerified: true },
      });
      // eslint-disable-next-line no-console
      console.log(`Promoted ${updated.email} to superadmin (id ${updated.id}).`);
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          fullName,
          platformRole: 'superadmin',
          emailVerified: true,
          locale: 'en-NG',
        },
      });
      // eslint-disable-next-line no-console
      console.log(
        `Created super admin ${created.email} (id ${created.id}). ` +
          'Sign in via "Email me a sign-in code".',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
