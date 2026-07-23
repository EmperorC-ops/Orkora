import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RecordingsService } from './recordings.service';

/**
 * Unit tests for RecordingsService. Prisma and StorageService are hand-rolled
 * mocks so we can drive the create shape guards and, more importantly, the
 * gated-playback logic (public streams freely, 'ticket' needs a valid ticket,
 * 'tier' needs a matching tier).
 */

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    event: { findFirst: jest.fn(), findUnique: jest.fn() },
    session: { findFirst: jest.fn() },
    ticketTier: { findFirst: jest.fn(), findUnique: jest.fn() },
    ticket: { findUnique: jest.fn() },
    recording: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...over,
  } as never;
}

function makeStorage() {
  return {
    publicUrlFor: jest.fn((key: string) => `https://cdn.test/${key}`),
  } as never;
}

const publishedEvent = {
  id: 'e1',
  status: 'ended',
  organization: { status: 'active' },
};

describe('RecordingsService.createRecording', () => {
  it('rejects a link recording without a url', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue({ id: 'e1' });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.createRecording('o1', 'e1', {
        title: 'Keynote',
        source: 'link',
        visibility: 'public',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an upload recording without a storageKey', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue({ id: 'e1' });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.createRecording('o1', 'e1', {
        title: 'Keynote',
        source: 'upload',
        visibility: 'public',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects tier visibility without a requiredTierId', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue({ id: 'e1' });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.createRecording('o1', 'e1', {
        title: 'Keynote',
        source: 'link',
        url: 'https://youtu.be/abc',
        visibility: 'tier',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a link recording and forces tier when a tier is supplied', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue({ id: 'e1' });
    (prisma as any).ticketTier.findFirst.mockResolvedValue({ id: 't1' });
    (prisma as any).recording.create.mockImplementation((args: any) => ({
      id: 'r1',
      eventId: 'e1',
      sessionId: null,
      description: null,
      url: args.data.url,
      storageKey: null,
      durationSec: null,
      createdAt: new Date('2026-07-20T10:00:00Z'),
      publishedAt: args.data.publishedAt,
      ...args.data,
    }));
    const svc = new RecordingsService(prisma, makeStorage());

    const out = await svc.createRecording('o1', 'e1', {
      title: 'Keynote',
      source: 'link',
      url: 'https://youtu.be/abc',
      visibility: 'public',
      requiredTierId: 't1',
      publish: true,
    } as any);

    const data = (prisma as any).recording.create.mock.calls[0][0].data;
    expect(data.visibility).toBe('tier');
    expect(data.requiredTierId).toBe('t1');
    expect(data.url).toBe('https://youtu.be/abc');
    expect(data.storageKey).toBeNull();
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(out.published).toBe(true);
  });

  it('404s when the event does not belong to the org', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findFirst.mockResolvedValue(null);
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.createRecording('o1', 'e1', {
        title: 'Keynote',
        source: 'link',
        url: 'https://youtu.be/abc',
        visibility: 'public',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('RecordingsService.resolvePlayback', () => {
  it('streams a public recording without a ticket', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://youtu.be/abc',
      storageKey: null,
      durationSec: 120,
      title: 'Keynote',
      visibility: 'public',
      requiredTierId: null,
    });
    const svc = new RecordingsService(prisma, makeStorage());

    const out = await svc.resolvePlayback('ABC123', 'r1');
    expect(out.playbackUrl).toBe('https://youtu.be/abc');
    expect(out.source).toBe('link');
  });

  it('forbids a ticket-gated recording with no ticket code', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://youtu.be/abc',
      storageKey: null,
      durationSec: null,
      title: 'Keynote',
      visibility: 'ticket',
      requiredTierId: null,
    });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(svc.resolvePlayback('ABC123', 'r1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('forbids a ticket-gated recording with an invalid ticket code', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://youtu.be/abc',
      storageKey: null,
      durationSec: null,
      title: 'Keynote',
      visibility: 'ticket',
      requiredTierId: null,
    });
    (prisma as any).ticket.findUnique.mockResolvedValue(null);
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.resolvePlayback('ABC123', 'r1', 'BADCODE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a ticket-gated recording with a valid issued ticket for the event', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'upload',
      url: null,
      storageKey: 'recordings/u1/vid.mp4',
      durationSec: null,
      title: 'Keynote',
      visibility: 'ticket',
      requiredTierId: null,
    });
    (prisma as any).ticket.findUnique.mockResolvedValue({
      status: 'issued',
      tierId: 't1',
      registration: { eventId: 'e1' },
    });
    const svc = new RecordingsService(prisma, makeStorage());

    const out = await svc.resolvePlayback('ABC123', 'r1', 'good-code');
    expect(out.playbackUrl).toBe('https://cdn.test/recordings/u1/vid.mp4');
  });

  it('rejects a ticket from a different event', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://youtu.be/abc',
      storageKey: null,
      durationSec: null,
      title: 'Keynote',
      visibility: 'ticket',
      requiredTierId: null,
    });
    (prisma as any).ticket.findUnique.mockResolvedValue({
      status: 'issued',
      tierId: 't1',
      registration: { eventId: 'OTHER' },
    });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.resolvePlayback('ABC123', 'r1', 'good-code'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a matching tier for tier-gated recordings', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://youtu.be/abc',
      storageKey: null,
      durationSec: null,
      title: 'VIP session',
      visibility: 'tier',
      requiredTierId: 'vip',
    });
    (prisma as any).ticket.findUnique.mockResolvedValue({
      status: 'issued',
      tierId: 'general',
      registration: { eventId: 'e1' },
    });
    (prisma as any).ticketTier.findUnique.mockResolvedValue({ name: 'VIP' });
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.resolvePlayback('ABC123', 'r1', 'good-code'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a tier-gated recording when the ticket tier matches', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue({
      id: 'r1',
      source: 'link',
      url: 'https://vimeo.com/1',
      storageKey: null,
      durationSec: null,
      title: 'VIP session',
      visibility: 'tier',
      requiredTierId: 'vip',
    });
    (prisma as any).ticket.findUnique.mockResolvedValue({
      status: 'issued',
      tierId: 'vip',
      registration: { eventId: 'e1' },
    });
    const svc = new RecordingsService(prisma, makeStorage());

    const out = await svc.resolvePlayback('ABC123', 'r1', 'good-code');
    expect(out.playbackUrl).toBe('https://vimeo.com/1');
  });

  it('404s an unpublished or unknown recording', async () => {
    const prisma = makePrisma();
    (prisma as any).event.findUnique.mockResolvedValue(publishedEvent);
    (prisma as any).recording.findFirst.mockResolvedValue(null);
    const svc = new RecordingsService(prisma, makeStorage());
    await expect(
      svc.resolvePlayback('ABC123', 'r1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
