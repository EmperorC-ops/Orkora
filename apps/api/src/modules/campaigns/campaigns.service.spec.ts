import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
