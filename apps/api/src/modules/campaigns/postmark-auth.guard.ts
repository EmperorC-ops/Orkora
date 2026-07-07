/**
 * PostmarkAuthGuard - Basic Auth gate on the Postmark webhook.
 *
 * WHY
 * ---
 * Postmark webhook events (Bounce, SpamComplaint, Delivery, Open, Click)
 * mutate our email_suppressions ledger. Without authentication, an
 * attacker who knows the webhook URL + a Postmark MessageID + a
 * recipient email can forge a bounce or spam complaint and have that
 * recipient added to the org's suppression list, killing future
 * deliverability for a legitimate contact.
 *
 * MECHANISM
 * ---------
 * Postmark supports HTTP Basic Auth on webhook URLs: configure the
 * webhook URL in the Postmark dashboard as
 *   https://postmark:<TOKEN>@api.orkora.events/v1/webhooks/postmark
 * Postmark then sends `Authorization: Basic base64("postmark:<TOKEN>")`
 * on every event POST. We accept when the decoded password matches
 * POSTMARK_WEBHOOK_TOKEN via constant-time comparison.
 *
 * BACKWARDS COMPATIBILITY
 * -----------------------
 * If POSTMARK_WEBHOOK_TOKEN is unset, the guard logs a warning ONCE
 * per process and admits the request. This preserves the current
 * open-webhook behaviour so a token-rotation window does not knock
 * over live campaigns. Set the token before onboarding real customers.
 */
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostmarkAuthGuard implements CanActivate {
  private readonly logger = new Logger(PostmarkAuthGuard.name);
  private readonly token: string | undefined;
  private hasWarnedOpenAccess = false;

  constructor(config: ConfigService) {
    const raw = config.get<string>('POSTMARK_WEBHOOK_TOKEN');
    const trimmed = raw?.trim();
    this.token = trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.token) {
      if (!this.hasWarnedOpenAccess) {
        this.logger.warn(
          'POSTMARK_WEBHOOK_TOKEN not set; webhook accepts unauthenticated POSTs. ' +
            'Configure the token in Render + the Postmark dashboard before onboarding real customers.',
        );
        this.hasWarnedOpenAccess = true;
      }
      return true;
    }

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const rawHeader = req.headers['authorization'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!header) return false;

    const match = /^Basic\s+([A-Za-z0-9+/=]+)$/.exec(header);
    if (!match || !match[1]) return false;

    let decoded: string;
    try {
      decoded = Buffer.from(match[1], 'base64').toString('utf8');
    } catch {
      return false;
    }

    const colonIdx = decoded.indexOf(':');
    if (colonIdx < 0) return false;
    const provided = decoded.slice(colonIdx + 1);

    return this.timingSafeStringEqual(provided, this.token);
  }

  /**
   * Constant-time string comparison so a bad guess cannot leak length
   * or shared-prefix information via response-time analysis.
   */
  private timingSafeStringEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
