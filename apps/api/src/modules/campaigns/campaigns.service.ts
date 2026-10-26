/**
 * Campaigns service.
 *
 * Slice A scope:
 *   - CRUD for Campaign + CampaignAudience
 *   - test-send (sends to a single email immediately)
 *   - send-now (materialises audience, queues sends, calls Postmark batch
 *     in chunks of 500, writes campaign_sends rows, updates campaign
 *     status to 'sent' on completion)
 *   - Postmark webhook handler (delivered, bounced, opened, clicked,
 *     unsubscribed, complained)
 *   - Unsubscribe via signed token (CAN-SPAM compliant)
 *
 * Slice B will add scheduled-send dispatcher, custom audience builder.
 * Slice C will add trigger-mode (after_event_end, before_session_start,
 * abandoned_checkout). Slice D will add per-org Postmark child
 * accounts + domain authentication wizard.
 *
 * Postmark deliverability:
 *   - We rely on the existing PostmarkEmailProvider in notifications/
 *     for the single-message send path (test-send).
 *   - Batch sends go via Postmark's /email/batch endpoint directly so
 *     we can pack 500 messages per HTTP call.
 *   - Per-org throttle: 100 messages/second/org via a simple in-memory
 *     gate. Slice D moves to Redis-backed token bucket.
 */

import { statutoryLines } from '../../common/company';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AudienceMaterialiser, type Recipient } from './audience.materialiser';
import { applyTokens, applyTokensText, markdownToHtml, renderPreheader } from './markdown';
import { acceptFlyerUrl, acceptLogoUrl, renderBrandHeader, renderFlyerBlock } from './flyer';
import {
  acceptDocumentUrl,
  documentRecipientKey,
  renderDocumentBlock,
  sanitizeDocumentName,
} from './document';

import { OutboundGuardService, OutboundLimitError } from '../../common/outbound/outbound-guard.service';
import {
  assertSafeEnvelope,
  isOneLineSubject,
  isPlainEmailAddress,
  safeFromName,
  sanitizeForEmail,
} from '../../common/outbound/text-safety';

const BATCH_SIZE = 500;
const POSTMARK_API = 'https://api.postmarkapp.com';
// Test sends go only to verified team members, and at most this many a day
// per person sending them.
const TEST_SENDS_PER_USER_PER_DAY = 20;

