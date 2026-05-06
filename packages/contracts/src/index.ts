import { z } from 'zod';

/**
 * Shared Zod schemas. Both API (Nest) and clients (Next, Expo) import from here.
 * If you change a shape, every TypeScript consumer breaks at compile time.
 */

// ===== Enums =====

export const EventKind = z.enum(['physical', 'virtual', 'hybrid']);
export type EventKind = z.infer<typeof EventKind>;

export const EventStatus = z.enum(['draft', 'published', 'live', 'ended', 'archived']);
export type EventStatus = z.infer<typeof EventStatus>;

export const Role = z.enum(['owner', 'admin', 'organizer', 'staff', 'vendor', 'attendee']);
export type Role = z.infer<typeof Role>;

export const OtpChannel = z.enum(['email', 'sms']);
export type OtpChannel = z.infer<typeof OtpChannel>;

export const OtpPurpose = z.enum(['signup', 'login', 'payment_confirm', 'phone_verify']);
export type OtpPurpose = z.infer<typeof OtpPurpose>;

export const SocialProvider = z.enum(['google', 'apple']);
export type SocialProvider = z.infer<typeof SocialProvider>;

// ===== Auth =====

export const SignupInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  phone: z.string().optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const TokenBundle = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
export type TokenBundle = z.infer<typeof TokenBundle>;

export const SendOtpInput = z.object({
  channel: OtpChannel,
  destination: z.string().min(3),
  purpose: OtpPurpose,
});
export type SendOtpInput = z.infer<typeof SendOtpInput>;

export const VerifyOtpInput = z.object({
  destination: z.string().min(3),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  purpose: OtpPurpose,
});
export type VerifyOtpInput = z.infer<typeof VerifyOtpInput>;

export const SocialLoginInput = z.object({
  provider: SocialProvider,
  idToken: z.string().min(20),
});
export type SocialLoginInput = z.infer<typeof SocialLoginInput>;

// ===== Events (public read shape) =====

export const PublicEventTier = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  quantityTotal: z.number().int().nullable(),
  quantitySold: z.number().int().default(0),
  minPerOrder: z.number().int(),
  maxPerOrder: z.number().int(),
  saleStartsAt: z.string().nullable(),
  saleEndsAt: z.string().nullable(),
  isGroup: z.boolean(),
  groupSize: z.number().int().nullable(),
  position: z.number().int(),
});
export type PublicEventTier = z.infer<typeof PublicEventTier>;

export const PublicEventTrack = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
});
export type PublicEventTrack = z.infer<typeof PublicEventTrack>;

export const PublicEventSession = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  trackId: z.string().uuid().nullable(),
  streamUrl: z.string().url().nullable().optional(),
});
export type PublicEventSession = z.infer<typeof PublicEventSession>;

export const PublicEventSpeaker = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  socialLinks: z.record(z.string()).default({}),
});
export type PublicEventSpeaker = z.infer<typeof PublicEventSpeaker>;

export const PublicEvent = z.object({
  id: z.string().uuid(),
  code: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  kind: EventKind,
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string(),
  bannerUrl: z.string().url().nullable(),
  theme: z.record(z.unknown()).default({}),
  status: EventStatus,
  organization: z.object({
    name: z.string(),
    logoUrl: z.string().url().nullable().optional(),
    brandColor: z.string().nullable().optional(),
    slug: z.string().optional(),
  }),
  tracks: z.array(PublicEventTrack).optional(),
  sessions: z.array(PublicEventSession).optional(),
  speakers: z.array(PublicEventSpeaker).optional(),
  tiers: z.array(PublicEventTier).optional(),
});
export type PublicEvent = z.infer<typeof PublicEvent>;

// ===== Events (organizer write shape) =====

export const CreateEventInput = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(4000).optional(),
  kind: EventKind,
  startAt: z.string(),
  endAt: z.string(),
  timezone: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  bannerUrl: z.string().url().optional(),
  theme: z.record(z.unknown()).optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventInput>;

