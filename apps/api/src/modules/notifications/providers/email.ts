import { Logger } from '@nestjs/common';
import type { EmailProvider } from '../tokens';

/**
 * Logs the email to stdout. Use for local dev so we never need a real SMTP server.
 * MailHog (in docker-compose) is available if you want to inspect rendered HTML in a UI.
 */
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('ConsoleEmail');

  async send(input: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    this.logger.log(
      `\n----- EMAIL -----\nTo: ${input.to}\nSubject: ${input.subject}\n${input.text ?? input.html.replace(/<[^>]+>/g, '')}\n-----------------`,
    );
  }
}

/**
 * Postmark: low-latency, high-deliverability transactional email.
 * Docs: https://postmarkapp.com/developer/api/email-api
 */
export class PostmarkEmailProvider implements EmailProvider {
  private readonly logger = new Logger('PostmarkEmail');

  constructor(
    private readonly token: string,
    private readonly from = 'no-reply@orkora.io',
  ) {}

  async send(input: { to: string; subject: string; html: string; text?: string }): Promise<void> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.token,
      },
      body: JSON.stringify({
        From: this.from,
        To: input.to,
        Subject: input.subject,
        HtmlBody: input.html,
        TextBody: input.text ?? stripHtml(input.html),
        MessageStream: 'outbound',
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Postmark send failed: ${res.status} ${detail}`);
      throw new Error(`Postmark error ${res.status}`);
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
