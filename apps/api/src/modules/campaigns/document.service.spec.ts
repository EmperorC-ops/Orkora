import { BadRequestException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { documentRecipientKey } from './document';

const BASE = 'https://cdn.orkora.events';
const DOC = `${BASE}/campaign_documents/u1/abc.pdf`;
const CID = '01a16a00-0000-7000-8000-000000000001';

function makeService(opts: { campaign?: Record<string, unknown> | null; downloads?: unknown[]; sends?: unknown[] } = {}) {
  const executed: unknown[][] = [];
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: CID, ...data }));
  const prisma = {
    campaign: {
      findUnique: jest.fn().mockResolvedValue(opts.campaign === undefined ? { documentUrl: DOC, status: 'sent' } : opts.campaign),
      findFirst: jest.fn().mockResolvedValue({ id: CID, status: 'draft', documentUrl: DOC, ...(opts.campaign ?? {}) }),
      update,
    },
    campaignSend: { findMany: jest.fn().mockResolvedValue(opts.sends ?? []) },
    $executeRawUnsafe: jest.fn().mockImplementation((...a: unknown[]) => {
      executed.push(a);
      return Promise.resolve(1);
    }),
    $queryRawUnsafe: jest.fn().mockResolvedValue(opts.downloads ?? []),
  };
  const cfg = {
    get: (k: string) => (k === 'S3_PUBLIC_BASE_URL' ? BASE : undefined),
    getOrThrow: () => 'pepper',
  };
  return { svc: new CampaignsService(prisma as never, cfg as never, {} as never), executed, update };
}

function mockFetch(bytes: string, total = 1234) {
  (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 206,
    arrayBuffer: () => Promise.resolve(Buffer.from(bytes, 'latin1')),
    headers: { get: (h: string) => (h === 'content-range' ? `bytes 0-7/${total}` : null) },
  });
}

describe('campaign document download redirect', () => {
  it('records a well-formed key and returns only the stored document', async () => {
    const { svc, executed } = makeService();
    const url = await svc.documentRedirect(CID, 'abcdefghijklmnopqrstuv');
    expect(url).toBe(DOC);
    expect(executed).toHaveLength(1);
    expect(executed[0].slice(1)).toEqual([CID, 'abcdefghijklmnopqrstuv']);
  });

  it('still redirects but does not count a malformed key', async () => {
    const { svc, executed } = makeService();
    expect(await svc.documentRedirect(CID, '<script>')).toBe(DOC);
    expect(executed).toHaveLength(0);
  });

  it('returns nothing for a campaign without a valid document', async () => {
    const { svc } = makeService({ campaign: { documentUrl: 'https://evil.example/x.pdf', status: 'sent' } });
    expect(await svc.documentRedirect(CID, undefined)).toBeNull();
    expect(await svc.documentRedirect('not-a-uuid', undefined)).toBeNull();
  });
});

describe('campaign document stats', () => {
  it('counts only keys that belong to real recipients', async () => {
    const real = documentRecipientKey('pepper', CID, 'ada@example.com');
    const { svc } = makeService({
      sends: [{ recipientEmail: 'ada@example.com' }, { recipientEmail: 'bo@example.com' }],
      downloads: [
        { recipient_key: real, download_count: 3 },
        { recipient_key: 'zzzzzzzzzzzzzzzzzzzzzz', download_count: 9 },
      ],
    });
    expect(await svc.documentStats(CID, 'org')).toEqual({ recipients: 1, opens: 3 });
  });
});

describe('attaching a campaign document', () => {
  it('accepts a real PDF and records name and size', async () => {
    mockFetch('%PDF-1.7', 2048);
    const { svc, update } = makeService();
    await svc.patch(CID, 'org', { documentUrl: DOC, documentName: 'Newsletter.pdf' });
    const data = update.mock.calls[0][0].data;
    expect(data.documentUrl).toBe(DOC);
    expect(data.documentName).toBe('Newsletter.pdf');
    expect(data.documentSizeBytes).toBe(2048);
  });

  it('refuses a file that is not really a PDF', async () => {
    mockFetch('MZ\u0090\u0000\u0003\u0000');
    const { svc, update } = makeService();
    await expect(svc.patch(CID, 'org', { documentUrl: DOC })).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a URL that is not one of our uploads', async () => {
    const { svc } = makeService();
    await expect(
      svc.patch(CID, 'org', { documentUrl: 'https://evil.example/campaign_documents/u1/a.pdf' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes the document with null', async () => {
    const { svc, update } = makeService();
    await svc.patch(CID, 'org', { documentUrl: null });
    const data = update.mock.calls[0][0].data;
    expect(data.documentUrl).toBeNull();
    expect(data.documentName).toBeNull();
  });
});