export const UpdateEventInput = CreateEventInput.partial();
export type UpdateEventInput = z.infer<typeof UpdateEventInput>;

export const OrganizerEventSummary = z.object({
  id: z.string().uuid(),
  code: z.string(),
  slug: z.string(),
  title: z.string(),
  kind: EventKind,
  startAt: z.string(),
  endAt: z.string(),
  status: EventStatus,
  bannerUrl: z.string().nullable(),
  capacity: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OrganizerEventSummary = z.infer<typeof OrganizerEventSummary>;

// ===== Tracks / Sessions / Speakers =====

export const CreateTrackInput = z.object({
  name: z.string().min(1).max(60),
  color: z.string().optional(),
});
export type CreateTrackInput = z.infer<typeof CreateTrackInput>;

export const CreateSessionInput = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  trackId: z.string().uuid().optional(),
  startAt: z.string(),
  endAt: z.string(),
  streamUrl: z.string().url().optional(),
  capacity: z.number().int().positive().optional(),
  requiresRsvp: z.boolean().optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInput>;

export const UpdateSessionInput = CreateSessionInput.partial().extend({
  trackId: z.string().uuid().nullable().optional(),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;

export const CreateSpeakerInput = z.object({
  fullName: z.string().min(2).max(120),
  title: z.string().optional(),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional(),
  socialLinks: z.record(z.string()).optional(),
});
export type CreateSpeakerInput = z.infer<typeof CreateSpeakerInput>;

// ===== Ticket tiers =====

export const CreateTicketTierInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3).optional(),
  quantityTotal: z.number().int().positive().optional(),
  minPerOrder: z.number().int().positive().optional(),
  maxPerOrder: z.number().int().positive().optional(),
  saleStartsAt: z.string().optional(),
  saleEndsAt: z.string().optional(),
  isGroup: z.boolean().optional(),
  groupSize: z.number().int().min(2).optional(),
  position: z.number().int().optional(),
});
export type CreateTicketTierInput = z.infer<typeof CreateTicketTierInput>;

export const UpdateTicketTierInput = CreateTicketTierInput.partial();
export type UpdateTicketTierInput = z.infer<typeof UpdateTicketTierInput>;

export const ReorderTiersInput = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int(),
    }),
  ),
});
export type ReorderTiersInput = z.infer<typeof ReorderTiersInput>;

// ===== Registrations =====

export const PaymentMethod = z.enum(['free', 'stripe', 'paystack', 'flutterwave']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const AttendeeInput = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
});
export type AttendeeInput = z.infer<typeof AttendeeInput>;

export const RegisterAttendeesInput = z.object({
  tierId: z.string().uuid(),
  attendees: z.array(AttendeeInput).min(1).max(50),
  paymentMethod: PaymentMethod.optional(),
  formResponses: z.record(z.unknown()).optional(),
});
export type RegisterAttendeesInput = z.infer<typeof RegisterAttendeesInput>;

export const RegistrationStatus = z.enum(['pending', 'confirmed', 'cancelled']);
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

export const TicketStatus = z.enum(['pending', 'issued', 'checked_in', 'cancelled']);
export type TicketStatus = z.infer<typeof TicketStatus>;

export const IssuedTicket = z.object({
  id: z.string().uuid(),
  code: z.string(),
  holderName: z.string(),
  holderEmail: z.string().email(),
  status: z.string(),
  tierName: z.string(),
  qrToken: z.string(),
});
export type IssuedTicket = z.infer<typeof IssuedTicket>;

export const OrderSummary = z.object({
  id: z.string().uuid(),
  status: z.string(),
  currency: z.string(),
  totalMinor: z.number(),
  provider: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
});
export type OrderSummary = z.infer<typeof OrderSummary>;

