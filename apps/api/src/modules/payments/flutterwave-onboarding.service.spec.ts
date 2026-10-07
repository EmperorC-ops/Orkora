import { BadRequestException } from '@nestjs/common';
import { FlutterwaveOnboardingService } from './flutterwave-onboarding.service';

/**
 * Flutterwave onboarding: confirm the holder before creating the subaccount,
 * record the RS_ id as an active connected account with display-only metadata
 * (never the full account number), and refuse when the provider is off.
 */
function build(opts: { enabled?: boolean; accountName?: string } = {}) {
  const flutterwave = {
    enabled: opts.enabled !== false,
    listBanks: jest.fn().mockResolvedValue([{ name: 'Access Bank', code: '044' }]),
    resolveAccount: jest.fn().mockResolvedValue({ accountName: opts.accountName ?? 'Ada Obi' }),
    createSubaccount: jest.fn().mockResolvedValue({ subaccountId: 'RS_ABC123' }),
  };
  const accounts = { record: jest.fn().mockResolvedValue({ id: 'acct-1' }) };
  const svc = new FlutterwaveOnboardingService(flutterwave as never, accounts as never);
  return { svc, flutterwave, accounts };
}

describe('FlutterwaveOnboardingService', () => {
  it('refuses every operation when Flutterwave is not configured', async () => {
    const { svc } = build({ enabled: false });
    await expect(svc.listBanks('NG')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.resolveAccount('0690000037', '044')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.connect('org1', 'u1', { businessMobile: '080', bankCode: '044', accountNumber: '0690000037' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listBanks defaults to NG and wraps the list', async () => {
    const { svc, flutterwave } = build();
    await expect(svc.listBanks('')).resolves.toEqual({
      banks: [{ name: 'Access Bank', code: '044' }],
    });
    expect(flutterwave.listBanks).toHaveBeenCalledWith('NG');
  });

  it('connect resolves first, creates with a 0% default, and records active with masked metadata', async () => {
    const { svc, flutterwave, accounts } = build({ accountName: 'Ada Obi' });
    await svc.connect(
      'org1',
      'u1',
      {
        businessName: ' Acme Events ',
        businessMobile: ' 08012345678 ',
        businessEmail: 'org@x.test',
        bankCode: ' 044 ',
        accountNumber: ' 0690000037 ',
        country: 'ng',
      },
      'req-1',
    );
    expect(flutterwave.resolveAccount).toHaveBeenCalledWith('0690000037', '044');
    expect(flutterwave.createSubaccount).toHaveBeenCalledWith({
      businessName: 'Acme Events',
      businessMobile: '08012345678',
      businessEmail: 'org@x.test',
      bankCode: '044',
      accountNumber: '0690000037',
      country: 'NG',
    });
    expect(accounts.record).toHaveBeenCalledWith(
      'org1',
      'u1',
      { provider: 'flutterwave', accountRef: 'RS_ABC123', active: true },
      'req-1',
      {
        bankCode: '044',
        country: 'NG',
        accountLast4: '0037',
        accountName: 'Ada Obi',
        businessName: 'Acme Events',
      },
    );
    // The full account number must never reach the stored metadata.
    const meta = accounts.record.mock.calls[0]?.[4] as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain('0690000037');
  });

  it('falls back to the resolved holder name when no business name is given', async () => {
    const { svc, flutterwave } = build({ accountName: 'Ada Obi' });
    await svc.connect('org1', 'u1', {
      businessMobile: '080',
      bankCode: '044',
      accountNumber: '0690000037',
    });
    expect(flutterwave.createSubaccount).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: 'Ada Obi', country: 'NG' }),
    );
  });

  it('does not create a subaccount when the account cannot be resolved', async () => {
    const { svc, flutterwave, accounts } = build();
    flutterwave.resolveAccount.mockRejectedValueOnce(new Error('Could not verify that account'));
    await expect(
      svc.connect('org1', 'u1', { businessMobile: '080', bankCode: '044', accountNumber: '0000000' }),
    ).rejects.toThrow(/Could not verify/);
    expect(flutterwave.createSubaccount).not.toHaveBeenCalled();
    expect(accounts.record).not.toHaveBeenCalled();
  });

  it('requires a business mobile (Flutterwave mandates it on the subaccount)', async () => {
    const { svc, flutterwave } = build();
    await expect(
      svc.connect('org1', 'u1', { businessMobile: '   ', bankCode: '044', accountNumber: '0690000037' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(flutterwave.resolveAccount).not.toHaveBeenCalled();
  });
});
