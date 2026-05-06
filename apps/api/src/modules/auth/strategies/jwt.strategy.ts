import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  memberships: Array<{ orgId: string; role: string }>;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      issuer: 'orkora',
      secretOrKey: cfg.getOrThrow<string>('JWT_PUBLIC_KEY'),
    });
  }

  validate(payload: JwtPayload) {
    const primary = payload.memberships[0];
    return {
      userId: payload.sub,
      email: payload.email,
      orgId: primary?.orgId,
      role: primary?.role,
      memberships: payload.memberships,
    };
  }
}
