import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Platform-console deletion of users and organizations.
 *
 * Ground rules, enforced here and not only in the UI:
 *  - Financial records are never destroyed. Anything that touched money (a paid
 *    or refunded order, a payment row, an invoice, a settlement hold, a wallet
 *    entry) blocks deletion. Use "erase details" for a user, or suspend an
 *    organization, instead.
 *  - Every delete is preceded by a preview listing exactly what will be removed
 *    and anything that blocks it. The delete re-checks the blockers inside the
 *    same transaction, so a preview cannot be stale-raced into a bad delete.
 *  - The caller must type a confirmation (the user's email, or the
 *    organization's name) that must match exactly.
 *  - Everything runs in one transaction: it all happens, or nothing does. If
 *    the database refuses any step (an unexpected reference), the whole delete
 *    rolls back and the error is returned.
 *  - Every completed action is written to the audit log.
 *
 * Statements are raw SQL so the order of operations matches the foreign keys in
 * schema.sql exactly (several references to users, events and orders have no
 * ON DELETE CASCADE by design).
 */

/** SQL predicate (alias `o`) for an order that is a financial record. */
export const FINANCIAL_ORDER_SQL = `(
  o.status in ('paid', 'refunded')
  or o.paid_at is not null
  or o.refund_initiated_at is not null
  or o.settlement_hold_at is not null
  or exists (select 1 from payments p where p.order_id = o.id)
  or exists (select 1 from invoices i where i.order_id = o.id)
)`;

/** Placeholder email for an erased account: unique, and can never receive mail. */
export function erasedEmail(userId: string): string {
  return `deleted+${userId}@deleted.orkora.invalid`;
}

export interface UserDeletionFacts {
  isSelf: boolean;
  platformRole: string;
  financialOrders: number;
  walletEntries: number;
  soleOwnerOf: string[];
  campaignsCreated: number;
  apiKeysCreated: number;
}

/**
 * Why a user cannot be hard-deleted. Empty means deletion is allowed. Kept pure
 * so the rules are unit-tested without a database.
 */
export function userDeleteBlockers(f: UserDeletionFacts): string[] {
  const out: string[] = [];
  if (f.isSelf) out.push('You cannot delete your own account.');
  if (f.platformRole !== 'none') {
    out.push('This is a platform team account. Set its platform role to none first.');
  }
  if (f.soleOwnerOf.length > 0) {
    out.push(
      `This user is the only owner of: ${f.soleOwnerOf.join(', ')}. Delete that organization or give it another owner first.`,
    );
  }
  if (f.financialOrders > 0) {
    out.push(
      `This user has ${f.financialOrders} paid or refunded order(s). Payment records must be kept; use Erase details instead.`,
    );
  }
  if (f.walletEntries > 0) {
    out.push('This user has wallet ledger entries. Use Erase details instead.');
  }
  if (f.campaignsCreated > 0) {
    out.push(
      `This user created ${f.campaignsCreated} campaign(s) or audience(s). Delete the organization they belong to, or use Erase details.`,
    );
  }
  if (f.apiKeysCreated > 0) {
    out.push(`This user created ${f.apiKeysCreated} API key(s). Revoke them in that organization first.`);
  }
  return out;
}

/** Why a user cannot be erased (details scrubbed). Empty means allowed. */
export function userEraseBlockers(f: UserDeletionFacts): string[] {
  const out: string[] = [];
  if (f.isSelf) out.push('You cannot erase your own account.');
  if (f.platformRole !== 'none') {
    out.push('This is a platform team account. Set its platform role to none first.');
  }
  if (f.soleOwnerOf.length > 0) {
    out.push(
      `This user is the only owner of: ${f.soleOwnerOf.join(', ')}. Delete that organization or give it another owner first.`,
    );
  }
  return out;
}

export interface OrgDeletionFacts {
  financialOrders: number;
  walletEntries: number;
}

/** Why an organization cannot be deleted. Empty means deletion is allowed. */
export function orgDeleteBlockers(f: OrgDeletionFacts): string[] {
  const out: string[] = [];
  if (f.financialOrders > 0) {
    out.push(
      `Its events have ${f.financialOrders} paid or refunded order(s). Payment records must be kept; suspend the organization instead.`,
    );
  }
  if (f.walletEntries > 0) {
    out.push('It has wallet ledger entries. Suspend the organization instead.');
  }
  return out;
}

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

const TX_OPTS = { timeout: 60_000, maxWait: 10_000 } as const;

async function num(db: Db, sql: string, ...params: unknown[]): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ n: bigint | number }>>(sql, ...params);
  return Number(rows[0]?.n ?? 0);
}

