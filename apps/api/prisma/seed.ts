import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // eslint-disable-next-line no-console
  console.log('Seeding Orkora dev data...');

  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      slug: 'demo',
      name: 'Demo Organization',
      brandColor: '#6D28D9',
      countryCode: 'NG',
      plan: 'growth',
    },
  });

  const passwordHash = await argon2.hash('Demo1234!');
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.orkora.events' },
    update: {},
    create: {
      email: 'owner@demo.orkora.events',
      fullName: 'Demo Owner',
      passwordHash,
      emailVerified: true,
      locale: 'en-NG',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
    update: { role: 'owner' },
    create: { userId: owner.id, organizationId: org.id, role: 'owner' },
  });

  const event = await prisma.event.upsert({
    where: { code: 'DEMO2026' },
    update: {},
    create: {
      organizationId: org.id,
      code: 'DEMO2026',
      slug: 'demo-summit-2026',
      title: 'Demo Summit 2026',
      description: 'A seed event to try the platform end to end.',
      kind: 'hybrid',
      startAt: new Date('2026-06-01T09:00:00+01:00'),
      endAt: new Date('2026-06-02T18:00:00+01:00'),
      timezone: 'Africa/Lagos',
      capacity: 500,
      status: 'published',
      theme: { primary: '#6D28D9', accent: '#4C1D95' },
    },
  });

  await prisma.ticketTier.createMany({
    data: [
      {
        eventId: event.id,
        name: 'Free',
        priceMinor: BigInt(0),
        currency: 'NGN',
        quantityTotal: 200,
      },
      {
        eventId: event.id,
        name: 'Standard',
        priceMinor: BigInt(500000), // NGN 5,000
        currency: 'NGN',
        quantityTotal: 250,
        position: 1,
      },
      {
        eventId: event.id,
        name: 'VIP',
        priceMinor: BigInt(2500000), // NGN 25,000
        currency: 'NGN',
        quantityTotal: 50,
        position: 2,
      },
    ],
    skipDuplicates: true,
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete. Login: owner@demo.orkora.events / Demo1234!  Code: DEMO2026');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
