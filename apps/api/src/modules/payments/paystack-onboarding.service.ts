import { BadRequestException, Injectable } from '@nestjs/common';
import { PaystackProvider } from './providers/paystack.provider';
import { ConnectedAccountsService } from './connected-accounts.service';

/**
 * Paystack connected-account onboarding.
 *
 * Paystack settles split payments to a subaccount that stands in for the
 * organizer's own bank account. Onboarding is a direct API flow (no redirect):
 * list banks, resolve the account number to confirm the holder, then create the
 * subaccount and record its code as the org's connected account.
 *
 * The subaccount is created with a 0% default charge, so it never takes a cut on
 * its own. The platform fee is applied per transaction when the split is wired
 * (a later slice). Until then, and while the connected-accounts gate is off,
 * checkout still settles centrally exactly as before.
 */
@Injectable()
export class PaystackOnboardingService {
  constructor(
    private readonly paystack: PaystackProvider,
    private readonly accounts: ConnectedAccountsService,
  ) {}

  async listBanks(currency: string) {
    this.ensureEnabled();
    const banks = await this.paystack.listBanks(currency || 'NGN');
    return { banks };
  }

  async resolveAccount(accountNumber: string, bankCode: string) {
    this.ensureEnabled();
    return this.paystack.resolveAccount(accountNumber.trim(), bankCode.trim());
  }

  /**
   * Create the organizer's Paystack subaccount and store it as their connected
   * account. Confirms the bank account first so a mistyped number cannot create
   * a subaccount that pays the wrong person.
   */
  async connect(
    orgId: string,
    actorUserId: string,
    input: { businessName?: string; bankCode: string; accountNumber: string },
    requestId?: string,
  ) {
    this.ensureEnabled();
    const accountNumber = input.accountNumber.trim();
    const bankCode = input.bankCode.trim();
    if (!accountNumber || !bankCode) {
      throw new BadRequestException('Bank and account number are required');
    }

    const resolved = await this.paystack.resolveAccount(accountNumber, bankCode);
    const businessName = (input.businessName?.trim() || resolved.accountName).slice(0, 100);

    const { subaccountCode } = await this.paystack.createSubaccount({
      businessName,
      bankCode,
      accountNumber,
      percentageCharge: 0,
    });

    return this.accounts.record(
      orgId,
      actorUserId,
      { provider: 'paystack', accountRef: subaccountCode, active: true },
      requestId,
      {
        bankCode,
        // Store only the last four digits for display, never the full number.
        accountLast4: accountNumber.slice(-4),
        accountName: resolved.accountName,
        businessName,
      },
    );
  }

  private ensureEnabled() {
    if (!this.paystack.enabled) {
      throw new BadRequestException('Paystack is not configured on this server');
    }
  }
}
