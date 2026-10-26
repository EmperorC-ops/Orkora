import { CampaignsService } from './campaigns.service';
import { OutboundGuardService } from '../../common/outbound/outbound-guard.service';
import { MemoryRateCounter } from '../../common/outbound/rate-counter';

/**
 * Campaign abuse rules (docs/SIGNUP_ABUSE_2026-10.md): test sends go only to
 * verified team members from a verified sender, campaigns are always sent From
 * our own address, a campaign can be claimed for sending only once, the daily
 * cap counts queued rows, and every envelope is one plain address with a
 * one-line subject.
 */

function cfg(values: Record<string, unknown> = {}) {
  return {
    get: (k: string) => values[k],
    getOrThrow: (k: string) => values[k] ?? 'test-secret',
  } as never;
}

function guard(values: Record<string, unknown> = {}) {
  return OutboundGuardService.withCounter(cfg(values), new MemoryRateCounter());
}

const campaignRow = (over: Record<string, unknown> = {}) => ({
  id: 'camp-1',
  organizationId: 'org-1',
  status: 'draft',
  audienceId: 'aud-1',
  fromName: 'Acme "Events" <ceo@bank.example>',
  fromEmail: 'ceo@bank.example',
  replyTo: 'a@x.co, b@y.co',
  subject: 'Hello {{first_name}}',
  bodyMarkdown: 'Hi',
  bodyHtml: '<p>Hi</p>',
  previewText: null,
  flyerUrl: null,
  organization: { name: 'Acme', logoUrl: null, postalAddress: null },
  audience: { id: 'aud-1', name: 'All', cachedCount: 0 },
  ...over,
});

function build(opts: {
  actor?: { fullName: string; emailVerified: boolean } | null;
  member?: { id: string } | null;
  guardCfg?: Record<string, unknown>;
  claimCount?: number;
  alreadySent?: number;
}) {
  const prisma = {
    campaign: {
      findFirst: jest.fn().mockResolvedValue(campaignRow()),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      create: jest.fn(async (a: { data: unknown }) => a.data),
    },
    campaignAudience: { findFirst: jest.fn().mockResolvedValue({ id: 'aud-1' }) },
    campaignSend: {
      count: jest.fn().mockResolvedValue(opts.alreadySent ?? 0),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(opts.actor === undefined ? { fullName: 'Ada', emailVerified: true } : opts.actor),
      findFirst: jest.fn().mockResolvedValue(opts.member === undefined ? { id: 'm-1' } : opts.member),
    },
  };
  const audiences = { materialise: jest.fn().mockResolvedValue([]) };
  const svc = new CampaignsService(
    prisma as never,
    cfg({ POSTMARK_TOKEN: 'x', EMAIL_FROM_ADDRESS: 'no-reply@orkora.events', APP_URL: 'https://orkora.events', API_URL: 'https://api.orkora.events' }),
    audiences as never,
    guard(opts.guardCfg),
  );
  const fetchMock = jest.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => (Array.isArray(body) ? body.map((_: unknown, i: number) => ({ MessageID: `m-${i}` })) : { MessageID: 'm-1' }),
      text: async () => '',
    };
  });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return { svc, prisma, audiences, fetchMock };
}

async function statusOf(p: Promise<unknown>): Promise<number | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { getStatus?: () => number }).getStatus?.();
  }
  return undefined;
}

describe('CampaignsService.testSend recipients', () => {
  it('refuses a recipient who is not a verified member of the organization', async () => {
    const { svc, fetchMock } = build({ member: null });
    expect(await statusOf(svc.testSend('camp-1', 'org-1', 'stranger@example.com', 'u-1'))).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a sender whose own email is not verified', async () => {
    const { svc, fetchMock } = build({ actor: { fullName: 'Ada', emailVerified: false } });
    expect(await statusOf(svc.testSend('camp-1', 'org-1', 'me@example.com', 'u-1'))).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a list of addresses', async () => {
    const { svc } = build({});
    expect(await statusOf(svc.testSend('camp-1', 'org-1', 'a@x.co,b@y.co', 'u-1'))).toBe(400);
  });

  it('checks membership in this organization for the typed address', async () => {
    const { svc, prisma } = build({});
    await svc.testSend('camp-1', 'org-1', 'Me@Example.com', 'u-1');
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'me@example.com', emailVerified: true, memberships: { some: { organizationId: 'org-1' } } },
      }),
    );
  });

  it('caps test sends at 20 a day per sender', async () => {
    const { svc, fetchMock } = build({});
    for (let i = 0; i < 20; i++) await svc.testSend('camp-1', 'org-1', 'me@example.com', 'u-1');
    expect(await statusOf(svc.testSend('camp-1', 'org-1', 'me@example.com', 'u-1'))).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it('sends From our own address with a cleaned display name, and drops a list Reply-to', async () => {
    const { svc, fetchMock } = build({});
    await svc.testSend('camp-1', 'org-1', 'me@example.com', 'u-1');
    const sent = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(sent.From).toMatch(/<no-reply@orkora\.events>$/);
    expect(sent.From).not.toContain('bank.example');
    expect(sent.From.split('<').length).toBe(2);
    expect(sent.ReplyTo).toBeUndefined();
  });
});

