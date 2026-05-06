import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import * as Sentry from '@sentry/node';

/**
 * CSP violation report endpoint.
 *
 * Browsers send violations as `Content-Type: application/csp-report` with a
 * `csp-report` envelope. We accept either that format or the newer
 * `application/reports+json` array format from the Reporting API. Each
 * violation is captured as a Sentry message with structured tags so we can
 * spot regressions in our CSP after a deploy.
 *
 * The endpoint is:
 *   - public (no auth) — the browser never has access to user credentials
 *     when posting a violation
 *   - heavily rate-limited per IP — a single attacker page can push many
 *     reports very quickly; 60/minute keeps the noise floor predictable
 *   - never throws on parse error — we always 204 so the browser doesn't
 *     keep retrying. Bad payloads land in the `level: warning` bucket.
 */
interface CspReportV1 {
  'csp-report'?: {
    'document-uri'?: string;
    referrer?: string;
    'violated-directive'?: string;
    'effective-directive'?: string;
    'original-policy'?: string;
    disposition?: string;
    'blocked-uri'?: string;
    'line-number'?: number;
    'column-number'?: number;
    'source-file'?: string;
    'status-code'?: number;
    'script-sample'?: string;
  };
}

interface CspReportV3 {
  type: 'csp-violation';
  age: number;
  url: string;
  user_agent?: string;
  body: {
    documentURL?: string;
    referrer?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    sample?: string;
    disposition?: string;
    statusCode?: number;
    lineNumber?: number;
    columnNumber?: number;
  };
}

@ApiTags('reports')
@Controller('csp-reports')
export class CspReportsController {
  private readonly logger = new Logger(CspReportsController.name);

  /**
   * The path is unauthenticated by intent; we still cap it at 60 / IP / min
   * so a misconfigured page can't OOM us.
   */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post()
  @HttpCode(204)
  report(
    @Body() body: CspReportV1 | CspReportV3[] | unknown,
    @Headers('user-agent') userAgent?: string,
  ): void {
    const violations = normalize(body);
    for (const v of violations) {
      this.logger.warn({ violation: v, userAgent }, 'CSP violation');
      // Sentry is a no-op when SENTRY_DSN is unset (init()'d in main.ts).
      Sentry.captureMessage('csp_violation', {
        level: 'warning',
        tags: {
          directive: v.effectiveDirective ?? v.violatedDirective ?? 'unknown',
          disposition: v.disposition ?? 'enforce',
        },
        extra: { ...v, userAgent },
      });
    }
  }
}

interface NormalizedViolation {
  documentURL?: string;
  referrer?: string;
  blockedURL?: string;
  effectiveDirective?: string;
  violatedDirective?: string;
  originalPolicy?: string;
  sourceFile?: string;
  sample?: string;
  disposition?: string;
  statusCode?: number;
  lineNumber?: number;
  columnNumber?: number;
}

function normalize(body: unknown): NormalizedViolation[] {
  if (Array.isArray(body)) {
    // Reporting API style.
    return body
      .filter((r): r is CspReportV3 => isObj(r) && (r as { type?: string }).type === 'csp-violation')
      .map((r) => ({
        documentURL: r.body.documentURL,
        referrer: r.body.referrer,
        blockedURL: r.body.blockedURL,
        effectiveDirective: r.body.effectiveDirective,
        originalPolicy: r.body.originalPolicy,
        sourceFile: r.body.sourceFile,
        sample: r.body.sample,
        disposition: r.body.disposition,
        statusCode: r.body.statusCode,
        lineNumber: r.body.lineNumber,
        columnNumber: r.body.columnNumber,
      }));
  }
  if (isObj(body) && 'csp-report' in body) {
    const r = (body as CspReportV1)['csp-report'];
    if (!r) return [];
    return [
      {
        documentURL: r['document-uri'],
        referrer: r.referrer,
        blockedURL: r['blocked-uri'],
        effectiveDirective: r['effective-directive'],
        violatedDirective: r['violated-directive'],
        originalPolicy: r['original-policy'],
        sourceFile: r['source-file'],
        sample: r['script-sample'],
        disposition: r.disposition,
        statusCode: r['status-code'],
        lineNumber: r['line-number'],
        columnNumber: r['column-number'],
      },
    ];
  }
  return [];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
