import { NotFoundException } from '@nestjs/common';
import { PublicApiEventsController } from './public-api.controller';
import { EventsService } from './events.service';

/**
 * The public-api controller is a thin wrapper around EventsService that
 * also doubles as the "first slice" of our external API. Tests confirm:
 *   - default status filter is `published`
 *   - the response envelope is `{ data, meta }`
 *   - the eventId path returns 404 when the service yields nothing
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

describe('PublicApiEventsController', () => {
  it('defaults to status=published', async () => {
    const list = jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    const out = await ctrl.list('org-1', undefined);
    expect(list).toHaveBeenCalledWith('org-1', 'published');
    expect(out).toEqual({ data: [{ id: '1' }, { id: '2' }], meta: { count: 2 } });
  });

  it('respects an explicit status filter', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const svc = makeService({ list });
    const ctrl = new PublicApiEventsController(svc);
    await ctrl.list('org-1', 'live');
    expect(list).toHaveBeenCalledWith('org-1', 'live');
  });

  it('throws 404 when the event detail is missing', async () => {
    const svc = makeService({
      get: () => Promise.resolve(null),
    });
    const ctrl = new PublicApiEventsController(svc);
    await expect(ctrl.get('org-1', 'evt-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('wraps the event detail in a data envelope', async () => {
    const detail = { id: 'evt-1', title: 'Demo' };
    const svc = makeService({
      get: () => Promise.resolve(detail),
    });
    const ctrl = new PublicApiEventsController(svc);
    expect(await ctrl.get('org-1', 'evt-1')).toEqual({ data: detail });
  });
});
