import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Fixed-window counters for outbound caps. Redis when REDIS_URL works (shared
 * across API instances and restarts), an in-process map otherwise.
 *
 * "Insert, then count": hit() increments first and returns the count
 * INCLUDING this request, so a parallel burst cannot slip under a cap by
 * reading before anyone writes. Keys live in their own "obc:" namespace and
 * never touch login lockout (login_failures table).
 */
export interface RateCounter {
  /** Add `by` (default 1) and return the new count for this window. */
  hit(key: string, windowSeconds: number, by?: number): Promise<number>;
  /**
   * True while a shared store is configured but unreachable, so counts are
   * per process and reset on restart. Callers tighten their caps then.
   */
  readonly degraded?: boolean;
}

export class MemoryRateCounter implements RateCounter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowSeconds: number, by = 1): Promise<number> {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: by, resetAt: now + windowSeconds * 1000 });
      if (this.buckets.size > 50_000) this.sweep(now);
      return by;
    }
    b.count += by;
    return b.count;
  }

  private sweep(now: number) {
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

export class RedisRateCounter implements RateCounter {
  private readonly logger = new Logger('RateCounter');
  private readonly fallback = new MemoryRateCounter();
  private healthy = true;

  get degraded(): boolean {
    return !this.healthy;
  }

  constructor(private readonly redis: Redis) {
    redis.on('error', (err: Error) => {
      if (this.healthy) this.logger.warn(`Redis unavailable, using in-process counters: ${err.message}`);
      this.healthy = false;
    });
    redis.on('ready', () => {
      this.healthy = true;
    });
  }

  async hit(key: string, windowSeconds: number, by = 1): Promise<number> {
    if (!this.healthy) return this.fallback.hit(key, windowSeconds, by);
    const k = `obc:${key}`;
    try {
      // INCRBY then TTL in one round trip; set the expiry only when the key has
      // none yet (first hit, or a key that somehow lost its TTL). Works on
      // Redis 6, which lacks EXPIRE ... NX.
      const res = await this.redis.multi().incrby(k, by).ttl(k).exec();
      const count = Number(res?.[0]?.[1] ?? NaN);
      const ttl = Number(res?.[1]?.[1] ?? NaN);
      if (!Number.isFinite(count)) throw new Error('bad INCR reply');
      if (!(ttl > 0)) await this.redis.expire(k, windowSeconds);
      return count;
    } catch (err) {
      this.logger.warn(`Redis counter failed, using in-process counters: ${(err as Error).message}`);
      this.healthy = false;
      return this.fallback.hit(key, windowSeconds, by);
    }
  }
}

/** Build the counter: Redis when a URL is configured, memory otherwise. */
export function createRateCounter(redisUrl: string | undefined): RateCounter {
  if (!redisUrl) return new MemoryRateCounter();
  try {
    const redis = new Redis(redisUrl, {
      lazyConnect: false,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    return new RedisRateCounter(redis);
  } catch {
    return new MemoryRateCounter();
  }
}
