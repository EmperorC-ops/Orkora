import { AdminService, USER_SEGMENT_WHERE, userKind } from './admin.service';

describe('userKind', () => {
  it('labels platform staff first, whatever else they have', () => {
    expect(userKind('superadmin', 2, 5)).toBe('platform');
    expect(userKind('support', 0, 0)).toBe('platform');
  });

  it('labels an organizer who also holds tickets as an organizer', () => {
    expect(userKind('none', 1, 3)).toBe('organizer');
  });

  it('labels a ticket-only account as a ticket holder', () => {
    expect(userKind('none', 0, 2)).toBe('ticket_holder');
  });

  it('labels an account with nothing as inactive', () => {
    expect(userKind('none', 0, 0)).toBe('inactive');
  });
});

describe('AdminService.listUsers segments', () => {
  function makeService() {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'u1',
        email: 'ada@example.com',
        fullName: 'Ada Obi',
        platformRole: 'none',
        createdAt: new Date('2026-10-01T00:00:00Z'),
        lastLoginAt: null,
        _count: { memberships: 1, registrations: 0 },
        memberships: [{ role: 'owner', organization: { name: 'Acme' } }],
      },
    ]);
    const count = jest.fn().mockResolvedValue(7);
    const prisma = {
      user: { findMany, count },
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    return { svc: new AdminService(prisma as never), findMany };
  }

  it('applies the chosen segment filter and returns per-segment counts', async () => {
    const { svc, findMany } = makeService();
    const out = await svc.listUsers({ segment: 'ticket_holders' });
    expect(findMany.mock.calls[0][0].where).toEqual({
      AND: [{}, USER_SEGMENT_WHERE.ticket_holders],
    });
    expect(out.segment).toBe('ticket_holders');
    expect(out.counts).toEqual({
      all: 7,
      organizers: 7,
      ticket_holders: 7,
      inactive: 7,
      platform: 7,
    });
    expect(out.rows[0]).toMatchObject({
      kind: 'organizer',
      organizations: [{ name: 'Acme', role: 'owner' }],
    });
  });

  it('falls back to all users for an unknown segment', async () => {
    const { svc, findMany } = makeService();
    const out = await svc.listUsers({ segment: 'nonsense' });
    expect(out.segment).toBe('all');
    expect(findMany.mock.calls[0][0].where).toEqual({ AND: [{}, {}] });
  });

  it('sorts by last sign-in with never-signed-in accounts last', async () => {
    const { svc, findMany } = makeService();
    await svc.listUsers({ sort: 'last_login' });
    expect(findMany.mock.calls[0][0].orderBy[0]).toEqual({
      lastLoginAt: { sort: 'desc', nulls: 'last' },
    });
  });
});