@Injectable()
export class AdminDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- users -----

  private async userFacts(db: Db, userId: string, actorUserId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, platformRole: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [financialOrders, walletEntries, campaigns, audiences, apiKeys, soleOwnerRows] =
      await Promise.all([
        num(
          db,
          `select count(*) as n from orders o
            where (o.user_id = $1::uuid
                   or o.registration_id in (select id from registrations where user_id = $1::uuid))
              and ${FINANCIAL_ORDER_SQL}`,
          userId,
        ),
        num(db, `select count(*) as n from wallet_entries where user_id = $1::uuid`, userId),
        num(db, `select count(*) as n from campaigns where created_by_id = $1::uuid`, userId),
        num(db, `select count(*) as n from campaign_audiences where created_by_id = $1::uuid`, userId),
        num(db, `select count(*) as n from api_keys where created_by_id = $1::uuid`, userId),
        db.$queryRawUnsafe<Array<{ name: string }>>(
          `select org.name from memberships m
             join organizations org on org.id = m.organization_id
            where m.user_id = $1::uuid and m.role = 'owner'
              and not exists (
                select 1 from memberships m2
                 where m2.organization_id = m.organization_id
                   and m2.role = 'owner' and m2.user_id <> $1::uuid)
            order by org.name`,
          userId,
        ),
      ]);

    const facts: UserDeletionFacts = {
      isSelf: userId === actorUserId,
      platformRole: user.platformRole,
      financialOrders,
      walletEntries,
      soleOwnerOf: soleOwnerRows.map((r) => r.name),
      campaignsCreated: campaigns + audiences,
      apiKeysCreated: apiKeys,
    };
    return { user, facts };
  }

  /** What deleting (or erasing) this user would do, and anything that blocks it. */
  async previewUser(userId: string, actorUserId: string) {
    const { user, facts } = await this.userFacts(this.prisma, userId, actorUserId);
    const [registrations, liveTickets, messages, pollVotes, pendingOrders, orgRows] =
      await Promise.all([
        num(this.prisma, `select count(*) as n from registrations where user_id = $1::uuid`, userId),
        num(
          this.prisma,
          `select count(*) as n from tickets t join registrations r on r.id = t.registration_id
            where r.user_id = $1::uuid and t.status in ('pending', 'issued', 'checked_in')`,
          userId,
        ),
        num(this.prisma, `select count(*) as n from messages where user_id = $1::uuid`, userId),
        num(this.prisma, `select count(*) as n from poll_votes where user_id = $1::uuid`, userId),
        num(
          this.prisma,
          `select count(*) as n from orders o where o.user_id = $1::uuid and not ${FINANCIAL_ORDER_SQL}`,
          userId,
        ),
        this.prisma.$queryRawUnsafe<Array<{ name: string; role: string }>>(
          `select org.name, m.role from memberships m
             join organizations org on org.id = m.organization_id
            where m.user_id = $1::uuid order by org.name`,
          userId,
        ),
      ]);

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      deleteBlockers: userDeleteBlockers(facts),
      eraseBlockers: userEraseBlockers(facts),
      willRemove: {
        registrations,
        ticketsReleased: liveTickets,
        unpaidOrders: pendingOrders,
        messages,
        pollVotes,
        memberships: orgRows.map((r) => `${r.name} (${r.role})`),
      },
      keptRecords: {
        paidOrders: facts.financialOrders,
      },
    };
  }

  /** Permanently delete a user who has no financial history. */
  async deleteUser(userId: string, actorUserId: string, confirm: string, requestId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const { user, facts } = await this.userFacts(tx, userId, actorUserId);
      if ((confirm ?? '').trim().toLowerCase() !== user.email.toLowerCase()) {
        throw new BadRequestException("Type the user's email address exactly to confirm.");
      }
      const blockers = userDeleteBlockers(facts);
      if (blockers.length > 0) throw new BadRequestException(blockers.join(' '));

      const regs = `(select id from registrations where user_id = $1::uuid)`;
      const orders = `(select id from orders where user_id = $1::uuid or registration_id in ${regs})`;
      const run = (sql: string) => tx.$executeRawUnsafe(sql, userId);

      // Release the seats their live or held tickets occupy (clamped at zero),
      // and any discount-code slots claimed by their unpaid orders.
      const seatsReleased = await run(
        `update ticket_tiers tt set quantity_sold = greatest(0, tt.quantity_sold - c.n)
           from (select t.tier_id, count(*)::int as n from tickets t
                  where t.registration_id in ${regs}
                    and t.status in ('pending', 'issued', 'checked_in')
                  group by t.tier_id) c
          where tt.id = c.tier_id`,
      );
      await run(
        `update discount_codes dc set times_redeemed = greatest(0, dc.times_redeemed - c.n)
           from (select dr.discount_code_id, count(*)::int as n from discount_redemptions dr
                  where dr.order_id in ${orders} group by dr.discount_code_id) c
          where dc.id = c.discount_code_id`,
      );
      await run(
        `delete from checkins where ticket_id in (select id from tickets where registration_id in ${regs})`,
      );
      // Unpaid orders only (paid ones block above). Items, redemptions and the
      // notification log cascade; tickets.order_id is set null.
      await run(`delete from orders where id in ${orders}`);
      await run(`delete from registrations where user_id = $1::uuid`);

      // Live engagement: replies to their questions, their upvotes, their
      // messages and their poll votes.
      await run(
        `delete from messages where reply_to_id in (select id from messages where user_id = $1::uuid)`,
      );
      await run(`delete from message_upvotes where user_id = $1::uuid`);
      await run(`delete from messages where user_id = $1::uuid`);
      await run(`delete from poll_votes where user_id = $1::uuid`);
      await run(`delete from connections where requester_id = $1::uuid or recipient_id = $1::uuid`);
      await run(`delete from notifications where user_id = $1::uuid`);
      await run(`delete from invitations where invited_by_id = $1::uuid`);

      // Soft references: keep the row, drop the pointer to this person.
      await run(`update speakers set user_id = null where user_id = $1::uuid`);
      await run(`update checkins set scanned_by = null where scanned_by = $1::uuid`);
      await run(`update live_spotlights set updated_by_user_id = null where updated_by_user_id = $1::uuid`);
      await run(`update campaign_sends set user_id = null where user_id = $1::uuid`);
      await run(`update discount_redemptions set user_id = null where user_id = $1::uuid`);

      // Memberships and refresh tokens cascade; audit rows keep, actor set null.
      await run(`delete from users where id = $1::uuid`);
      return { email: user.email, seatsReleased };
    }, TX_OPTS);

    await this.audit.record({
      actorUserId,
      action: 'admin.user.delete',
      resourceType: 'user',
      resourceId: userId,
      metadata: { email: result.email },
      requestId: requestId ?? null,
    });
    return { id: userId, deleted: true };
  }

  /**
   * Erase a user's personal details but keep their records (orders, payments,
   * attendance). For real people who ask to be removed, or accounts with paid
   * history. The account can no longer sign in.
   */
  async eraseUser(userId: string, actorUserId: string, confirm: string, requestId?: string) {
    await this.prisma.$transaction(async (tx) => {
      const { user, facts } = await this.userFacts(tx, userId, actorUserId);
      if ((confirm ?? '').trim().toLowerCase() !== user.email.toLowerCase()) {
        throw new BadRequestException("Type the user's email address exactly to confirm.");
      }
      const blockers = userEraseBlockers(facts);
      if (blockers.length > 0) throw new BadRequestException(blockers.join(' '));

      const placeholder = erasedEmail(userId);
      await tx.$executeRawUnsafe(
        `update tickets set holder_name = 'Deleted user', holder_email = $2
          where registration_id in (select id from registrations where user_id = $1::uuid)`,
        userId,
        placeholder,
      );
      await tx.$executeRawUnsafe(
        `update registrations set form_responses = '{}'::jsonb where user_id = $1::uuid`,
        userId,
      );
      await tx.$executeRawUnsafe(`delete from memberships where user_id = $1::uuid`, userId);
      await tx.$executeRawUnsafe(`delete from refresh_tokens where user_id = $1::uuid`, userId);
      await tx.$executeRawUnsafe(
        `delete from connections where requester_id = $1::uuid or recipient_id = $1::uuid`,
        userId,
      );
      await tx.$executeRawUnsafe(`delete from notifications where user_id = $1::uuid`, userId);
      await tx.$executeRawUnsafe(
        `update users set email = $2, full_name = 'Deleted user', phone = null,
                password_hash = null, avatar_url = null, email_verified = false,
                phone_verified = false, platform_role = 'none'
          where id = $1::uuid`,
        userId,
        placeholder,
      );
    }, TX_OPTS);

    // No email or name in the audit row: the point of erasure is that the
    // details are gone.
    await this.audit.record({
      actorUserId,
      action: 'admin.user.erase',
      resourceType: 'user',
      resourceId: userId,
      requestId: requestId ?? null,
    });
    return { id: userId, erased: true };
  }

  // ----- organizations -----

  private async orgFacts(db: Db, orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    const [financialOrders, walletEntries] = await Promise.all([
      num(
        db,
        `select count(*) as n from orders o
           join events e on e.id = o.event_id
          where e.organization_id = $1::uuid and ${FINANCIAL_ORDER_SQL}`,
        orgId,
      ),
      num(db, `select count(*) as n from wallet_entries where organization_id = $1::uuid`, orgId),
    ]);
    return { org, facts: { financialOrders, walletEntries } as OrgDeletionFacts };
  }

  async previewOrganization(orgId: string) {
    const { org, facts } = await this.orgFacts(this.prisma, orgId);
    const p = this.prisma;
    const events = `(select id from events where organization_id = $1::uuid)`;
    const [eventRows, registrations, tickets, members, campaigns] = await Promise.all([
      p.$queryRawUnsafe<Array<{ title: string }>>(
        `select title from events where organization_id = $1::uuid order by created_at desc`,
        orgId,
      ),
      num(p, `select count(*) as n from registrations where event_id in ${events}`, orgId),
      num(
        p,
        `select count(*) as n from tickets t join registrations r on r.id = t.registration_id
          where r.event_id in ${events}`,
        orgId,
      ),
      num(p, `select count(*) as n from memberships where organization_id = $1::uuid`, orgId),
      num(p, `select count(*) as n from campaigns where organization_id = $1::uuid`, orgId),
    ]);
    return {
      organization: org,
      deleteBlockers: orgDeleteBlockers(facts),
      willRemove: {
        events: eventRows.map((e) => e.title),
        registrations,
        tickets,
        members,
        campaigns,
      },
      keptRecords: { paidOrders: facts.financialOrders },
    };
  }

  /** Permanently delete an organization whose events never took money. */
  async deleteOrganization(orgId: string, actorUserId: string, confirm: string, requestId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const { org, facts } = await this.orgFacts(tx, orgId);
      if ((confirm ?? '').trim() !== org.name.trim()) {
        throw new BadRequestException("Type the organization's name exactly to confirm.");
      }
      const blockers = orgDeleteBlockers(facts);
      if (blockers.length > 0) throw new BadRequestException(blockers.join(' '));

      const events = `(select id from events where organization_id = $1::uuid)`;
      const regs = `(select id from registrations where event_id in ${events})`;
      const run = (sql: string) => tx.$executeRawUnsafe(sql, orgId);

      await run(
        `delete from checkins
          where ticket_id in (select id from tickets where registration_id in ${regs})
             or session_id in (select id from sessions where event_id in ${events})`,
      );
      // Unpaid orders only (paid ones block above).
      await run(`delete from orders where event_id in ${events}`);
      await run(`delete from registrations where event_id in ${events}`);
      await run(`delete from connections where event_id in ${events}`);
      await run(`delete from notifications where event_id in ${events}`);
      await run(
        `delete from media_assets where organization_id = $1::uuid or event_id in ${events}`,
      );
      // Sessions, tracks, speakers, tiers, chat and Q&A, polls, discount codes,
      // recordings, feedback, Story analytics and the spotlight cascade.
      const eventsDeleted = await run(`delete from events where organization_id = $1::uuid`);
      // Memberships, invitations, campaigns, audiences, API keys, payment
      // accounts and preferences, brand data cascade. Audit rows are kept.
      await run(`delete from organizations where id = $1::uuid`);
      return { name: org.name, slug: org.slug, eventsDeleted };
    }, TX_OPTS);

    await this.audit.record({
      actorUserId,
      action: 'admin.organization.delete',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: { name: result.name, slug: result.slug, eventsDeleted: result.eventsDeleted },
      requestId: requestId ?? null,
    });
    return { id: orgId, deleted: true };
  }
}