describe('CampaignsService.sendNow claim, cap and envelopes', () => {
  const people = (n: number) =>
    new Array(n).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null }));

  it('sends nothing when another request already claimed the campaign', async () => {
    const { svc, audiences, fetchMock, prisma } = build({ claimCount: 0 });
    audiences.materialise.mockResolvedValue(people(3));
    expect(await statusOf(svc.sendNow('camp-1', 'org-1'))).toBe(409);
    expect(prisma.campaignSend.createMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts the daily cap by queued time', async () => {
    const { svc, audiences, prisma } = build({});
    audiences.materialise.mockResolvedValue(people(2));
    await svc.sendNow('camp-1', 'org-1');
    const where = prisma.campaignSend.count.mock.calls[0]?.[0]?.where;
    expect(where.organizationId).toBe('org-1');
    expect(where.queuedAt).toBeDefined();
    expect(where.sentAt).toBeUndefined();
  });

  it('never hands Postmark a malformed recipient', async () => {
    const { svc, audiences, fetchMock, prisma } = build({});
    audiences.materialise.mockResolvedValue([
      { email: 'ok@x.co', name: 'A', userId: null },
      { email: 'bad@x.co, other@y.co', name: 'B', userId: null },
    ]);
    await svc.sendNow('camp-1', 'org-1');
    const batch = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(batch.map((m: { To: string }) => m.To)).toEqual(['ok@x.co']);
    expect(prisma.campaignSend.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });

  it('keeps a recipient name with a link out of the subject', async () => {
    const { svc, audiences, fetchMock } = build({});
    audiences.materialise.mockResolvedValue([{ email: 'ok@x.co', name: 'bit.ly/win prize', userId: null }]);
    await svc.sendNow('camp-1', 'org-1');
    const batch = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(batch[0].Subject).not.toContain('bit.ly');
  });

  it('refuses to send while the kill switch is on', async () => {
    const { svc, audiences, fetchMock } = build({ guardCfg: { OUTBOUND_SENDS_DISABLED: '1' } });
    audiences.materialise.mockResolvedValue(people(2));
    expect(await statusOf(svc.sendNow('camp-1', 'org-1'))).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CampaignsService.create door checks', () => {
  const input = {
    name: 'N',
    subject: 'Welcome',
    bodyMarkdown: 'Hi',
    fromName: 'Acme',
    fromEmail: 'boss@gmail.com',
    audienceId: 'aud-1',
  };

  it('stores our own sender address whatever From address was typed', async () => {
    const { svc } = build({});
    const out = (await svc.create('org-1', 'u-1', input)) as { fromEmail: string };
    expect(out.fromEmail).toBe('no-reply@orkora.events');
  });

  it('refuses a subject with a line break and a Reply-to list', async () => {
    const { svc } = build({});
    expect(await statusOf(svc.create('org-1', 'u-1', { ...input, subject: 'Hi\nBcc: x@y.co' }))).toBe(400);
    expect(await statusOf(svc.create('org-1', 'u-1', { ...input, replyTo: 'a@x.co, b@y.co' }))).toBe(400);
  });
});

describe('review fixes: campaign budgets and audiences', () => {
  it('limits an organization younger than 14 days to 200 recipients a day', async () => {
    const { svc, prisma, audiences } = build({});
    prisma.campaign.findFirst.mockResolvedValue(
      campaignRow({ organization: { name: 'Acme', logoUrl: null, postalAddress: null, createdAt: new Date() } }),
    );
    audiences.materialise.mockResolvedValue(
      new Array(201).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null })),
    );
    expect(await statusOf(svc.sendNow('camp-1', 'org-1', 'u-1'))).toBe(400);
  });

  it('caps one sender at 2000 recipients a day across organizations', async () => {
    const { svc, audiences } = build({});
    audiences.materialise.mockResolvedValue(
      new Array(1000).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null })),
    );
    await svc.sendNow('camp-1', 'org-1', 'u-1');
    await svc.sendNow('camp-1', 'org-1', 'u-1');
    expect(await statusOf(svc.sendNow('camp-1', 'org-1', 'u-1'))).toBe(429);
  });

  it('labels the From name "via Orkora"', async () => {
    const { svc, fetchMock } = build({});
    await svc.testSend('camp-1', 'org-1', 'me@example.com', 'u-1');
    const sent = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(sent.From).toMatch(/ via Orkora <no-reply@orkora\.events>$/);
  });
});
