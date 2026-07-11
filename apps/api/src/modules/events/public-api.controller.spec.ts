import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { PublicApiEventsController } from './public-api.controller';
import { EventsService } from './events.service';

/**
 * The public-api controller is a thin wrapper around EventsService that
 * also doubles as the "first slice" of our external API. Tests confirm:
 *   - default status filter is `published`
 *   - the response envelope is `{ data, meta }`
 *   - the eventId path returns 404 when the service yields nothing
 *   - the caller is authorized against the route :orgId (JwtOrApiKeyGuard only
 *     proves the token is valid, not that it belongs to this org), so a valid
 *     token for org B cannot read org A's events
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

// `user` is attached upstream by JwtOrApiKeyGuard; assertCallerInOrg reads it
// off the request to authorize the :orgId. The shapes here mirror the two auth
// paths: a JWT user (memberships / platformRole) and an API key (source+orgId).
function reqWith(user: unknown): Request & { user?: unknown } {
  return { user } as Request & { user?: unknown };
}

const MEMBER_OF_ORG1 = { memberships: [{ orgId: 'org-1' }] };
const MEMBER_OF_ORG2 = { memberships: [{ orgId: 'org-2' }] };

describe('PublicApiEventsController', () => {
  it('defaults to status=published', async () => {
    const list = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    const out = await ctrl.list(reqWith(MEMBER_OF_ORG1), 'org-1', undefined);
    expect(list).toHaveBeenCalledWith('org-1', 'published');
    expect(out).toEqual({ data: [{ id: '1' }, { id: '2' }], meta: { count: 2 } });
  });

  it('respects an explicit status filter', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await ctrl.list(reqWith(MEMBER_OF_ORG1), 'org-1', 'live');
    expect(list).toHaveBeenCalledWith('org-1', 'live');
  });

  it('throws 404 when the event detail is missing', async () => {
    const svc = makeService({
      get: () => Promise.resolve(null),
    });
    const ctrl = new PublicApiEventsController(svc);
    await expect(ctrl.get(reqWith(MEMBER_OF_ORG1), 'org-1', 'evt-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('wraps the event detail in a data envelope', async () => {
    const detail = { id: 'evt-1', title: 'Demo' };
    const svc = makeService({
      get: () => Promise.resolve(detail),
    });
    const ctrl = new PublicApiEventsController(svc);
    expect(await ctrl.get(reqWith(MEMBER_OF_ORG1), 'org-1', 'evt-1')).toEqual({ data: detail });
  });

  it('DENIES a JWT caller who is not a member of the org (cross-tenant IDOR)', async () => {
    const list = jest.fn().mockResolvedValue([{ id: 'secret' }]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await expect(ctrl.list(reqWith(MEMBER_OF_ORG2), 'org-1', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // the guard must reject BEFORE any data is read
    expect(list).not.toHaveBeenCalled();
  });

  it('DENIES an API key scoped to a different org', async () => {
    const get = jest.fn().mockResolvedValue({ id: 'evt-1' });
    const svc = makeService({ get });
    const ctrl = new PublicApiEventsController(svc);
    await expect(
      ctrl.get(reqWith({ source: 'api-key', orgId: 'org-2' }), 'org-1', 'evt-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(get).not.toHaveBeenCalled();
  });

  it('ALLOWS an API key scoped to the same org', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await ctrl.list(reqWith({ source: 'api-key', orgId: 'org-1' }), 'org-1', undefined);
    expect(list).toHaveBeenCalledWith('org-1', 'published');
  });

  it('ALLOWS a platform superadmin on any org (sole cross-org bypass)', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await ctrl.list(reqWith({ platformRole: 'superadmin' }), 'org-1', undefined);
    expect(list).toHaveBeenCalledWith('org-1', 'published');
  });

  it('rejects an unauthenticated request (no user attached)', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await expect(ctrl.list(reqWith(undefined), 'org-1', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(list).not.toHaveBeenCalled();
  });
});
