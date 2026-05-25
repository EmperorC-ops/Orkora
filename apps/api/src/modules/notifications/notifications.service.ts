import { Inject, Injectable } from '@nestjs/common';
import { EMAIL_PROVIDER, SMS_PROVIDER, type EmailProvider, type SmsProvider } from './tokens';
import {
  otpEmailTemplate,
  inviteEmailTemplate,
  ticketConfirmationTemplate,
  receiptTemplate,
  type TicketEmailTicket,
  type ReceiptLine,
} from './templates';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async sendOtpEmail(to: string, code: string): Promise<void> {
    const { subject, html, text } = otpEmailTemplate(code);
    await this.email.send({ to, subject, html, text });
  }

  async sendOtpSms(to: string, code: string): Promise<void> {
    await this.sms.send({
      to,
      body: `Your Orkora verification code is ${code}. It expires in 10 minutes.`,
    });
  }

  async sendInviteEmail(to: string, orgName: string, acceptUrl: string): Promise<void> {
    const { subject, html, text } = inviteEmailTemplate(orgName, acceptUrl);
    await this.email.send({ to, subject, html, text });
  }

  async sendTicketConfirmationEmail(
    to: string,
    input: { eventTitle: string; eventDateLine: string; tickets: TicketEmailTicket[] },
  ): Promise<void> {
    const { subject, html, text } = ticketConfirmationTemplate(input);
    await this.email.send({ to, subject, html, text });
  }

  /**
   * Payment receipt (financial record), emailed alongside the ticket
   * confirmation when an order is marked paid. Amounts are pre-formatted by the
   * caller (via `formatMoney`) so each currency's decimals are already correct.
   */
  async sendReceiptEmail(
    to: string,
    input: {
      orderId: string;
      eventTitle: string;
      orgName: string;
      paidAtLine: string;
      provider: string;
      totalFormatted: string;
      lines: ReceiptLine[];
    },
  ): Promise<void> {
    const { subject, html, text } = receiptTemplate(input);
    await this.email.send({ to, subject, html, text });
  }
}
