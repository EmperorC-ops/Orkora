import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CreateDiscountCodeDto,
  DiscountKind,
  UpdateDiscountCodeDto,
  ValidateDiscountDto,
} from './dto/discount.dto';

/**
 * The result of checking a discount code against a concrete subtotal. `ok`
 * false comes with a friendly `reason`; `ok` true carries the computed
 * discount amount in minor units.
 */
export interface DiscountValidity {
  ok: boolean;
  reason?: string;
  discountMinor: bigint;
}

/** Minimal shape of a discount row shared by the Prisma client and raw SQL. */
export interface DiscountCheckInput {
  kind: string;
  value: number;
  currency: string | null;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
}

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pure amount math. Percent codes take floor(subtotal * value / 100); fixed
   * codes take min(value, subtotal). The result is clamped to 0n so a discount
   * can never push a total below zero or turn negative.
   */
  static computeDiscountMinor(
    kind: DiscountKind | string,
    value: number,
    subtotalMinor: bigint,
  ): bigint {
    if (subtotalMinor <= 0n) return 0n;
    let discount: bigint;
    if (kind === 'percent') {
      discount = (subtotalMinor * BigInt(value)) / 100n;
    } else {
      const fixed = BigInt(value);
      discount = fixed < subtotalMinor ? fixed : subtotalMinor;
    }
    if (discount < 0n) return 0n;
    return discount > subtotalMinor ? subtotalMinor : discount;
  }

  /**
   * Check a discount row against a concrete subtotal and moment. Enforces:
   * active flag, [startsAt, endsAt] window, remaining redemptions, and (for
   * fixed codes with a currency) a currency match against the tier. Returns the
   * computed discount when valid.
   */
  static checkValidity(
    row: DiscountCheckInput,
    now: Date,
    tierCurrency: string,
    subtotalMinor: bigint,
  ): DiscountValidity {
    if (!row.active) {
      return { ok: false, reason: 'This discount code is no longer active.', discountMinor: 0n };
    }
    if (row.startsAt && now < row.startsAt) {
      return { ok: false, reason: 'This discount code is not active yet.', discountMinor: 0n };
    }
    if (row.endsAt && now > row.endsAt) {
      return { ok: false, reason: 'This discount code has expired.', discountMinor: 0n };
    }
    if (row.maxRedemptions != null && row.timesRedeemed >= row.maxRedemptions) {
      return { ok: false, reason: 'This discount code has been fully redeemed.', discountMinor: 0n };
    }
    if (
      row.kind === 'fixed' &&
      row.currency &&
      row.currency.toUpperCase() !== tierCurrency.toUpperCase()
    ) {
      return {
        ok: false,
        reason: 'This discount code cannot be used for this ticket currency.',
        discountMinor: 0n,
      };
    }
    const discountMinor = DiscountsService.computeDiscountMinor(
      row.kind,
      row.value,
      subtotalMinor,
    );
    return { ok: true, discountMinor };
  }

  // ------------ Organizer surface ------------

  async createCode(orgId: string, eventId: string, dto: CreateDiscountCodeDto) {
    await this.assertEventInOrg(orgId, eventId);
    // A percentage must be 1..100. The DB has a CHECK constraint too, but we
    // enforce it here so an out-of-range value returns a clean 400 instead of
    // surfacing a raw database error as a 500.
    if (dto.kind === 'percent' && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException('A percentage discount must be between 1 and 100.');
    }
    const code = dto.code.trim().toUpperCase();
    // Fixed codes keep their currency (uppercased) when supplied, else null,
    // which means the code applies to any currency. Percent codes never carry
    // a currency.
    const currency =
      dto.kind === 'fixed' && dto.currency ? dto.currency.trim().toUpperCase() : null;
    const created = await this.prisma.discountCode.create({
      data: {
        eventId,
        code,
        kind: dto.kind,
        value: dto.value,
        currency,
        maxRedemptions: dto.maxRedemptions ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        active: dto.active ?? true,
      },
    });
    return this.shape(created);
  }

  async listCodes(orgId: string, eventId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const codes = await this.prisma.discountCode.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
    return codes.map((c) => this.shape(c));
  }

  async updateCode(
    orgId: string,
    eventId: string,
    codeId: string,
    dto: UpdateDiscountCodeDto,
  ) {
    await this.assertEventInOrg(orgId, eventId);
    const existing = await this.prisma.discountCode.findFirst({
      where: { id: codeId, eventId },
    });
    if (!existing) throw new NotFoundException('Discount code not found');

    const nextKind = dto.kind ?? existing.kind;
    const nextValue = dto.value ?? existing.value;
    // Re-check the percentage ceiling against the effective (post-patch) values
    // so a code cannot be edited into an out-of-range percentage.
    if (nextKind === 'percent' && (nextValue < 1 || nextValue > 100)) {
      throw new BadRequestException('A percentage discount must be between 1 and 100.');
    }
    // Recompute currency when either the kind or currency changes so a code
    // flipped to 'percent' never keeps a stale currency.
    let currency: string | null | undefined;
    if (dto.kind !== undefined || dto.currency !== undefined) {
      currency =
        nextKind === 'fixed'
          ? dto.currency
            ? dto.currency.trim().toUpperCase()
            : dto.currency === undefined
              ? existing.currency
              : null
          : null;
    }

    const updated = await this.prisma.discountCode.update({
      where: { id: codeId },
      data: {
        code: dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined,
        kind: dto.kind ?? undefined,
        value: dto.value ?? undefined,
        currency,
        maxRedemptions: dto.maxRedemptions ?? undefined,
        startsAt:
          dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : undefined,
        active: dto.active ?? undefined,
      },
    });
    return this.shape(updated);
  }

  async deleteCode(orgId: string, eventId: string, codeId: string) {
    await this.assertEventInOrg(orgId, eventId);
    const existing = await this.prisma.discountCode.findFirst({
      where: { id: codeId, eventId },
    });
    if (!existing) throw new NotFoundException('Discount code not found');
    await this.prisma.discountCode.delete({ where: { id: codeId } });
    return { ok: true };
  }

  // ------------ Public surface ------------

  /**
   * Validate a code from the public register page. Resolves the event by its
   * public code (rejecting draft/archived events or suspended orgs, mirroring
   * feedback.submitPublic), loads the selected tier for its price and currency,
   * then checks the discount against the subtotal. Returns plain Numbers so the
   * JSON response never carries bigints.
   */
  async validatePublic(eventCode: string, dto: ValidateDiscountDto) {
    const event = await this.prisma.event.findUnique({
      where: { code: eventCode.toUpperCase() },
      select: {
        id: true,
        status: true,
        organization: { select: { status: true } },
      },
    });
    if (
      !event ||
      event.status === 'draft' ||
      event.status === 'archived' ||
      event.organization.status === 'suspended'
    ) {
      throw new NotFoundException('Event not found');
    }

    const tier = await this.prisma.ticketTier.findFirst({
      where: { id: dto.tierId, eventId: event.id },
      select: { priceMinor: true, currency: true },
    });
    if (!tier) {
      throw new BadRequestException('That ticket is not part of this event.');
    }

    const row = await this.prisma.discountCode.findUnique({
      where: { eventId_code: { eventId: event.id, code: dto.code.trim().toUpperCase() } },
    });
    if (!row) {
      throw new BadRequestException('That discount code is not valid.');
    }

    const subtotal = BigInt(tier.priceMinor) * BigInt(dto.quantity);
    const check = DiscountsService.checkValidity(row, new Date(), tier.currency, subtotal);
    if (!check.ok) {
      throw new BadRequestException(check.reason ?? 'That discount code is not valid.');
    }

    const total = subtotal - check.discountMinor;
    return {
      valid: true as const,
      kind: row.kind,
      value: row.value,
      discountMinor: Number(check.discountMinor),
      subtotalMinor: Number(subtotal),
      totalMinor: Number(total),
    };
  }

  // ------------ helpers ------------

  private async assertEventInOrg(orgId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizationId: orgId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private shape(c: {
    id: string;
    eventId: string;
    code: string;
    kind: string;
    value: number;
    currency: string | null;
    maxRedemptions: number | null;
    timesRedeemed: number;
    startsAt: Date | null;
    endsAt: Date | null;
    active: boolean;
    createdAt: Date;
  }) {
    return {
      id: c.id,
      eventId: c.eventId,
      code: c.code,
      kind: c.kind,
      value: c.value,
      currency: c.currency,
      maxRedemptions: c.maxRedemptions,
      timesRedeemed: c.timesRedeemed,
      redemptionsRemaining:
        c.maxRedemptions != null ? c.maxRedemptions - c.timesRedeemed : null,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      active: c.active,
      createdAt: c.createdAt,
    };
  }
}
