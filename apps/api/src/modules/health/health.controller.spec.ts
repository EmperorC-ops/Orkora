import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function makeController(queryRaw: jest.Mock) {
  return new HealthController({ $queryRaw: queryRaw } as never);
}

describe('HealthController', () => {
  const originalInterval = process.env.READY_PROBE_INTERVAL_MS;
  afterEach(() => {
    if (originalInterval === undefined) delete process.env.READY_PROBE_INTERVAL_MS;
    else process.env.READY_PROBE_INTERVAL_MS = originalInterval;
    jest.useRealTimers();
  });

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

  describe('probe caching (keeps a 5-minute uptime poller from waking Neon)', () => {
    it('probes the database once, then serves the cached verdict inside the interval', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-06T08:00:00Z'));
      const queryRaw = jest.fn().mockResolvedValue([{ ok: 1 }]);
      const ctrl = makeController(queryRaw);

      const first = await ctrl.ready();
      expect(first.checks.database).toBe('ok');

      jest.setSystemTime(new Date('2026-09-06T08:05:00Z'));
      const second = await ctrl.ready();
      expect(second.status).toBe('ok');
      expect(second.checks.database).toBe('ok (cached)');
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('probes again once the interval has elapsed', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-06T08:00:00Z'));
      const queryRaw = jest.fn().mockResolvedValue([{ ok: 1 }]);
      const ctrl = makeController(queryRaw);

      await ctrl.ready();
      jest.setSystemTime(new Date('2026-09-06T09:00:01Z'));
      const later = await ctrl.ready();
      expect(later.checks.database).toBe('ok');
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it('never caches a failure: a down database is re-checked on every call', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-06T08:00:00Z'));
      const queryRaw = jest.fn().mockRejectedValue(new Error('db down'));
      const ctrl = makeController(queryRaw);

      await expect(ctrl.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
      jest.setSystemTime(new Date('2026-09-06T08:01:00Z'));
      await expect(ctrl.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });

    it('READY_PROBE_INTERVAL_MS=0 restores probe-on-every-call', async () => {
      process.env.READY_PROBE_INTERVAL_MS = '0';
      const queryRaw = jest.fn().mockResolvedValue([{ ok: 1 }]);
      const ctrl = makeController(queryRaw);
      await ctrl.ready();
      await ctrl.ready();
      expect(queryRaw).toHaveBeenCalledTimes(2);
    });
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
