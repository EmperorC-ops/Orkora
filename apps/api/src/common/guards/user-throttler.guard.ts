import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { rateLimitIpKey } from '../outbound/ip';

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
  protected override getTracker(req: AuthedRequest): Promise<string> {
    const userId = req.user?.userId;
    if (userId) return Promise.resolve(`user:${userId}`);
    // req.ip, not req.ips[0]: with 'trust proxy' set to a hop count (main.ts)
    // Express resolves req.ip to the real client, while the leftmost
    // X-Forwarded-For entry is whatever the client chose to send. IPv6 is
    // keyed on its /64 so one device cannot rotate through fresh buckets.
    return Promise.resolve(`ip:${rateLimitIpKey(req.ip)}`);
  }
}
