"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2 = __importStar(require("argon2"));
const prisma = new client_1.PrismaClient();
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
//# sourceMappingURL=seed.js.map