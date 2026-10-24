import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CURRENT_LEGAL_VERSIONS } from '../../common/legal-versions';
import { LegalService, computePending } from './legal.service';

const V = CURRENT_LEGAL_VERSIONS;

describe('computePending', () => {
  it('asks a new user for the Terms and Privacy Policy', () => {
    const out = computePending({ acceptedPersonal: [], ownedOrgsMissingOrganizer: [] });
    expect(out.map((p) => p.document)).toEqual(['terms', 'privacy']);
  });

  it('asks again when only an older Terms version was accepted', () => {
    const out = computePending({
      acceptedPersonal: [
        { document: 'terms', version: '1.0' },
        { document: 'privacy', version: V.privacy },
      ],
      ownedOrgsMissingOrganizer: [],
    });
    expect(out).toEqual([{ document: 'terms', version: V.terms }]);
  });

  it('asks for the Organizer Agreement once per organization the user runs', () => {
    const out = computePending({
      acceptedPersonal: [
        { document: 'terms', version: V.terms },
        { document: 'privacy', version: V.privacy },
      ],
      ownedOrgsMissingOrganizer: [
        { id: 'o1', name: 'Acme' },
        { id: 'o2', name: 'Beta' },
      ],
    });
    expect(out).toEqual([
      { document: 'organizer', version: V.organizer, organizationId: 'o1', organizationName: 'Acme' },
      { document: 'organizer', version: V.organizer, organizationId: 'o2', organizationName: 'Beta' },
    ]);
  });

  it('owes nothing once everything current is accepted', () => {
    const out = computePending({
      acceptedPersonal: [
        { document: 'terms', version: V.terms },
        { document: 'privacy', version: V.privacy },
      ],
      ownedOrgsMissingOrganizer: [],
    });
    expect(out).toEqual([]);
  });
});

describe('LegalService.accept', () => {
  function makeService(opts: { isOwnerOrAdmin?: boolean } = {}) {
    const executed: unknown[][] = [];
    const prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('from memberships') && sql.includes('role = any') && !sql.includes('join')) {
          return Promise.resolve(opts.isOwnerOrAdmin ? [{ ok: 1 }] : []);
        }
        return Promise.resolve([]);
      }),
      $executeRawUnsafe: jest.fn().mockImplementation((...args: unknown[]) => {
        executed.push(args);
        return Promise.resolve(1);
      }),
    };
    return { svc: new LegalService(prisma as never), executed };
  }

  it('records the Terms and Privacy Policy with source and request details', async () => {
    const { svc, executed } = makeService();
    await svc.accept(
      'u1',
      [
        { document: 'terms', version: V.terms },
        { document: 'privacy', version: V.privacy },
      ],
      { source: 'signup', ip: '1.2.3.4', userAgent: 'test-agent' },
    );
    expect(executed).toHaveLength(2);
    expect(executed[0].slice(1)).toEqual(['u1', null, 'terms', V.terms, 'signup', '1.2.3.4', 'test-agent']);
  });

  it('refuses an out-of-date version', async () => {
    const { svc, executed } = makeService();
    await expect(
      svc.accept('u1', [{ document: 'terms', version: '0.9' }], { source: 'prompt' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executed).toHaveLength(0);
  });

  it('refuses the Organizer Agreement from someone who is not an owner or admin', async () => {
    const { svc, executed } = makeService({ isOwnerOrAdmin: false });
    await expect(
      svc.accept('u1', [{ document: 'organizer', version: V.organizer, organizationId: 'o1' }], {
        source: 'prompt',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(executed).toHaveLength(0);
  });

  it('records the Organizer Agreement for an owner or admin', async () => {
    const { svc, executed } = makeService({ isOwnerOrAdmin: true });
    await svc.accept('u1', [{ document: 'organizer', version: V.organizer, organizationId: 'o1' }], {
      source: 'org_create',
    });
    expect(executed).toHaveLength(1);
    expect(executed[0].slice(1, 6)).toEqual(['u1', 'o1', 'organizer', V.organizer, 'org_create']);
  });

  it('requires an organization for the Organizer Agreement', async () => {
    const { svc } = makeService({ isOwnerOrAdmin: true });
    await expect(
      svc.accept('u1', [{ document: 'organizer', version: V.organizer }], { source: 'prompt' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
