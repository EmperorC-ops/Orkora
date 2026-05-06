import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

interface AuthedRequest extends Request {
  user?: { userId?: string };
}

/**
 * Throttler that buckets by authenticated `userId` when the request carries
 * a verified JWT, and falls back to the source IP when it does not. This
 * stops co-located teams behind the same NAT from sharing a rate-limit
 * bucket while still protecting unauthenticated endpoints (signup, OTP send,
 * public registration) from per-IP abuse.
 *
 * Wired globally as APP_GUARD in app.module.ts. The base `@Throttle()`
 * decorator on individual handlers still tightens the limit per-route.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: AuthedRequest): Promise<string> {
    const userId = req.user?.userId;
    if (userId) return Promise.resolve(`user:${userId}`);
    const ip = (req.ips && req.ips[0]) || req.ip || 'unknown';
    return Promise.resolve(`ip:${ip}`);
  }
}