export const RegistrationResult = z.object({
  registrationId: z.string().uuid(),
  status: z.string(),
  userId: z.string().uuid(),
  eventId: z.string().uuid(),
  eventCode: z.string(),
  tickets: z.array(IssuedTicket),
  order: OrderSummary.nullable(),
});
export type RegistrationResult = z.infer<typeof RegistrationResult>;

export const PublicTicket = z.object({
  id: z.string().uuid(),
  code: z.string(),
  holderName: z.string(),
  holderEmail: z.string().email(),
  status: z.string(),
  issuedAt: z.string(),
  checkedInAt: z.string().nullable(),
  tier: z.object({ id: z.string().uuid(), name: z.string() }),
  event: z.object({
    id: z.string().uuid(),
    title: z.string(),
    code: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    bannerUrl: z.string().nullable(),
    timezone: z.string(),
  }),
  registrationId: z.string().uuid(),
  qrToken: z.string(),
});
export type PublicTicket = z.infer<typeof PublicTicket>;

// ===== Payments =====

export const CheckoutSessionResponse = z.object({
  url: z.string().url(),
  provider: z.string(),
});
export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponse>;

export const OrderStatusView = z.object({
  id: z.string().uuid(),
  status: z.string(),
  currency: z.string(),
  totalMinor: z.number(),
  provider: z.string().nullable(),
  paidAt: z.string().nullable(),
  event: z.object({ title: z.string(), code: z.string() }).nullable(),
  tickets: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      holderName: z.string(),
      status: z.string(),
      tier: z.object({ name: z.string() }),
    }),
  ),
});
export type OrderStatusView = z.infer<typeof OrderStatusView>;

export const PaymentMethodsResponse = z.object({
  methods: z.array(z.string()),
  recommended: z.string().nullable(),
});
export type PaymentMethodsResponse = z.infer<typeof PaymentMethodsResponse>;

export const RegistrationRow = z.object({
  id: z.string().uuid(),
  status: z.string(),
  createdAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
  }),
  tickets: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      holderName: z.string(),
      holderEmail: z.string().email(),
      status: z.string(),
      tier: z.object({ id: z.string().uuid(), name: z.string() }),
    }),
  ),
});
export type RegistrationRow = z.infer<typeof RegistrationRow>;

// ===== Org-wide dashboard rollups =====

export const OrgRegistrationRow = z.object({
  id: z.string().uuid(),
  status: z.string(),
  createdAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().nullable(),
  }),
  event: z.object({
    id: z.string().uuid(),
    title: z.string(),
    code: z.string(),
  }),
  tickets: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      holderName: z.string(),
      holderEmail: z.string().email(),
      status: z.string(),
      tier: z.object({ id: z.string().uuid(), name: z.string() }),
    }),
  ),
});
export type OrgRegistrationRow = z.infer<typeof OrgRegistrationRow>;

export const OrgRegistrationsList = z.object({
  total: z.number().int(),
  take: z.number().int(),
  skip: z.number().int(),
  rows: z.array(OrgRegistrationRow),
});
export type OrgRegistrationsList = z.infer<typeof OrgRegistrationsList>;

export const OrgAttendeeRow = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  eventsAttended: z.number().int(),
  ticketCount: z.number().int(),
  totalSpentMinor: z.number().int(),
  primaryCurrency: z.string().nullable(),
  lastRegisteredAt: z.string().nullable(),
});
export type OrgAttendeeRow = z.infer<typeof OrgAttendeeRow>;

export const OrgAttendeesList = z.object({
  total: z.number().int(),
  take: z.number().int(),
  skip: z.number().int(),
  rows: z.array(OrgAttendeeRow),
});
export type OrgAttendeesList = z.infer<typeof OrgAttendeesList>;

