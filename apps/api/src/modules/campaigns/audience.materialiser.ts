/**
 * Audience materialiser. Given a CampaignAudience, returns the
 * recipient list (email + optional name + optional user_id) and the
 * count. Slice A supports only the `all-registrations` smart segment.
 *
 * The materialiser is the single source of truth for what "the audience
 * is" at send time. The audience count we cache on CampaignAudience
 * comes from here too (via the /preview endpoint and the scheduled
 * refresh worker in Slice B).
 *
 * Exclusions:
 *   - email_suppressions rows for this org are honoured (bounce,
 *     complaint, unsubscribe, manual)
 *   - duplicates by (lowercased) email are collapsed
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface Recipient {
  email: string;
  name: string | null;
  userId: string | null;
}

@Injectable()
export class AudienceMaterialiser {
  constructor(private readonly prisma: PrismaService) {}

  async materialise(audienceId: string, organizationId: string): Promise<Recipient[]> {
    const audience = await this.prisma.campaignAudience.findFirst({
      where: { id: audienceId, organizationId },
    });
    if (!audience) {
      throw new BadRequestException('Audience not found for this organization');
    }

    let raw: Recipient[];
    if (audience.kind === 'smart') {
      raw = await this.materialiseSmart(audience.smartKey, audience.eventId, organizationId);
    } else {
      // Slice B - custom segment builder. Stub for now so the field
      // exists in the API but returns nothing.
      raw = [];
    }

    // Dedup by lowercased email
    const seen = new Map<string, Recipient>();
    for (const r of raw) {
      const key = r.email.toLowerCase();
      if (!seen.has(key)) seen.set(key, r);
    }

    // Suppression list
    const emails = [...seen.keys()];
    if (emails.length === 0) return [];
    const suppressed = await this.prisma.emailSuppression.findMany({
      where: { organizationId, email: { in: emails } },
      select: { email: true },
    });
    const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));
    return [...seen.values()].filter((r) => !suppressedSet.has(r.email.toLowerCase()));
  }

  /**
   * Smart segments. Slice A:
   *   - all-registrations: every registered user for the audience's event
   * Slice B will add:
   *   - checked-in, not-checked-in, tier:<id>, attended-event:<id>,
   *     did-not-attend:<id>, refunded
   */
  private async materialiseSmart(
    smartKey: string | null,
    eventId: string | null,
    organizationId: string,
  ): Promise<Recipient[]> {
    if (!smartKey) {
      throw new BadRequestException('smartKey is required for a smart audience');
    }
    if (smartKey === 'all-registrations') {
      if (!eventId) {
        throw new BadRequestException('eventId is required for all-registrations');
      }
      // Pull every registration for the event, scoped to the org.
      // Join through Event so a stolen eventId from a different org cannot
      // leak its registrations.
      const regs = await this.prisma.registration.findMany({
        where: {
          event: { id: eventId, organizationId },
        },
        select: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      });
      return regs
        .filter((r) => r.user !== null)
        .map((r) => ({
          email: r.user!.email,
          name: r.user!.fullName,
          userId: r.user!.id,
        }));
    }
    throw new BadRequestException(`Unknown smart key: ${smartKey}`);
  }

  /**
   * Count without materialising the full list. Used for live count in
   * the audience builder and for the cached_count refresh.
   */
  async count(audienceId: string, organizationId: string): Promise<number> {
    const list = await this.materialise(audienceId, organizationId);
    return list.length;
  }
}
