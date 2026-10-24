import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CURRENT_LEGAL_VERSIONS,
  ORGANIZER_AGREEMENT_ROLES,
  type LegalAcceptanceSource,
  type LegalDocument,
} from '../../common/legal-versions';

export interface PendingAcceptance {
  document: LegalDocument;
  version: string;
  /** Set for the Organizer Agreement: the organization it is accepted for. */
  organizationId?: string;
  organizationName?: string;
}

export interface AcceptItem {
  document: LegalDocument;
  version: string;
  organizationId?: string;
}

/**
 * Pure: which acceptances a user still owes, given what they and their
 * organizations have already accepted. Kept separate so the rules are unit
 * tested without a database.
 */
export function computePending(input: {
  acceptedPersonal: Array<{ document: string; version: string }>;
  ownedOrgsMissingOrganizer: Array<{ id: string; name: string }>;
  current?: Record<LegalDocument, string>;
}): PendingAcceptance[] {
  const current = input.current ?? CURRENT_LEGAL_VERSIONS;
  const has = (doc: LegalDocument) =>
    input.acceptedPersonal.some((a) => a.document === doc && a.version === current[doc]);
  const out: PendingAcceptance[] = [];
  if (!has('terms')) out.push({ document: 'terms', version: current.terms });
  if (!has('privacy')) out.push({ document: 'privacy', version: current.privacy });
  for (const org of input.ownedOrgsMissingOrganizer) {
    out.push({
      document: 'organizer',
      version: current.organizer,
      organizationId: org.id,
      organizationName: org.name,
    });
  }
  return out;
}

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  versions() {
    return { ...CURRENT_LEGAL_VERSIONS };
  }

  /** What the signed-in user still has to accept before using the dashboard. */
  async status(userId: string) {
    const [acceptedPersonal, ownedOrgsMissingOrganizer] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ document: string; version: string }>>(
        `select distinct document, version from legal_acceptances
          where user_id = $1::uuid and organization_id is null`,
        userId,
      ),
      this.prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
        `select o.id, o.name from memberships m
           join organizations o on o.id = m.organization_id
          where m.user_id = $1::uuid
            and m.role = any($2::text[])
            and not exists (
              select 1 from legal_acceptances la
               where la.organization_id = m.organization_id
                 and la.document = 'organizer'
                 and la.version = $3)
          order by o.name`,
        userId,
        [...ORGANIZER_AGREEMENT_ROLES],
        CURRENT_LEGAL_VERSIONS.organizer,
      ),
    ]);
    return {
      versions: this.versions(),
      pending: computePending({ acceptedPersonal, ownedOrgsMissingOrganizer }),
    };
  }

  /**
   * Record acceptances. Only the current version of each document can be
   * accepted, and only an owner or admin can accept the Organizer Agreement for
   * an organization. Accepting something already accepted is a no-op.
   */
  async accept(
    userId: string,
    items: AcceptItem[],
    meta: { source: LegalAcceptanceSource; ip?: string | null; userAgent?: string | null },
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Nothing to accept');
    }
    for (const item of items) {
      const current = CURRENT_LEGAL_VERSIONS[item.document];
      if (!current) throw new BadRequestException(`Unknown document: ${item.document}`);
      if (item.version !== current) {
        throw new BadRequestException(
          `This ${item.document} version is out of date. Reload the page to see the current version.`,
        );
      }
      if (item.document === 'organizer') {
        if (!item.organizationId) {
          throw new BadRequestException('The Organizer Agreement is accepted for an organization');
        }
        const rows = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(
          `select 1 as ok from memberships
            where user_id = $1::uuid and organization_id = $2::uuid and role = any($3::text[])`,
          userId,
          item.organizationId,
          [...ORGANIZER_AGREEMENT_ROLES],
        );
        if (rows.length === 0) {
          throw new ForbiddenException(
            'Only an owner or admin can accept the Organizer Agreement for this organization',
          );
        }
      } else if (item.organizationId) {
        throw new BadRequestException(`${item.document} is accepted personally, not for an organization`);
      }
    }

    const ip = meta.ip ? String(meta.ip).slice(0, 64) : null;
    const ua = meta.userAgent ? String(meta.userAgent).slice(0, 300) : null;
    for (const item of items) {
      const orgId = item.document === 'organizer' ? item.organizationId! : null;
      await this.prisma.$executeRawUnsafe(
        `insert into legal_acceptances (user_id, organization_id, document, version, source, ip, user_agent)
         select $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::text
          where not exists (
            select 1 from legal_acceptances
             where document = $3::text and version = $4::text
               and ${orgId ? 'organization_id = $2::uuid' : 'user_id = $1::uuid and organization_id is null'})`,
        userId,
        orgId,
        item.document,
        item.version,
        meta.source,
        ip,
        ua,
      );
    }
    return this.status(userId);
  }

  /** True when an owner or admin has accepted the current Organizer Agreement. */
  async organizationHasAccepted(orgId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(
      `select 1 as ok from legal_acceptances
        where organization_id = $1::uuid and document = 'organizer' and version = $2
        limit 1`,
      orgId,
      CURRENT_LEGAL_VERSIONS.organizer,
    );
    return rows.length > 0;
  }
}
