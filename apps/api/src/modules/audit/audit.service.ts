import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface AuditInput {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

/**
 * Append-only audit log. Sensitive actions (refunds, role changes,
 * deletions, ticket cancellations) call `record()`. Failures here are
 * logged but never propagated, so a write to `audit_events` cannot
 * accidentally fail the underlying business operation.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          organizationId: input.organizationId ?? null,
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          requestId: input.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn({ err, input }, 'Audit log write failed');
    }
  }
}
