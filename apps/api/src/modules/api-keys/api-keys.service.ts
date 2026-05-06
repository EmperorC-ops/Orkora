import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PREFIX = 'ork_';
const RAW_BYTES = 24; // 32 base64url chars after encoding
const ALLOWED_SCOPES = [
  'events.read',
  'events.write',
  'registrations.read',
  'registrations.write',
  'analytics.read',
] as const;
export type ApiKeyScope = (typeof ALLOWED_SCOPES)[number];

interface CreateInput {
  organizationId: string;
  createdById: string;
  name: string;
  scopes?: ApiKeyScope[];
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Mint a new API key. The plaintext token is shown to the caller exactly
   * once in the response; we persist a sha256(token + pepper) hash and the
   * last 4 characters for display in the UI.
   */
  async create(input: CreateInput, requestId?: string) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException('Name must be 2-80 characters');
    }
    const scopes = (input.scopes ?? []).filter((s) =>
      ALLOWED_SCOPES.includes(s as ApiKeyScope),
    );

    const raw = randomBytes(RAW_BYTES).toString('base64url');
    const token = `${PREFIX}${raw}`;
    const tokenHash = this.hash(token);
    const lastFour = raw.slice(-4);

    const key = await this.prisma.apiKey.create({
      data: {
        organizationId: input.organizationId,
        name,
        tokenHash,
        lastFour,
        scopes,
        createdById: input.createdById,
      },
    });

    await this.audit.record({
      organizationId: input.organizationId,
      actorUserId: input.createdById,
      action: 'api_key.created',
      resourceType: 'api_key',
      resourceId: key.id,
      metadata: { name, scopes, lastFour },
      requestId,
    });

    return {
      id: key.id,
      name: key.name,
      lastFour: key.lastFour,
      scopes: key.scopes,
      createdAt: key.createdAt.toISOString(),
      // The plaintext token, shown exactly once.
      token,
    };
  }

  /**
   * Public list (no plaintext, only metadata). Revoked keys retained for
   * audit but flagged separately on the response.
   */
  async list(orgId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      lastFour: k.lastFour,
      scopes: k.scopes,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdBy: k.createdBy,
    }));
  }

  async revoke(orgId: string, actorUserId: string, keyId: string, requestId?: string) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, organizationId: orgId },
    });
    if (!key) throw new NotFoundException('API key not found');
    if (key.revokedAt) {
      // Idempotent: already revoked. Don't double-write the audit row.
      return { id: key.id, revokedAt: key.revokedAt.toISOString() };
    }
    const updated = await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      organizationId: orgId,
      actorUserId,
      action: 'api_key.revoked',
      resourceType: 'api_key',
      resourceId: key.id,
      metadata: { name: key.name, lastFour: key.lastFour },
      requestId,
    });
    return { id: updated.id, revokedAt: updated.revokedAt!.toISOString() };
  }

  /**
   * Resolve a plaintext bearer token to an org id + key record. Returns null
   * for unknown / revoked keys; the caller turns that into a 401. Updates
   * `lastUsedAt` lazily (best effort, errors swallowed).
   */
  async resolveToken(token: string): Promise<{ orgId: string; keyId: string; scopes: string[] } | null> {
    if (!token.startsWith(PREFIX)) return null;
    const tokenHash = this.hash(token);
    const key = await this.prisma.apiKey.findUnique({ where: { tokenHash } });
    if (!key || key.revokedAt) return null;

    // Best effort: stamp lastUsedAt; do not block the request on failure.
    this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return { orgId: key.organizationId, keyId: key.id, scopes: key.scopes };
  }

  private hash(token: string): string {
    const pepper = this.cfg.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
    return createHash('sha256').update(token + pepper).digest('hex');
  }
}
