export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text?: string }): Promise<void>;
}

export interface SmsProvider {
  send(input: { to: string; body: string }): Promise<void>;
}