/** Collapse to one printable line, capped, for a Subject header. */
function oneLine(s: string, max = 200): string {
  const out = sanitizeForEmail(s, max * 2)
    .replace(/\[link removed\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > max ? out.slice(0, max) : out;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly audiences: AudienceMaterialiser,
    private readonly guard?: OutboundGuardService,
  ) {}

  /**
   * The only address campaigns are sent From. Postmark is dedicated to Orkora,
   * so a campaign may not claim another domain; organizers put their own
   * address in Reply-to. EMAIL_FROM_ADDRESS, default no-reply@orkora.events.
   */
  private platformSender(): string {
    const configured = this.cfg.get<string>('EMAIL_FROM_ADDRESS');
    return configured && isPlainEmailAddress(configured) ? configured : 'no-reply@orkora.events';
  }

  /** A stored fromEmail on our sending domain, otherwise the platform sender. */
  private lockedFromEmail(raw: string | null | undefined): string {
    const sender = this.platformSender();
    const domain = sender.split('@')[1]!.toLowerCase();
    const v = String(raw ?? '').trim().toLowerCase();
    return isPlainEmailAddress(v) && v.split('@')[1] === domain ? v : sender;
  }

  /** The From header: a cleaned display name and our own address. */
  private fromHeader(campaign: { fromName: string; fromEmail: string; organization?: { name: string } | null }) {
    // "via Orkora" so a display name such as "GTBank Alert" cannot pass as
    // the real sender.
    const name = safeFromName(campaign.fromName, safeFromName(campaign.organization?.name ?? 'Orkora'));
    const display = name === 'Orkora' ? 'Orkora' : `${name} via Orkora`;
    return `${display} <${this.lockedFromEmail(campaign.fromEmail)}>`;
  }

  /** Reply-to only when it is one plain address. */
  private safeReplyTo(raw: string | null | undefined): string | undefined {
    const v = String(raw ?? '').trim();
    return v && isPlainEmailAddress(v) ? v : undefined;
  }

  /** Door check for an organizer-typed subject. */
  private requireSubject(subject: string): string {
    const s = String(subject ?? '').trim();
    if (!isOneLineSubject(s) || /[\r\n]/.test(s)) {
      throw new BadRequestException('The subject must be one line of at most 200 characters.');
    }
    return s;
  }

  /** Door check for Reply-to: empty, or exactly one plain address. */
  private requireReplyTo(raw: string | null | undefined): string | null {
    const v = String(raw ?? '').trim();
    if (!v) return null;
    if (!isPlainEmailAddress(v)) throw new BadRequestException('Reply-to must be a single email address.');
    return v;
  }

  // ------------------- AUDIENCES -------------------

  async listAudiences(organizationId: string) {
    return this.prisma.campaignAudience.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAudience(
    organizationId: string,
    createdById: string,
    input: {
      name: string;
      kind: 'smart' | 'custom';
      smartKey?: string;
      eventId?: string;
      customSpec?: unknown;
    },
  ) {
    if (input.kind === 'smart' && !input.smartKey) {
      throw new BadRequestException('smartKey required for smart audience');
    }
    const audience = await this.prisma.campaignAudience.create({
      data: {
        organizationId,
        eventId: input.eventId ?? null,
        name: input.name,
        kind: input.kind,
        smartKey: input.smartKey ?? null,
        customSpec: (input.customSpec ?? null) as never,
        createdById,
      },
    });
    // Warm the cache once on create so the UI shows a count straight away.
    await this.refreshAudienceCount(audience.id, organizationId);
    return audience;
  }

  async previewAudience(audienceId: string, organizationId: string) {
    const recipients = await this.audiences.materialise(audienceId, organizationId);
    return {
      count: recipients.length,
      sample: recipients.slice(0, 10).map((r) => ({ email: r.email, name: r.name })),
    };
  }

  async refreshAudienceCount(audienceId: string, organizationId: string) {
    const count = await this.audiences.count(audienceId, organizationId);
    await this.prisma.campaignAudience.update({
      where: { id: audienceId },
      data: { cachedCount: count, cachedAt: new Date() },
    });
    return { count };
  }

  // ------------------- CAMPAIGNS -------------------

  async list(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        audience: { select: { id: true, name: true, cachedCount: true } },
      },
    });
  }

  async get(id: string, organizationId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, organizationId },
      include: {
        audience: { select: { id: true, name: true, cachedCount: true } },
        // Name and logo for the email header (option B: organizer branding).
        organization: { select: { name: true, logoUrl: true, postalAddress: true, createdAt: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async create(
    organizationId: string,
    createdById: string,
    input: {
      name: string;
      subject: string;
      previewText?: string;
      bodyMarkdown: string;
      fromName: string;
      fromEmail: string;
      replyTo?: string;
      audienceId: string;
      eventId?: string;
      flyerUrl?: string;
      documentUrl?: string;
      documentName?: string;
    },
  ) {
    // Verify audience belongs to the same org
    const audience = await this.prisma.campaignAudience.findFirst({
      where: { id: input.audienceId, organizationId },
    });
    if (!audience) throw new BadRequestException('Audience not found for this organization');

    const bodyHtml = markdownToHtml(input.bodyMarkdown);
    const flyerUrl = input.flyerUrl ? this.requireFlyerUrl(input.flyerUrl) : null;
    const document = input.documentUrl
      ? await this.requireDocument(input.documentUrl, input.documentName)
      : null;

    return this.prisma.campaign.create({
      data: {
        organizationId,
        eventId: input.eventId ?? null,
        name: input.name,
        subject: this.requireSubject(input.subject),
        previewText: input.previewText ?? null,
        bodyMarkdown: input.bodyMarkdown,
        bodyHtml,
        fromName: safeFromName(input.fromName),
        fromEmail: this.lockedFromEmail(input.fromEmail),
        replyTo: this.requireReplyTo(input.replyTo),
        audienceId: input.audienceId,
        flyerUrl,
        documentUrl: document?.url ?? null,
        documentName: document?.name ?? null,
        documentSizeBytes: document?.sizeBytes ?? null,
        createdById,
      },
    });
  }

  /**
   * Accept a campaign document only if it is a PDF we host: the URL must be
   * on our media host under campaign_documents/, and the stored file must
   * really start with the PDF signature (the upload went straight to storage,
   * so the bytes are checked here). Returns the URL, a safe display name and
   * the size reported by storage.
   */
  private async requireDocument(
    rawUrl: string,
    rawName?: string | null,
  ): Promise<{ url: string; name: string; sizeBytes: number | null }> {
    const url = acceptDocumentUrl(rawUrl, this.cfg.get<string>('S3_PUBLIC_BASE_URL'));
    if (!url) {
      throw new BadRequestException(
        'The document must be a PDF uploaded through Orkora. Upload it again from the campaign editor.',
      );
    }
    let head = '';
    let sizeBytes: number | null = null;
    try {
      const res = await fetch(url, {
        headers: { Range: 'bytes=0-7' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      head = buf.subarray(0, 5).toString('latin1');
      const range = res.headers.get('content-range');
      const total = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length'));
      sizeBytes = Number.isFinite(total) && total > 0 ? total : null;
    } catch (err) {
      this.logger.warn({ err }, 'Could not read the uploaded campaign document');
      throw new BadRequestException('We could not read that document. Upload it again.');
    }
    if (head !== '%PDF-') {
      throw new BadRequestException('That file is not a valid PDF. Export it as PDF and upload it again.');
    }
    return { url, name: sanitizeDocumentName(rawName), sizeBytes };
  }

  /**
   * Download counts for a campaign's document: how many of the campaign's
   * actual recipients opened it, and how many times in total. Keys that do
   * not belong to a recipient (test sends, guessed links) are not counted.
   */
  async documentStats(id: string, organizationId: string) {
    const campaign = await this.get(id, organizationId);
    if (!campaign.documentUrl) return { recipients: 0, opens: 0 };
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    const sends = await this.prisma.campaignSend.findMany({
      where: { campaignId: id },
      select: { recipientEmail: true },
    });
    const valid = new Set(sends.map((r) => documentRecipientKey(pepper, id, r.recipientEmail)));
    const rows = await this.prisma.$queryRawUnsafe<Array<{ recipient_key: string; download_count: number }>>(
      `select recipient_key, download_count from campaign_document_downloads where campaign_id = $1::uuid`,
      id,
    );
    let recipients = 0;
    let opens = 0;
    for (const r of rows) {
      if (!valid.has(r.recipient_key)) continue;
      recipients += 1;
      opens += Number(r.download_count);
    }
    return { recipients, opens };
  }

  /**
   * Public download redirect behind the email's Download PDF button. Records
   * the open against the recipient key when it is well formed, then forwards
   * to the campaign's own stored document (never to a URL from the request).
   * Returns null when the campaign has no valid document.
   */
  async documentRedirect(campaignId: string, recipientKey: string | undefined): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return null;
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { documentUrl: true, status: true },
    });
    const url = acceptDocumentUrl(campaign?.documentUrl, this.cfg.get<string>('S3_PUBLIC_BASE_URL'));
    if (!url) return null;
    if (recipientKey && /^[A-Za-z0-9_-]{22}$/.test(recipientKey)) {
      try {
        await this.prisma.$executeRawUnsafe(
          `insert into campaign_document_downloads (campaign_id, recipient_key)
           values ($1::uuid, $2)
           on conflict (campaign_id, recipient_key)
           do update set download_count = campaign_document_downloads.download_count + 1,
                         last_at = now()`,
          campaignId,
          recipientKey,
        );
      } catch (err) {
        // Counting must never block the download.
        this.logger.warn({ err, campaignId }, 'Could not record a document download');
      }
    }
    return url;
  }
  /**
   * Accept a flyer URL only if it points at our own media host under
   * campaign_flyers/ (what the upload flow produces). Anything else is
   * refused with a message the organizer can act on.
   */
  private requireFlyerUrl(raw: string): string {
    const ok = acceptFlyerUrl(raw, this.cfg.get<string>('S3_PUBLIC_BASE_URL'));
    if (!ok) {
      throw new BadRequestException(
        'The flyer must be an image uploaded through Orkora. Upload it again from the campaign editor.',
      );
    }
    return ok;
  }

  async patch(
    id: string,
    organizationId: string,
    patch: Partial<{
      name: string;
      subject: string;
      previewText: string;
      bodyMarkdown: string;
      fromName: string;
      fromEmail: string;
      replyTo: string;
      audienceId: string;
      eventId: string;
      flyerUrl: string | null;
      documentUrl: string | null;
      documentName: string;
    }>,
  ) {
    const existing = await this.get(id, organizationId);
    // A new audience must belong to this organization, as on create.
    if (patch.audienceId) {
      const audience = await this.prisma.campaignAudience.findFirst({
        where: { id: patch.audienceId, organizationId },
        select: { id: true },
      });
      if (!audience) throw new BadRequestException('Audience not found for this organization');
    }
    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      throw new ConflictException(`Cannot edit a campaign in status ${existing.status}`);
    }
    const data: Record<string, unknown> = { ...patch };
    delete data.documentUrl;
    delete data.documentName;
    if (typeof patch.subject === 'string') data.subject = this.requireSubject(patch.subject);
    if (typeof patch.fromName === 'string') data.fromName = safeFromName(patch.fromName);
    if (typeof patch.fromEmail === 'string') data.fromEmail = this.lockedFromEmail(patch.fromEmail);
    if (typeof patch.replyTo === 'string') data.replyTo = this.requireReplyTo(patch.replyTo);
    // null (or empty) removes the document; a new value must be one of our
    // uploaded PDFs. A name alone renames the current document.
    if (patch.documentUrl === null || patch.documentUrl === '') {
      data.documentUrl = null;
      data.documentName = null;
      data.documentSizeBytes = null;
    } else if (typeof patch.documentUrl === 'string') {
      const doc = await this.requireDocument(patch.documentUrl, patch.documentName);
      data.documentUrl = doc.url;
      data.documentName = doc.name;
      data.documentSizeBytes = doc.sizeBytes;
    } else if (typeof patch.documentName === 'string' && existing.documentUrl) {
      data.documentName = sanitizeDocumentName(patch.documentName);
    }
    if (typeof patch.bodyMarkdown === 'string') {
      data.bodyHtml = markdownToHtml(patch.bodyMarkdown);
    }
    // null (or empty) removes the flyer; a new value must pass the host check.
    if (patch.flyerUrl === null || patch.flyerUrl === '') {
      data.flyerUrl = null;
    } else if (typeof patch.flyerUrl === 'string') {
      data.flyerUrl = this.requireFlyerUrl(patch.flyerUrl);
    }
    return this.prisma.campaign.update({ where: { id }, data });
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.get(id, organizationId);
    if (existing.status !== 'draft') {
      throw new ConflictException('Only draft campaigns can be deleted');
    }
    await this.prisma.campaign.delete({ where: { id } });
  }

  // ------------------- SEND -------------------

  /**
   * Test send. Single recipient, immediate, NOT recorded in
   * campaign_sends (no need - it's a developer / organizer
   * verification, not a real send).
   */
  async testSend(id: string, organizationId: string, emailRaw: string, actorUserId?: string) {
    const campaign = await this.get(id, organizationId);
    const email = String(emailRaw ?? '').trim().toLowerCase();
    if (!isPlainEmailAddress(email)) throw new BadRequestException('Enter a single email address.');
    if (!actorUserId) throw new ForbiddenException('Sign in again to send a test.');
    // A test address is not a registrant, so there is no attendee name to fill
    // {{first_name}} with; previews used to read "Hi ,". Use the name of the
    // organizer sending the test so the preview looks like the real thing.
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { fullName: true, emailVerified: true },
    });
    // Abuse rule: a test send is not a way to mail strangers. The sender must
    // have a verified email, and the recipient must be a verified member of
    // this organization.
    if (!actor?.emailVerified) {
      throw new ForbiddenException('Verify your email address before sending tests.');
    }
    const member = await this.prisma.user.findFirst({
      where: { email, emailVerified: true, memberships: { some: { organizationId } } },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException(
        'Test emails can only go to verified members of your team. Invite the address to your team first.',
      );
    }
    if (this.guard) {
      const ok = await this.guard.allow('campaign_test', [
        { name: 'user', value: actorUserId, limit: TEST_SENDS_PER_USER_PER_DAY, windowSeconds: 86_400 },
      ]);
      if (!ok) throw new OutboundLimitError('Test send limit reached for today. Please try again tomorrow.');
    }
    const recipient: Recipient = {
      email,
      name: actor.fullName?.trim() || null,
      userId: null,
    };
    const html = this.renderForRecipient(campaign, recipient);
    await this.postmarkSingle({
      from: this.fromHeader(campaign),
      to: email,
      replyTo: this.safeReplyTo(campaign.replyTo),
      subject: `[TEST] ${this.subjectForRecipient(campaign.subject, recipient)}`,
      htmlBody: html,
      tag: `campaign-test:${campaign.id}`,
      metadata: { campaignId: campaign.id, mode: 'test' },
    });
  }

  /**
   * Send-now. Materialises the audience, writes campaign_sends rows
   * (queued), then dispatches Postmark batches. Returns the recipient
   * count so the caller can confirm.
   *
   * Slice A runs the dispatch INLINE (synchronously) for audiences up
   * to 2000 recipients - keeps the implementation simple. Larger
   * audiences should wait for Slice B's BullMQ worker to avoid
   * blocking the request.
   */
  async sendNow(id: string, organizationId: string, actorUserId?: string) {
    const campaign = await this.get(id, organizationId);
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new ConflictException(`Cannot send a campaign in status ${campaign.status}`);
    }

    const recipients = await this.audiences.materialise(campaign.audienceId, organizationId);
    if (recipients.length === 0) {
      throw new BadRequestException('Audience has no recipients');
    }
    if (recipients.length > 2000) {
      throw new BadRequestException(
        'Slice A supports up to 2000 recipients per campaign. Wait for Slice B (queue-backed) for larger sends.',
      );
    }

    if (this.guard?.disabled) {
      throw new OutboundLimitError('Sending is paused on Orkora right now. Please try again later.');
    }

    // Per-org rolling-24h send cap. Guards against a "click Send on a
    // huge audience by mistake" accident that burns Postmark quota and
    // irreversibly emails real people. Counted over campaign_sends by
    // queuedAt, so rows still queued or that failed count too (counting
    // sentAt let a send in progress, or a failed one, slip under the cap).
    let cap = Number(this.cfg.get<number>('CAMPAIGNS_DAILY_CAP_PER_ORG') ?? 1000);
    // A brand-new organization starts with a small daily allowance, so a
    // throwaway account cannot mail a large list on day one.
    const orgCreated = (campaign as { organization?: { createdAt?: Date | string } | null }).organization?.createdAt;
    const newOrgDays = Number(this.cfg.get<number>('CAMPAIGNS_NEW_ORG_DAYS') ?? 14);
    if (orgCreated && Date.now() - new Date(orgCreated).getTime() < newOrgDays * 86_400_000) {
      cap = Math.min(cap, Number(this.cfg.get<number>('CAMPAIGNS_NEW_ORG_DAILY_CAP') ?? 200));
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alreadySent = await this.prisma.campaignSend.count({
      where: { organizationId, queuedAt: { gte: since } },
    });
    if (alreadySent + recipients.length > cap) {
      const remaining = Math.max(0, cap - alreadySent);
      throw new BadRequestException(
        `Daily send cap reached. Limit is ${cap} recipients per organisation per rolling 24 hours; ` +
          `you have already sent ${alreadySent} in the last 24h; this campaign would add ${recipients.length}. ` +
          `Remaining today: ${remaining}. Wait for the window to roll, or contact hello@orkora.events to raise the cap.`,
      );
    }

    // Platform-wide and per-sender daily budgets, counted atomically in the
    // shared counter, on top of the per-organization cap above.
    // The sender's own budget is checked first, so one sender over their
    // limit can never spend the shared platform budget; any later refusal
    // gives the units back.
    const budgetN = recipients.length;
    const userKey = actorUserId ? `user:${actorUserId}` : null;
    let spentUser = false;
    let spentGlobal = false;
    const refund = async () => {
      if (!this.guard) return;
      if (spentUser && userKey) await this.guard.refundBulk('campaign', userKey, budgetN);
      if (spentGlobal) await this.guard.refundBulk('campaign', 'global', budgetN);
    };
    if (this.guard) {
      if (userKey) {
        spentUser = await this.guard.allowBulk(
          'campaign',
          userKey,
          budgetN,
          Number(this.cfg.get<number>('CAMPAIGNS_USER_DAILY_CAP') ?? 2000),
        );
        if (!spentUser) {
          throw new OutboundLimitError('Campaign sending limit reached for today. Please try again tomorrow.');
        }
      }
      spentGlobal = await this.guard.allowBulk(
        'campaign',
        'global',
        budgetN,
        Number(this.cfg.get<number>('CAMPAIGNS_GLOBAL_DAILY_CAP') ?? 20000),
      );
      if (!spentGlobal) {
        await refund();
        throw new OutboundLimitError('Campaign sending limit reached for today. Please try again tomorrow.');
      }
    }

    // Atomic claim: only one request can move this campaign out of
    // draft/scheduled, so a double click or two tabs cannot send it twice.
    const claimed = await this.prisma.campaign.updateMany({
      where: { id, organizationId, status: { in: ['draft', 'scheduled'] } },
      data: { status: 'sending', sentStartedAt: new Date(), recipientCount: recipients.length },
    });
    if (claimed.count !== 1) {
      await refund();
      throw new ConflictException('This campaign is already being sent.');
    }

    // Idempotency: insert campaign_sends rows in a single batch with
    // ON CONFLICT DO NOTHING semantics. createMany with skipDuplicates
    // collapses by the (campaign_id, recipient_email) unique index.

    await this.prisma.campaignSend.createMany({
      data: recipients.map((r) => ({
        campaignId: id,
        organizationId,
        userId: r.userId,
        recipientEmail: r.email,
        recipientName: r.name ?? null,
        status: 'queued',
      })),
      skipDuplicates: true,
    });

    const from = this.fromHeader(campaign);
    const replyTo = this.safeReplyTo(campaign.replyTo);
    // Send in batches of 500
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const all = recipients.slice(i, i + BATCH_SIZE);
      // Envelope rule: one plain address per message. Anything else is marked
      // failed and never handed to Postmark.
      const chunk = all.filter((r) => isPlainEmailAddress(r.email));
      const rejected = all.filter((r) => !isPlainEmailAddress(r.email));
      if (rejected.length) {
        await this.prisma.campaignSend.updateMany({
          where: { campaignId: id, recipientEmail: { in: rejected.map((r) => r.email) }, status: 'queued' },
          data: { status: 'failed' },
        });
      }
      if (chunk.length === 0) continue;
      const payload = chunk.map((r) => ({
        From: from,
        To: r.email,
        ReplyTo: replyTo,
        Subject: this.subjectForRecipient(campaign.subject, r),
        HtmlBody: this.renderForRecipient(campaign, r),
        Tag: `campaign:${campaign.id}`,
        Metadata: { campaignId: campaign.id, organizationId },
        MessageStream: 'broadcast',
      }));
      try {
        const responses = await this.postmarkBatch(payload);
        // Pair responses back to rows by email + update postmark_message_id.
        // Postmark returns objects in the same order as the request, so we
        // can correlate by index.
        for (let j = 0; j < responses.length; j++) {
          const row = chunk[j];
          const resp = responses[j];
          if (row && resp?.MessageID) {
            await this.prisma.campaignSend.update({
              where: { campaignId_recipientEmail: { campaignId: id, recipientEmail: row.email } },
              data: { status: 'sent', sentAt: new Date(), postmarkMessageId: resp.MessageID },
            });
          }
        }
      } catch (err) {
        this.logger.warn({ err, campaignId: id, chunkSize: chunk.length }, 'Postmark batch failed');
        // Mark the chunk as failed; an organizer can retry from the UI.
        await this.prisma.campaignSend.updateMany({
          where: {
            campaignId: id,
            recipientEmail: { in: chunk.map((c) => c.email) },
            status: 'queued',
          },
          data: { status: 'failed' },
        });
      }
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'sent', sentCompletedAt: new Date() },
    });

    return { recipientCount: recipients.length };
  }

  /**
   * Build the final HTML body for one recipient: markdown -> html ->
   * token substitution -> wrap in brand template with unsubscribe.
   */
  /**
   * Token values for one recipient, shared by the body, the preview line and
   * the subject so all three always personalise the same way.
   */
  private tokenContext(recipient: Recipient): Record<string, string> {
    // Recipient names were typed by whoever registered, so they are cleaned
    // (no links, one line) before they can appear in a subject or body.
    const name = sanitizeForEmail(recipient.name, 80);
    return {
      first_name: name.split(/\s+/)[0] ?? '',
      full_name: name,
      email: recipient.email,
    };
  }

  /** Subject line for one recipient: tokens filled as plain text, one line. */
  private subjectForRecipient(subject: string, recipient: Recipient): string {
    return oneLine(applyTokensText(subject, this.tokenContext(recipient))) || 'An update from your event';
  }

  private renderForRecipient(
    campaign: {
      id: string;
      bodyHtml: string;
      bodyMarkdown: string;
      fromName: string;
      flyerUrl?: string | null;
      documentUrl?: string | null;
      documentName?: string | null;
      documentSizeBytes?: number | null;
      previewText?: string | null;
      organization?: { name: string; logoUrl: string | null; postalAddress?: string | null } | null;
    },
    recipient: Recipient,
  ): string {
    const ctx = this.tokenContext(recipient);
    const personalisedBody = applyTokens(campaign.bodyHtml, ctx);
    const preheader = renderPreheader(campaign.previewText, ctx);
    // Re-check the stored flyer at send time: it is rendered only if it still
    // passes the same host rule enforced on save.
    const flyer = acceptFlyerUrl(campaign.flyerUrl, this.cfg.get<string>('S3_PUBLIC_BASE_URL'));
    // The document is linked through our download redirect with an opaque
    // per-recipient key, so opens can be counted without personal data in
    // the link. Re-checked at send time like the flyer.
    const doc = acceptDocumentUrl(campaign.documentUrl, this.cfg.get<string>('S3_PUBLIC_BASE_URL'));
    const docBlock = doc
      ? renderDocumentBlock({
          href: this.documentDownloadUrl(campaign.id, recipient.email),
          name: sanitizeDocumentName(campaign.documentName),
          sizeBytes: campaign.documentSizeBytes,
        })
      : '';
    const body = `${flyer ? `${renderFlyerBlock(flyer)}\n` : ''}${docBlock ? `${docBlock}\n` : ''}${personalisedBody}`;
    const unsubUrl = this.unsubscribeUrl(campaign.id, recipient.email);
    // Header carries the organizer: their uploaded logo when it passes the
    // same "our media only" rule as flyers, otherwise their name.
    const header = renderBrandHeader({
      name: campaign.organization?.name,
      logoUrl: acceptLogoUrl(
        campaign.organization?.logoUrl,
        this.cfg.get<string>('S3_PUBLIC_BASE_URL'),
      ),
    });
    // Footer address: the organization's own mailing address when set (it is
    // their event being promoted), otherwise the platform-wide fallback.
    const postal =
      campaign.organization?.postalAddress?.trim() ||
      (this.cfg.get<string>('CAMPAIGN_POSTAL_ADDRESS') ?? '').trim();
    return this.wrap(body, unsubUrl, preheader, header, postal);
  }

  private wrap(
    bodyHtml: string,
    unsubUrl: string,
    preheaderHtml = '',
    headerHtml = renderBrandHeader({}),
    postalAddress = '',
  ): string {
    // Physical postal address in the footer is expected for commercial email
    // (CAN-SPAM). Rendered only when set; HTML-escaped since it lands in
    // markup, with line breaks kept so a multi-line address reads naturally.
    const postalHtml = postalAddress
      ? `<br><br>${postalAddress
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r?\n/g, '<br>')}`
      : '';
    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${preheaderHtml}
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
${headerHtml}
<tr><td style="padding:32px 28px 24px 28px;color:#0F172A;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px 28px 28px;color:#94A3B8;font-size:12px;line-height:1.5;border-top:1px solid #E2E8F0;">
You are receiving this because you registered for one of our events.
<a href="${unsubUrl}" style="color:#6D28D9;">Unsubscribe</a> at any time.${postalHtml}
<div style="margin-top:10px;padding-top:10px;border-top:1px solid #E2E8F0;font-size:11px;">Sent by ${statutoryLines()
      .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>')}</div>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  }

  private documentDownloadUrl(campaignId: string, email: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    const key = documentRecipientKey(pepper, campaignId, email);
    const apiUrl = (this.cfg.get<string>('API_URL') ?? 'https://api.orkora.events').replace(/\/$/, '');
    return `${apiUrl}/v1/c/doc/${campaignId}?r=${key}`;
  }

  private unsubscribeUrl(campaignId: string, email: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    const sig = createHmac('sha256', pepper)
      .update(`${campaignId}|${email.toLowerCase()}`)
      .digest('base64url');
    const apiUrl = (this.cfg.get<string>('API_URL') ?? 'https://api.orkora.events').replace(/\/$/, '');
    return `${apiUrl}/v1/me/unsubscribe?c=${campaignId}&e=${encodeURIComponent(email)}&s=${sig}`;
  }

  // ------------------- WEBHOOKS -------------------

  /**
   * Postmark webhook. Postmark posts one event per request (delivery,
   * bounce, open, click, etc). Each event has a MessageID we use to
   * find the corresponding campaign_send row.
   *
   * Idempotent: status transitions are monotonic (queued -> sent ->
   * delivered -> opened -> clicked). We do not downgrade from clicked
   * back to delivered if Postmark resends an earlier event.
   */
  async handlePostmarkWebhook(event: PostmarkEvent) {
    const messageId = event.MessageID;
    if (!messageId) return;
    const send = await this.prisma.campaignSend.findFirst({
      where: { postmarkMessageId: messageId },
    });
    if (!send) return; // not our message

    const now = new Date();
    const updates: Record<string, unknown> = {};
    switch (event.RecordType) {
      case 'Delivery':
        updates.status = 'delivered';
        updates.deliveredAt = now;
        break;
      case 'Open':
        if (!send.firstOpenedAt) updates.firstOpenedAt = now;
        if (send.status === 'sent' || send.status === 'delivered') updates.status = 'opened';
        break;
      case 'Click':
        if (!send.firstClickedAt) updates.firstClickedAt = now;
        updates.status = 'clicked';
        break;
      case 'Bounce':
      case 'SpamComplaint':
        updates.status = event.RecordType === 'Bounce' ? 'bounced' : 'complained';
        updates.bouncedAt = now;
        // Add to suppression list so future sends skip this address.
        await this.prisma.emailSuppression.upsert({
          where: {
            organizationId_email: {
              organizationId: send.organizationId,
              email: send.recipientEmail,
            },
          },
          create: {
            organizationId: send.organizationId,
            email: send.recipientEmail,
            reason: event.RecordType === 'Bounce' ? 'bounce' : 'complaint',
          },
          update: {},
        });
        break;
      case 'SubscriptionChange':
        if (event.SuppressSending) {
          updates.status = 'unsubscribed';
          updates.unsubscribedAt = now;
          await this.prisma.emailSuppression.upsert({
            where: {
              organizationId_email: {
                organizationId: send.organizationId,
                email: send.recipientEmail,
              },
            },
            create: {
              organizationId: send.organizationId,
              email: send.recipientEmail,
              reason: 'unsubscribe',
            },
            update: {},
          });
        }
        break;
    }
    if (Object.keys(updates).length > 0) {
      await this.prisma.campaignSend.update({ where: { id: send.id }, data: updates });
    }
  }

  // ------------------- UNSUBSCRIBE -------------------

  /**
   * One-click unsubscribe. Verifies the HMAC, looks up the
   * (organizationId, email) from the campaign, suppresses future
   * sends. Returns whether the unsub was a no-op (already suppressed).
   */
  async unsubscribe(campaignId: string, email: string, sig: string) {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    const expected = createHmac('sha256', pepper)
      .update(`${campaignId}|${email.toLowerCase()}`)
      .digest('base64url');
    if (sig !== expected) {
      throw new ForbiddenException('Invalid unsubscribe token');
    }
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { organizationId: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const upserted = await this.prisma.emailSuppression.upsert({
      where: {
        organizationId_email: {
          organizationId: campaign.organizationId,
          email,
        },
      },
      create: {
        organizationId: campaign.organizationId,
        email,
        reason: 'unsubscribe',
      },
      update: {},
    });
    await this.prisma.campaignSend.updateMany({
      where: { campaignId, recipientEmail: email },
      data: { status: 'unsubscribed', unsubscribedAt: new Date() },
    });
    return { suppressionId: upserted.id };
  }

  // ------------------- POSTMARK CALLERS -------------------

  private async postmarkSingle(input: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    htmlBody: string;
    tag: string;
    metadata?: Record<string, string>;
  }) {
    assertSafeEnvelope(input.to, input.subject);
    const token = this.cfg.get<string>('POSTMARK_TOKEN');
    if (!token) {
      this.logger.warn(`[campaigns/test] Would send: ${input.subject} -> ${input.to}`);
      return { MessageID: `mock-${randomUUID()}` };
    }
    const r = await fetch(`${POSTMARK_API}/email`, {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': token,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        From: input.from,
        To: input.to,
        ReplyTo: input.replyTo,
        Subject: input.subject,
        HtmlBody: input.htmlBody,
        Tag: input.tag,
        Metadata: input.metadata,
        MessageStream: 'broadcast',
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Postmark send failed: ${r.status} ${text.slice(0, 200)}`);
    }
    return (await r.json()) as { MessageID: string };
  }

  private async postmarkBatch(
    payload: Array<{ To: string; Subject: string }>,
  ): Promise<Array<{ MessageID?: string; ErrorCode?: number }>> {
    for (const m of payload) assertSafeEnvelope(m.To, m.Subject);
    const token = this.cfg.get<string>('POSTMARK_TOKEN');
    if (!token) {
      // No token: pretend every message landed with a mock id. Useful
      // for local dev and tests.
      return payload.map(() => ({ MessageID: `mock-${randomUUID()}` }));
    }
    const r = await fetch(`${POSTMARK_API}/email/batch`, {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': token,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Postmark batch failed: ${r.status} ${text.slice(0, 200)}`);
    }
    return (await r.json()) as Array<{ MessageID?: string; ErrorCode?: number }>;
  }
}

interface PostmarkEvent {
  RecordType: 'Delivery' | 'Open' | 'Click' | 'Bounce' | 'SpamComplaint' | 'SubscriptionChange';
  MessageID?: string;
  SuppressSending?: boolean;
}
