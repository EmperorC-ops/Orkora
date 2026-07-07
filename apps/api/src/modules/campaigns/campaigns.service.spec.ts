import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { AudienceMaterialiser } from './audience.materialiser';
import { PrismaService } from '../../database/prisma/prisma.service';
import { markdownToHtml, applyTokens } from './markdown';
import { createHmac } from 'crypto';

const PEPPER = 'test-pepper-very-long-1234567890';

function makeCfg(over: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    REFRESH_TOKEN_PEPPER: PEPPER,
    APP_URL: 'https://orkora.test',
    API_URL: 'https://api.orkora.test',
  };
  const merged = { ...defaults, ...over };
  return {
    get: (key: string) => merged[key],
    getOrThrow: (key: string) => {
      if (!(key in merged)) throw new Error(`missing key ${key}`);
      return merged[key];
    },
  };
}

describe('markdownToHtml', () => {
  it('escapes html in body content', () => {
    const out = markdownToHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders bold + italic + links', () => {
    const out = markdownToHtml('Hello **world**, this is *bold* and a [link](https://orkora.events)');
    expect(out).toContain('<strong>world</strong>');
    expect(out).toContain('<em>bold</em>');
    expect(out).toContain('href="https://orkora.events"');
  });

  it('rejects javascript: links by routing to #', () => {
    const out = markdownToHtml('[evil](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });

  it('renders unordered lists', () => {
    const out = markdownToHtml('- one\n- two\n- three');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
  });

  it('renders ordered lists', () => {
    const out = markdownToHtml('1. one\n2. two');
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>one</li>');
  });
});

describe('applyTokens', () => {
  it('substitutes known tokens', () => {
    const out = applyTokens('Hello {{first_name}}', { first_name: 'Ada' });
    expect(out).toBe('Hello Ada');
  });

  it('leaves unknown tokens visible so typos are caught', () => {
    const out = applyTokens('Hi {{frist_name}}', { first_name: 'Ada' });
    expect(out).toContain('{{frist_name}}');
  });

  it('escapes interpolated values to prevent injection via personalization', () => {
    const out = applyTokens('Hello {{name}}', { name: '<script>x</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('CampaignsService.unsubscribe', () => {
  let service: CampaignsService;
  let prisma: {
    campaign: { findUnique: jest.Mock };
    emailSuppression: { upsert: jest.Mock };
    campaignSend: { updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      campaign: { findUnique: jest.fn() },
      emailSuppression: { upsert: jest.fn() },
      campaignSend: { updateMany: jest.fn() },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: makeCfg() },
        { provide: AudienceMaterialiser, useValue: {} },
      ],
    }).compile();
    service = mod.get(CampaignsService);
  });

  it('rejects an unsigned unsubscribe attempt', async () => {
    await expect(service.unsubscribe('camp-1', 'a@b.co', 'wrong-sig')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts a correctly signed unsubscribe', async () => {
    const campaignId = 'camp-1';
    const email = 'a@b.co';
    const sig = createHmac('sha256', PEPPER).update(`${campaignId}|${email}`).digest('base64url');
    prisma.campaign.findUnique.mockResolvedValue({ organizationId: 'org-1' });
    prisma.emailSuppression.upsert.mockResolvedValue({ id: 'sup-1' });
    prisma.campaignSend.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.unsubscribe(campaignId, email, sig);
    expect(result.suppressionId).toBe('sup-1');
    expect(prisma.emailSuppression.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_email: { organizationId: 'org-1', email } },
        create: expect.objectContaining({ reason: 'unsubscribe' }),
      }),
    );
  });

  it('throws when the campaign id does not exist', async () => {
    const campaignId = 'camp-missing';
    const email = 'a@b.co';
    const sig = createHmac('sha256', PEPPER).update(`${campaignId}|${email}`).digest('base64url');
    prisma.campaign.findUnique.mockResolvedValue(null);
    await expect(service.unsubscribe(campaignId, email, sig)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CampaignsService.sendNow daily cap', () => {
  // The service's get() method uses prisma.campaign.findFirst(), and sendNow()
  // updates the campaign via prisma.campaign.update(). We stub both plus the
  // campaignSend query surface the cap check touches. The 3rd (default cap)
  // test also mocks fetch so Postmark doesn't fire against the network.
  let service: CampaignsService;
  let prisma: {
    campaign: { findFirst: jest.Mock; update: jest.Mock };
    campaignSend: { count: jest.Mock; createMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  let audiences: { materialise: jest.Mock };

  const campaignRow = () => ({
    id: 'camp-1',
    organizationId: 'org-1',
    status: 'draft',
    audienceId: 'aud-1',
    fromName: 'Orkora',
    fromEmail: 'no-reply@orkora.events',
    replyTo: null,
    subject: 'Hi',
    bodyMarkdown: 'Hello {{name}}',
    bodyHtml: '<p>Hello {{name}}</p>',
    previewText: null,
    audience: { id: 'aud-1', name: 'All', cachedCount: 0 },
  });

  beforeEach(async () => {
    prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue(campaignRow()),
        update: jest.fn().mockResolvedValue({}),
      },
      campaignSend: {
        count: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    audiences = { materialise: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: makeCfg({ CAMPAIGNS_DAILY_CAP_PER_ORG: '100', POSTMARK_TOKEN: 'x' }) },
        { provide: AudienceMaterialiser, useValue: audiences },
      ],
    }).compile();
    service = mod.get(CampaignsService);
  });

  it('rejects a send that would exceed the per-org rolling-24h cap', async () => {
    audiences.materialise.mockResolvedValue(
      new Array(60).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null })),
    );
    prisma.campaignSend.count.mockResolvedValue(50); // 50 already sent, adding 60 blows past 100

    await expect(service.sendNow('camp-1', 'org-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.sendNow('camp-1', 'org-1')).rejects.toThrow(/Daily send cap reached/);
    expect(prisma.campaignSend.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });

  it('allows a send within the cap and calls the count query', async () => {
    // Under-cap: 30 to send, 50 already, 80 <= 100.
    audiences.materialise.mockResolvedValue(
      new Array(30).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null })),
    );
    prisma.campaignSend.count.mockResolvedValue(50);
    // Silence the Postmark network call so the batch loop returns cleanly.
    const fetchSpy = jest.spyOn(globalThis, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => new Array(30).fill(null).map((_, i) => ({ MessageID: `mid-${i}` })),
    } as never);

    try {
      await service.sendNow('camp-1', 'org-1');
    } finally {
      fetchSpy.mockRestore();
    }
    expect(prisma.campaignSend.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });

  it('uses the default cap of 1000 when the env var is unset', async () => {
    // Rebuild with no cap override, but still provide a Postmark token so
    // the send code path does not fail earlier for unrelated reasons.
    const cfg = makeCfg({ POSTMARK_TOKEN: 'x' });
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: cfg },
        { provide: AudienceMaterialiser, useValue: audiences },
      ],
    }).compile();
    const svc = mod.get(CampaignsService);

    audiences.materialise.mockResolvedValue(
      new Array(1001).fill(null).map((_, i) => ({ email: `u${i}@x.co`, name: 'U', userId: null })),
    );
    prisma.campaignSend.count.mockResolvedValue(0);

    // 1001 recipients passes the 2000 Slice A cap but trips the 1000 daily cap.
    await expect(svc.sendNow('camp-1', 'org-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.sendNow('camp-1', 'org-1')).rejects.toThrow(/1000 recipients per organisation/);
  });
});
