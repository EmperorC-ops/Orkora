import { BadRequestException, Injectable } from '@nestjs/common';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { ConnectedAccountsService } from './connected-accounts.service';

/**
 * Flutterwave connected-account onboarding.
 *
 * Flutterwave settles split payments to a collection subaccount that stands in
 * for the organizer's own bank account. Like Paystack, onboarding is a direct
 * API flow with no redirect: list banks for the organizer's country, resolve
 * the account number to confirm the holder, then create the subaccount and
 * record its `RS_...` id as the org's connected account.
 *
 * The subaccount is created with a 0% default split, so it never takes a cut
 * on its own. The platform fee is applied per transaction as a flat commission
 * override in FlutterwaveProvider.createCheckoutSession. While the
 * connected-accounts gate is off, checkout still settles centrally as before.
 *
 * Readiness: Flutterwave has no per-account "charges enabled" signal to poll or
 * a Stripe-style account webhook; a successfully created subaccount is usable
 * at once, so it is recorded active. Flutterwave may still hold payouts on its
 * own KYC state, which we cannot observe here.
 */
@Injectable()
export class FlutterwaveOnboardingService {
  constructor(
    private readonly flutterwave: FlutterwaveProvider,
    private readonly accounts: ConnectedAccountsService,
  ) {}

  async listBanks(country: string) {
    this.ensureEnabled();
    const banks = await this.flutterwave.listBanks(country || 'NG');
    return { banks };
  }

  async resolveAccount(accountNumber: string, bankCode: string) {
    this.ensureEnabled();
    return this.flutterwave.resolveAccount(accountNumber.trim(), bankCode.trim());
  }

  /**
   * Create the organizer's Flutterwave subaccount and store it as their
   * connected account. Confirms the bank account first so a mistyped number
   * cannot create a subaccount that pays the wrong person.
   */
  async connect(
    orgId: string,
    actorUserId: string,
    input: {
      businessName?: string;
      businessMobile: string;
      businessEmail?: string;
      bankCode: string;
      accountNumber: string;
      country?: string;
    },
    requestId?: string,
  ) {
    this.ensureEnabled();
    const accountNumber = input.accountNumber.trim();
    const bankCode = input.bankCode.trim();
    const businessMobile = input.businessMobile.trim();
    const country = (input.country?.trim() || 'NG').toUpperCase();
    if (!accountNumber || !bankCode) {
      throw new BadRequestException('Bank and account number are required');
    }
    if (!businessMobile) {
      throw new BadRequestException('A business contact number is required');
    }

    const resolved = await this.flutterwave.resolveAccount(accountNumber, bankCode);
    const businessName = (input.businessName?.trim() || resolved.accountName).slice(0, 100);

    const { subaccountId } = await this.flutterwave.createSubaccount({
      businessName,
      businessMobile,
      businessEmail: input.businessEmail?.trim() || undefined,
      bankCode,
      accountNumber,
      country,
    });

    return this.accounts.record(
      orgId,
      actorUserId,
      { provider: 'flutterwave', accountRef: subaccountId, active: true },
      requestId,
      {
        bankCode,
        country,
        // Store only the last four digits for display, never the full number.
        accountLast4: accountNumber.slice(-4),
        accountName: resolved.accountName,
        businessName,
      },
    );
  }

  private ensureEnabled() {
    if (!this.flutterwave.enabled) {
      throw new BadRequestException('Flutterwave is not configured on this server');
    }
  }
}
