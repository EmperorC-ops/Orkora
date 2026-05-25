import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function makeController(queryRaw: jest.Mock) {
  return new HealthController({ $queryRaw: queryRaw } as never);
}

describe('HealthController', () => {
  it('liveness returns ok without touching the database', () => {
    const queryRaw = jest.fn();
    const out = makeController(queryRaw).live();
    expect(out.status).toBe('ok');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('readiness returns ok when the database responds', async () => {
    const out = await makeController(jest.fn().mockResolvedValue([{ ok: 1 }])).ready();
    expect(out).toEqual(
      expect.objectContaining({ status: 'ok', checks: { database: 'ok' } }),
    );
  });

  it('readiness throws 503 when the database is down', async () => {
    await expect(
      makeController(jest.fn().mockRejectedValue(new Error('db down'))).ready(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  describe('debug-sentry', () => {
    const original = process.env.ENABLE_DEBUG_ROUTES;
    afterEach(() => {
      if (original === undefined) delete process.env.ENABLE_DEBUG_ROUTES;
      else process.env.ENABLE_DEBUG_ROUTES = original;
    });

    it('is inert (404) by default', () => {
      delete process.env.ENABLE_DEBUG_ROUTES;
      expect(() => makeController(jest.fn()).debugSentry()).toThrow(NotFoundException);
    });

    it('throws a real error when explicitly enabled', () => {
      process.env.ENABLE_DEBUG_ROUTES = 'true';
      expect(() => makeController(jest.fn()).debugSentry()).toThrow('Sentry test error');
    });
  });
});