export const OrgAnalyticsRollup = z.object({
  totals: z.object({
    eventsCount: z.number().int(),
    registrationsTotal: z.number().int(),
    paidOrdersCount: z.number().int(),
    pendingOrdersCount: z.number().int(),
    ticketsIssued: z.number().int(),
    checkedIn: z.number().int(),
    messagesCount: z.number().int(),
    revenueByCurrency: z.record(z.number()),
  }),
  funnel: z.object({
    registrations: z.number().int(),
    paidOrders: z.number().int(),
    ticketsIssued: z.number().int(),
    checkedIn: z.number().int(),
  }),
  monthly: z.array(
    z.object({
      month: z.string(),
      registrations: z.number().int(),
      paidOrders: z.number().int(),
      revenueMinor: z.number().int(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      code: z.string(),
      status: z.string(),
      startAt: z.string().nullable(),
      registrations: z.number().int(),
      paidOrders: z.number().int(),
      revenueMinor: z.number().int(),
      currency: z.string().nullable(),
      checkedIn: z.number().int(),
    }),
  ),
});
export type OrgAnalyticsRollup = z.infer<typeof OrgAnalyticsRollup>;

export const Organization = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  brandColor: z.string().nullable(),
  plan: z.string(),
  countryCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const UpdateOrganizationInput = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/)
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  countryCode: z.string().length(2).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInput>;

export const OrgMember = z.object({
  id: z.string().uuid(),
  role: z.string(),
  joinedAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  }),
});
export type OrgMember = z.infer<typeof OrgMember>;

export const ApiKey = z.object({
  id: z.string().uuid(),
  name: z.string(),
  lastFour: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
  }),
});
export type ApiKey = z.infer<typeof ApiKey>;

export const NewApiKey = ApiKey.omit({
  lastUsedAt: true,
  revokedAt: true,
  createdBy: true,
}).extend({
  // Plaintext token, returned once on creation only.
  token: z.string(),
});
export type NewApiKey = z.infer<typeof NewApiKey>;

export const PaymentPreferences = z.object({
  enabledProviders: z.array(z.string()),
  preferences: z.array(
    z.object({
      currency: z.string(),
      provider: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type PaymentPreferences = z.infer<typeof PaymentPreferences>;

export const AttendeeDetail = z.object({
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
  }),
  stats: z.object({
    eventsAttended: z.number().int(),
    ticketCount: z.number().int(),
    totalSpentByCurrency: z.record(z.number()),
  }),
  registrations: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.string(),
      createdAt: z.string(),
      event: z.object({
        id: z.string().uuid(),
        title: z.string(),
        code: z.string(),
        startAt: z.string().nullable(),
      }),
      tickets: z.array(
        z.object({
          id: z.string().uuid(),
          code: z.string(),
          status: z.string(),
          tier: z.string(),
        }),
      ),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.string(),
      currency: z.string(),
      totalMinor: z.number(),
      provider: z.string().nullable(),
      createdAt: z.string(),
      paidAt: z.string().nullable(),
      eventId: z.string().uuid(),
    }),
  ),
});
export type AttendeeDetail = z.infer<typeof AttendeeDetail>;

// ===== Org-wide dashboard rollups =====

export const OrgRegistrationRow = z.object({
  id: z.string().uuid(),
  status: z.string(),
  createdAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    avatarUrl: z.string().nullable(),
  }),
  event: z.object({
    id: z.string().uuid(),
    title: z.string(),
    code: z.string(),
  }),
  tickets: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      holderName: z.string(),
      holderEmail: z.string().email(),
      status: z.string(),
      tier: z.object({ id: z.string().uuid(), name: z.string() }),
    }),
  ),
});
export type OrgRegistrationRow = z.infer<typeof OrgRegistrationRow>;

export const OrgRegistrationsList = z.object({
  total: z.number().int(),
  take: z.number().int(),
  skip: z.number().int(),
  rows: z.array(OrgRegistrationRow),
});
export type OrgRegistrationsList = z.infer<typeof OrgRegistrationsList>;

