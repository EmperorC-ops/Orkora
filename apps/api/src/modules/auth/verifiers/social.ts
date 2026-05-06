import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * Verified identity returned by a social provider after token validation.
 */
export interface SocialIdentity {
  provider: 'google' | 'apple';
  subject: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  avatarUrl?: string;
}

/**
 * Google ID token verifier.
 *
 * In production we would prefer the official `google-auth-library` which
 * caches certs. Here we keep dependencies minimal and call the tokeninfo
 * endpoint directly. The endpoint validates signature, expiry and issuer.
 */
@Injectable()
export class GoogleVerifier {
  constructor(private readonly cfg: ConfigService) {}

  async verify(idToken: string): Promise<SocialIdentity> {
    const expectedAudience = this.cfg.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(url);
    if (!res.ok) throw new UnauthorizedException('Invalid Google token');
    const claims = (await res.json()) as Record<string, string>;

    if (expectedAudience && claims.aud !== expectedAudience) {
      throw new UnauthorizedException('Token audience mismatch');
    }
    if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') {
      throw new UnauthorizedException('Token issuer mismatch');
    }
    if (!claims.email) throw new UnauthorizedException('Token has no email');
    if (!claims.sub) throw new UnauthorizedException('Token has no subject');

    return {
      provider: 'google',
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === 'true' || (claims.email_verified as unknown) === true,
      fullName: claims.name,
      avatarUrl: claims.picture,
    };
  }
}

/**
 * Apple ID token verifier.
 *
 * Apple signs the ID token with one of their RS256 JWKs. We fetch the
 * public keys from `https://appleid.apple.com/auth/keys`, cache them via
 * `jose`'s built-in JWKS cache, and verify the signature, issuer, audience
 * and expiry in one shot. No more decode-and-trust.
 */
@Injectable()
export class AppleVerifier {
  private readonly logger = new Logger(AppleVerifier.name);
  private readonly jwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );

  constructor(private readonly cfg: ConfigService) {}

  async verify(idToken: string): Promise<SocialIdentity> {
    const expectedAudience = this.cfg.get<string>('APPLE_OAUTH_CLIENT_ID');

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, this.jwks, {
        issuer: 'https://appleid.apple.com',
        audience: expectedAudience,
        algorithms: ['RS256'],
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn({ err }, 'Apple ID token verification failed');
      throw new UnauthorizedException('Invalid Apple token');
    }

    const claims = payload as JWTPayload & {
      email?: string;
      email_verified?: boolean | string;
      sub?: string;
    };
    if (!claims.email) throw new UnauthorizedException('Token has no email');
    if (!claims.sub) throw new UnauthorizedException('Token has no subject');

    return {
      provider: 'apple',
      subject: String(claims.sub),
      email: String(claims.email).toLowerCase(),
      emailVerified:
        claims.email_verified === 'true' || claims.email_verified === true,
    };
  }
}
