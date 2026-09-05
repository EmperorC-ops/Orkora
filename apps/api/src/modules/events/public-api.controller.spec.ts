import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PublicApiEventsController } from './public-api.controller';
import { EventsService } from './events.service';

/**
 * The public-api controller is a thin wrapper around EventsService that
 * also doubles as the "first slice" of our external API. Tests confirm:
 *   - the caller must be bound to the org in the path (API key scope or JWT
 *     membership), so a mismatched path cannot read another tenant's events
 *   - the list is always `published` only (clients cannot request drafts)
 *   - the response envelope is `{ data, meta }`
 *   - the eventId path returns 404 when the service yields nothing OR when the
 *     event exists but is not in a public status (draft is indistinguishable
 *     from missing to an outside caller)
 */

function makeService(opts: {
  list?: () => Promise<unknown[]>;
  get?: () => Promise<unknown | null>;
}): EventsService {
  return {
    listForOrg: opts.list ? jest.fn(opts.list) : jest.fn(),
    getForOrg: opts.get ? jest.fn(opts.get) : jest.fn(),
  } as unknown as EventsService;
}

/** Request as seen after JwtOrApiKeyGuard populated `req.user`. */
function apiKeyReq(orgId: string): Request {
  return { user: { source: 'api-key', orgId } } as unknown as Request;
}
function jwtReq(memberOf: string[]): Request {
  return {
    user: { userId: 'u1', memberships: memberOf.map((orgId) => ({ orgId, role: 'admin' })) },
  } as unknown as Request;
}
const ANON = {} as Request;

describe('PublicApiEventsController', () => {
  it('lists published events only, wrapped in a data/meta envelope', async () => {
    const list = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    const out = await ctrl.list(apiKeyReq('org-1'), 'org-1');
    expect(list).toHaveBeenCalledWith('org-1', 'published');
    expect(out).toEqual({ data: [{ id: '1' }, { id: '2' }], meta: { count: 2 } });
  });

  it('accepts a JWT user who is a member of the org', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const ctrl = new PublicApiEventsController(makeService({ list }));
    await ctrl.list(jwtReq(['org-0', 'org-1']), 'org-1');
    expect(list).toHaveBeenCalledWith('org-1', 'published');
  });

  it('rejects an unauthenticated request', async () => {
    const list = jest.fn();
    const ctrl = new PublicApiEventsController(makeService({ list }));
    await expect(ctrl.list(ANON, 'org-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects an API key scoped to a different org (no cross-tenant reads)', async () => {
    const list = jest.fn();
    const ctrl = new PublicApiEventsController(makeService({ list }));
    await expect(ctrl.list(apiKeyReq('org-2'), 'org-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a JWT user with no membership in the org', async () => {
    const get = jest.fn();
    const ctrl = new PublicApiEventsController(makeService({ get }));
    await expect(ctrl.get(jwtReq(['org-9']), 'org-1', 'evt-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('throws 404 when the event detail is missing', async () => {
    const ctrl = new PublicApiEventsController(makeService({ get: () => Promise.resolve(null) }));
    await expect(ctrl.get(apiKeyReq('org-1'), 'org-1', 'evt-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 for an event that exists but is not public (draft)', async () => {
    const ctrl = new PublicApiEventsController(
      makeService({ get: () => Promise.resolve({ id: 'evt-d', status: 'draft' }) }),
    );
    await expect(ctrl.get(apiKeyReq('org-1'), 'org-1', 'evt-d')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wraps a public event detail in a data envelope', async () => {
    const detail = { id: 'evt-1', title: 'Demo', status: 'live' };
    const ctrl = new PublicApiEventsController(makeService({ get: () => Promise.resolve(detail) }));
    expect(await ctrl.get(apiKeyReq('org-1'), 'org-1', 'evt-1')).toEqual({ data: detail });
  });
});