export const OrgAttendeeRow = z.object({
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().nullable(),
  eventsAttended: z.number().int(),
  ticketCount: z.number().int(),
  totalSpentMinor: z.number().int(),
  primaryCurrency: z.string().nullable(),
  lastRegisteredAt: z.string().nullable(),
});
export type OrgAttendeeRow = z.infer<typeof OrgAttendeeRow>;

export const OrgAttendeesList = z.object({
  total: z.number().int(),
  take: z.number().int(),
  skip: z.number().int(),
  rows: z.array(OrgAttendeeRow),
});
export type OrgAttendeesList = z.infer<typeof OrgAttendeesList>;

export const OrgAnalyticsRollup = z.object({
  totals: z.object({
    eventsCount: z.number().int(),
    registrationsTotal: z.number().int(),
    paidOrdersCount: z.number().int(),
    pendingOrdersCount: z.number().int(),
    ticketsIssued: z.number().int(),
    checkedIn: z.number().int(),
    messagesCount: z.number().int(),
    revenueByCurrency: z.record(z.number()),
  }),
  funnel: z.object({
    registrations: z.number().int(),
    paidOrders: z.number().int(),
    ticketsIssued: z.number().int(),
    checkedIn: z.number().int(),
  }),
  monthly: z.array(
    z.object({
      month: z.string(),
      registrations: z.number().int(),
      paidOrders: z.number().int(),
      revenueMinor: z.number().int(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      code: z.string(),
      status: z.string(),
      startAt: z.string().nullable(),
      registrations: z.number().int(),
      paidOrders: z.number().int(),
      revenueMinor: z.number().int(),
      currency: z.string().nullable(),
      checkedIn: z.number().int(),
    }),
  ),
});
export type OrgAnalyticsRollup = z.infer<typeof OrgAnalyticsRollup>;

export const Organization = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  brandColor: z.string().nullable(),
  plan: z.string(),
  countryCode: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const UpdateOrganizationInput = z.object({
  name: z.string().min(2).max(80).optional(),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/)
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  countryCode: z.string().length(2).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInput>;

export const OrgMember = z.object({
  id: z.string().uuid(),
  role: z.string(),
  joinedAt: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
    lastLoginAt: z.string().nullable(),
  }),
});
export type OrgMember = z.infer<typeof OrgMember>;

export const ApiKey = z.object({
  id: z.string().uuid(),
  name: z.string(),
  lastFour: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdBy: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
  }),
});
export type ApiKey = z.infer<typeof ApiKey>;

export const NewApiKey = ApiKey.omit({
  lastUsedAt: true,
  revokedAt: true,
  createdBy: true,
}).extend({
  // Plaintext token, returned once on creation only.
  token: z.string(),
});
export type NewApiKey = z.infer<typeof NewApiKey>;

export const PaymentPreferences = z.object({
  enabledProviders: z.array(z.string()),
  preferences: z.array(
    z.object({
      currency: z.string(),
      provider: z.string(),
      updatedAt: z.string(),
    }),
  ),
});
export type PaymentPreferences = z.infer<typeof PaymentPreferences>;

export const AttendeeDetail = z.object({
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    email: z.string().email(),
    phone: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    createdAt: z.string(),
  }),
  stats: z.object({
    eventsAttended: z.number().int(),
    ticketCount: z.number().int(),
    totalSpentByCurrency: z.record(z.number()),
  }),
  registrations: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.string(),
      createdAt: z.string(),
      event: z.object({
        id: z.string().uuid(),
        title: z.string(),
        code: z.string(),
        startAt: z.string().nullable(),
      }),
      tickets: z.array(
        z.object({
          id: z.string().uuid(),
          code: z.string(),
          status: z.string(),
          tier: z.string(),
        }),
      ),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.string().uuid(),
      status: z.string(),
      currency: z.string(),
      totalMinor: z.number(),
      provider: z.string().nullable(),
      createdAt: z.string(),
      paidAt: z.string().nullable(),
      eventId: z.string().uuid(),
    }),
  ),
});
export type AttendeeDetail = z.infer<typeof AttendeeDetail>;
