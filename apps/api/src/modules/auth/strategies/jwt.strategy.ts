import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { createHash } from 'crypto';

interface JwtPayload {
  sub: string;
  email: string;
  platformRole?: string;
  memberships: Array<{ orgId: string; role: string }>;
}

/**
 * Compute a stable short id ("kid") for a public key. SHA-256 of the
 * normalised key bytes, first 16 hex chars. Used to tag issued tokens with
 * the key they were signed with, so a rotation that introduces a new key
 * pair can still verify tokens signed by the previous key.
 */
export function jwtKidFor(publicKey: string): string {
  const normalized = publicKey.replace(/\s+/g, '');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * JWT verification with key-rotation overlap.
 *
 * When `JWT_PUBLIC_KEY_PREVIOUS` is set, an inbound token's `kid` header is
 * matched against the kid of the current and previous public keys. Tokens
 * minted before the rotation (signed with the previous key, carrying its
 * kid) verify against the previous key. Tokens minted after the rotation
 * (signed with the new active key, carrying its kid) verify against the
 * current key.
 *
 * Operator playbook for a rotation:
 *   1. Mint a new RSA keypair via scripts/rotate-secrets.sh.
 *   2. Set JWT_PUBLIC_KEY_PREVIOUS to the OLD public key. Bump
 *      JWT_PRIVATE_KEY and JWT_PUBLIC_KEY to the new pair. Redeploy.
 *   3. Wait at least one JWT_ACCESS_TTL (default 15m). All tokens issued
 *      under the old key have now expired; refresh-token rotation has
 *      handed out new tokens signed by the new key.
 *   4. Unset JWT_PUBLIC_KEY_PREVIOUS and redeploy.
 *
 * Tokens without a `kid` header (legacy tokens issued before this code
 * shipped) fall back to the current key.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor(cfg: ConfigService) {
    const currentKey = cfg.getOrThrow<string>('JWT_PUBLIC_KEY');
    const previousKey = cfg.get<string>('JWT_PUBLIC_KEY_PREVIOUS');
    const currentKid = jwtKidFor(currentKey);
    const previousKid = previousKey ? jwtKidFor(previousKey) : null;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: 'orkora',
      secretOrKeyProvider: (
        _req: unknown,
        rawJwtToken: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        const headerKid = extractKid(rawJwtToken);
        if (headerKid && previousKey && previousKid && headerKid === previousKid) {
          return done(null, previousKey);
        }
        return done(null, currentKey);
      },
    });

    if (previousKey) {
      JwtStrategy.logger.log(
        `JWT key-rotation overlap active. current=${currentKid} previous=${previousKid}`,
      );
    }
  }

  validate(payload: JwtPayload) {
    const primary = payload.memberships[0];
    return {
      userId: payload.sub,
      email: payload.email,
      platformRole: payload.platformRole ?? 'none',
      orgId: primary?.orgId,
      role: primary?.role,
      memberships: payload.memberships,
    };
  }
}

/**
 * Decode just the JWT header (no verification) and return the `kid` claim
 * if present. Used by the secret provider above to pick a key.
 * Returns null on malformed JWTs; passport-jwt will reject those anyway.
 */
function extractKid(raw: string): string | null {
  try {
    const headerB64 = raw.split('.')[0];
    if (!headerB64) return null;
    const json = Buffer.from(headerB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { kid?: unknown };
    return typeof parsed.kid === 'string' ? parsed.kid : null;
  } catch {
    return null;
  }
}
