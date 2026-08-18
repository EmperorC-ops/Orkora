/**
 * Billing service.
 *
 * Surface for the organizer's "how much have I made + what does Orkora
 * take" view. Reads from the existing orders + events tables; no new
 * schema, no Stripe subscription wiring yet. Slice scope:
 *
 *   - Plan tier (from Organization.plan)
 *   - Lifetime revenue grouped by currency (paid orders only)
 *   - Last 12 months revenue rollup grouped by currency + month
 *   - Notional platform fee (3% of paid GMV) so the organizer sees
 *     what they would owe under the post-beta pricing
 *   - CSV export of paid orders for the org's accounting
 *
 * Hard-coded platform fee rate of 3% for now. When billing v2 ships
 * (Stripe Billing subscription, per-plan fee tiers, invoices), this
 * service grows a PlatformPricing table read; until then the fee is
 * advisory only and Order.feesMinor stays 0 in the DB.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

const PLATFORM_FEE_BPS = 300; // 3.00% in basis points - notional, not charged yet

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, plan: true, createdAt: true, countryCode: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Lifetime paid revenue, grouped by currency
    const paid = await this.prisma.order.findMany({
      where: { event: { organizationId: orgId }, status: 'paid' },
      select: { totalMinor: true, currency: true, paidAt: true },
    });

    const revenueByCurrency = new Map<string, bigint>();
    const feeByCurrency = new Map<string, bigint>();
    for (const o of paid) {
      revenueByCurrency.set(
        o.currency,
        (revenueByCurrency.get(o.currency) ?? BigInt(0)) + o.totalMinor,
      );
      // Notional fee in minor units, rounded to nearest minor
      const fee = (o.totalMinor * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
      feeByCurrency.set(o.currency, (feeByCurrency.get(o.currency) ?? BigInt(0)) + fee);
    }

    // Refunded total for context (lets the organizer reconcile "we processed X, refunded Y")
    const refunded = await this.prisma.order.findMany({
      where: { event: { organizationId: orgId }, status: 'refunded' },
      select: { totalMinor: true, currency: true },
    });
    const refundsByCurrency = new Map<string, bigint>();
    for (const o of refunded) {
      refundsByCurrency.set(
        o.currency,
        (refundsByCurrency.get(o.currency) ?? BigInt(0)) + o.totalMinor,
      );
    }

    return {
      organization: org,
      plan: {
        name: org.plan,
        platformFeeBps: PLATFORM_FEE_BPS,
        platformFeePercent: PLATFORM_FEE_BPS / 100,
        notes: [
          'Platform fee is currently 0% during private beta; the 3% figure is advisory only.',
          'Payment processing fees are charged separately by your payment provider, not by Orkora.',
        ],
      },
      lifetime: {
        revenue: serializeCurrencyMap(revenueByCurrency),
        notionalFee: serializeCurrencyMap(feeByCurrency),
        refunds: serializeCurrencyMap(refundsByCurrency),
        paidOrderCount: paid.length,
        refundedOrderCount: refunded.length,
      },
    };
  }

  /**
   * Last 12 calendar months. Returns one entry per (month, currency)
   * combination present in paid orders. The web layer pivots this into
   * the chart.
   */
  async trailing12(orgId: string) {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const paid = await this.prisma.order.findMany({
      where: {
        event: { organizationId: orgId },
        status: 'paid',
        paidAt: { gte: since },
      },
      select: { totalMinor: true, currency: true, paidAt: true },
    });

    const buckets = new Map<string, bigint>(); // key = `${YYYY-MM}|${currency}`
    for (const o of paid) {
      if (!o.paidAt) continue;
      const month = `${o.paidAt.getUTCFullYear()}-${String(o.paidAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const key = `${month}|${o.currency}`;
      buckets.set(key, (buckets.get(key) ?? BigInt(0)) + o.totalMinor);
    }
    return [...buckets.entries()].map(([key, totalMinor]) => {
      const [month, currency] = key.split('|');
      return { month, currency, totalMinor: totalMinor.toString() };
    });
  }

  /**
   * CSV export of every paid + refunded order. Streams as a single
   * string for now; if an org has >10k orders we'll switch to a
   * paginated streamed response. Columns: order_id, event_title,
   * created_at, paid_at, status, currency, total_minor, total_human,
   * provider, refund_initiated_at, fee_minor (notional).
   */
  async exportOrdersCsv(orgId: string): Promise<string> {
    const orders = await this.prisma.order.findMany({
      where: { event: { organizationId: orgId }, status: { in: ['paid', 'refunded'] } },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { title: true } } },
    });
    const header =
      'order_id,event_title,created_at,paid_at,refund_initiated_at,status,currency,total_minor,total_human,provider,notional_fee_minor';
    // Human amount respecting the currency's minor-unit exponent. A hardcoded
    // /100 is wrong for zero-decimal currencies (e.g. XAF/XOF). BigInt math
    // avoids float rounding on large sums.
    const ZERO_DECIMAL = new Set(['XAF', 'XOF', 'JPY', 'KRW', 'VND', 'CLP', 'RWF', 'UGX', 'GNF', 'XPF']);
    const minorToHuman = (minor: bigint, currency: string): string => {
      if (ZERO_DECIMAL.has(currency.toUpperCase())) return minor.toString();
      const neg = minor < 0n;
      const abs = neg ? -minor : minor;
      const major = abs / 100n;
      const cents = (abs % 100n).toString().padStart(2, '0');
      return `${neg ? '-' : ''}${major.toString()}.${cents}`;
    };
    const rows = orders.map((o) => {
      const totalHuman = minorToHuman(o.totalMinor, o.currency);
      const fee = (o.totalMinor * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
      return [
        o.id,
        csvEscape(o.event.title),
        o.createdAt.toISOString(),
        o.paidAt?.toISOString() ?? '',
        o.refundInitiatedAt?.toISOString() ?? '',
        o.status,
        o.currency,
        o.totalMinor.toString(),
        totalHuman,
        o.provider ?? '',
        fee.toString(),
      ].join(',');
    });
    return [header, ...rows].join('\n');
  }
}

function serializeCurrencyMap(m: Map<string, bigint>): Array<{ currency: string; totalMinor: string }> {
  return [...m.entries()].map(([currency, totalMinor]) => ({
    currency,
    totalMinor: totalMinor.toString(),
  }));
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
