import { BadRequestException } from '@nestjs/common';
import {
  AdminDeletionService,
  erasedEmail,
  orgDeleteBlockers,
  userDeleteBlockers,
  userEraseBlockers,
  type UserDeletionFacts,
} from './admin-deletion.service';

const clean: UserDeletionFacts = {
  isSelf: false,
  platformRole: 'none',
  financialOrders: 0,
  walletEntries: 0,
  soleOwnerOf: [],
  campaignsCreated: 0,
  apiKeysCreated: 0,
};

describe('deletion rules', () => {
  it('allows deleting a user with no history', () => {
    expect(userDeleteBlockers(clean)).toEqual([]);
  });

  it('blocks deleting yourself, platform staff and sole owners', () => {
    expect(userDeleteBlockers({ ...clean, isSelf: true })).toHaveLength(1);
    expect(userDeleteBlockers({ ...clean, platformRole: 'support' })).toHaveLength(1);
    const owner = userDeleteBlockers({ ...clean, soleOwnerOf: ['Acme'] });
    expect(owner[0]).toContain('Acme');
  });

  it('never deletes a user with paid orders or wallet entries, but allows erasing them', () => {
    const facts = { ...clean, financialOrders: 2, walletEntries: 1 };
    expect(userDeleteBlockers(facts)).toHaveLength(2);
    expect(userEraseBlockers(facts)).toEqual([]);
  });

  it('blocks deleting a campaign or API key author', () => {
    expect(userDeleteBlockers({ ...clean, campaignsCreated: 1 })).toHaveLength(1);
    expect(userDeleteBlockers({ ...clean, apiKeysCreated: 1 })).toHaveLength(1);
  });

  it('blocks deleting an organization that took money', () => {
    expect(orgDeleteBlockers({ financialOrders: 0, walletEntries: 0 })).toEqual([]);
    expect(orgDeleteBlockers({ financialOrders: 1, walletEntries: 0 })).toHaveLength(1);
    expect(orgDeleteBlockers({ financialOrders: 0, walletEntries: 3 })).toHaveLength(1);
  });

  it('builds an undeliverable, unique placeholder email', () => {
    expect(erasedEmail('abc')).toBe('deleted+abc@deleted.orkora.invalid');
  });
});

/**
 * Transaction flow with a fake database. `counts` answers every count query
 * (in call order); `owners` answers the sole-owner lookup.
 */
function makeService(opts: {
  user?: { id: string; email: string; fullName: string; platformRole: string } | null;
  org?: { id: string; name: string; slug: string } | null;
  counts?: number[];
  owners?: Array<{ name: string }>;
}) {
  const executed: string[] = [];
  const counts = [...(opts.counts ?? [])];
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user ?? null) },
    organization: { findUnique: jest.fn().mockResolvedValue(opts.org ?? null) },
    $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('m2.role')) return Promise.resolve(opts.owners ?? []);
      return Promise.resolve([{ n: counts.length ? counts.shift() : 0 }]);
    }),
    $executeRawUnsafe: jest.fn().mockImplementation((sql: string) => {
      executed.push(sql.replace(/\s+/g, ' ').trim());
      return Promise.resolve(1);
    }),
  };
  const prisma = {
    ...tx,
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { svc: new AdminDeletionService(prisma as never, audit as never), executed, audit };
}

const testUser = { id: 'u1', email: 'test@example.com', fullName: 'Test', platformRole: 'none' };

describe('AdminDeletionService.deleteUser', () => {
  it('refuses when the confirmation does not match, before touching anything', async () => {
    const { svc, executed } = makeService({ user: testUser });
    await expect(svc.deleteUser('u1', 'admin', 'wrong@example.com')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(executed).toEqual([]);
  });

  it('refuses a user with paid orders, before touching anything', async () => {
    // First count query is financial orders.
    const { svc, executed } = makeService({ user: testUser, counts: [1] });
    await expect(svc.deleteUser('u1', 'admin', 'TEST@example.com')).rejects.toThrow(/paid/);
    expect(executed).toEqual([]);
  });

  it('deletes in foreign-key order and writes an audit row', async () => {
    const { svc, executed, audit } = makeService({ user: testUser });
    await expect(svc.deleteUser('u1', 'admin', ' test@example.com ')).resolves.toEqual({
      id: 'u1',
      deleted: true,
    });
    const idx = (needle: string) => executed.findIndex((s) => s.startsWith(needle));
    expect(idx('update ticket_tiers')).toBeGreaterThanOrEqual(0);
    expect(idx('delete from checkins')).toBeLessThan(idx('delete from orders'));
    expect(idx('delete from orders')).toBeLessThan(idx('delete from registrations'));
    expect(idx('delete from messages where reply_to_id')).toBeLessThan(
      idx('delete from messages where user_id'),
    );
    expect(executed[executed.length - 1]).toContain('delete from users');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.user.delete', resourceId: 'u1' }),
    );
  });
});

describe('AdminDeletionService.eraseUser', () => {
  it('scrubs details even with paid history and keeps no email in the audit row', async () => {
    const { svc, executed, audit } = makeService({ user: testUser, counts: [3] });
    await svc.eraseUser('u1', 'admin', 'test@example.com');
    expect(executed.some((s) => s.startsWith('update users set email'))).toBe(true);
    expect(executed.some((s) => s.startsWith('delete from users'))).toBe(false);
    const call = audit.record.mock.calls[0][0];
    expect(call.action).toBe('admin.user.erase');
    expect(call.metadata).toBeUndefined();
  });

  it('refuses to erase a sole owner', async () => {
    const { svc } = makeService({ user: testUser, owners: [{ name: 'Acme' }] });
    await expect(svc.eraseUser('u1', 'admin', 'test@example.com')).rejects.toThrow(/Acme/);
  });
});

describe('AdminDeletionService.deleteOrganization', () => {
  const org = { id: 'o1', name: 'Test Org', slug: 'test-org' };

  it('requires the exact organization name', async () => {
    const { svc, executed } = makeService({ org });
    await expect(svc.deleteOrganization('o1', 'admin', 'test org')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(executed).toEqual([]);
  });

  it('refuses an organization that took money', async () => {
    const { svc, executed } = makeService({ org, counts: [2] });
    await expect(svc.deleteOrganization('o1', 'admin', 'Test Org')).rejects.toThrow(/suspend/);
    expect(executed).toEqual([]);
  });

  it('removes event data before events, and events before the organization', async () => {
    const { svc, executed } = makeService({ org });
    await svc.deleteOrganization('o1', 'admin', 'Test Org');
    const idx = (needle: string) => executed.findIndex((s) => s.startsWith(needle));
    expect(idx('delete from orders')).toBeLessThan(idx('delete from registrations'));
    expect(idx('delete from registrations')).toBeLessThan(idx('delete from events'));
    expect(idx('delete from events')).toBeLessThan(idx('delete from organizations'));
  });
});
