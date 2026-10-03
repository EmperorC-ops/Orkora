import { COMPANY } from '../../common/company';
import {
  inviteEmailTemplate,
  otpEmailTemplate,
  receiptTemplate,
  refundTemplate,
  signupCollisionNoticeTemplate,
  ticketConfirmationTemplate,
} from './templates';

/**
 * The ticket confirmation email is the one place the venue is always shown,
 * even for an event whose public page hides it (location_on_ticket_only). These
 * tests pin that the venue block renders when present and is absent otherwise.
 */
describe('ticketConfirmationTemplate venue block', () => {
  const base = {
    eventTitle: 'Transformational Leadership 2026',
    eventDateLine: 'Sat, 10 Jan 2026, 10:00',
    tickets: [
      { code: 'TKT-1', holderName: 'Ada', tierName: 'General', ticketUrl: 'https://x/t/TKT-1' },
    ],
  };

  it('renders venue name, address and join link when provided', () => {
    const out = ticketConfirmationTemplate({
      ...base,
      venue: {
        name: 'The Landmark Centre',
        address: '1 Water Corporation Rd\nVictoria Island',
        joinUrl: 'https://meet.example/room',
      },
    });
    expect(out.html).toContain('The Landmark Centre');
    expect(out.html).toContain('Water Corporation Rd');
    expect(out.html).toContain('https://meet.example/room');
    expect(out.html).toContain('Join online');
    expect(out.text).toContain('The Landmark Centre');
    expect(out.text).toContain('https://meet.example/room');
  });

  it('omits the venue block entirely when no venue is set', () => {
    const out = ticketConfirmationTemplate(base);
    expect(out.html).not.toContain('>Where<');
    expect(out.text).not.toContain('Where:');
  });

  it('renders only the parts that are present', () => {
    const out = ticketConfirmationTemplate({
      ...base,
      venue: { name: 'The Hall', address: null, joinUrl: null },
    });
    expect(out.html).toContain('The Hall');
    expect(out.html).not.toContain('Join online');
  });
});

/**
 * CAMA 2020 ss. 304 and 729: every business email Orkora sends must carry the
 * registered name and RC number (and directors when switched on), in BOTH the HTML and the plain-text
 * part (some clients show only the text part). One assertion per template so a
 * new template that bypasses wrap() or withStatutory() fails loudly.
 */
describe('statutory particulars on every email', () => {
  const all = {
    otp: otpEmailTemplate('123456'),
    invite: inviteEmailTemplate('Acme Events', 'https://x/accept'),
    collision: signupCollisionNoticeTemplate(),
    ticket: ticketConfirmationTemplate({
      eventTitle: 'Show',
      eventDateLine: 'Sat, 10 Jan 2026, 10:00',
      tickets: [{ code: 'TKT-1', holderName: 'Ada', tierName: 'General', ticketUrl: 'https://x/t/TKT-1' }],
    }),
    receipt: receiptTemplate({
      orderId: 'ord_1',
      eventTitle: 'Show',
      orgName: 'Acme Events',
      paidAtLine: '10 Jan 2026',
      provider: 'Paystack',
      totalFormatted: 'NGN 5,000.00',
      lines: [{ description: 'General', quantity: 1, amount: 'NGN 5,000.00' }],
    }),
    refund: refundTemplate({
      orderId: 'ord_1',
      eventTitle: 'Show',
      orgName: 'Acme Events',
      refundedAtLine: '11 Jan 2026',
      provider: 'Paystack',
      totalFormatted: 'NGN 5,000.00',
    }),
  };

  for (const [name, out] of Object.entries(all)) {
    it(`${name}: HTML and text both carry name and RC number`, () => {
      for (const part of [out.html, out.text]) {
        expect(part).toContain('Orkora Technologies Limited');
        expect(part).toContain('RC 9697234');
        // Directors line follows COMPANY.showDirectors (off pending counsel).
        if (COMPANY.showDirectors) expect(part).toContain(COMPANY.directors);
        else expect(part).not.toContain('Director:');
      }
    });
  }

  it('no template references the deleted wordmark PNG', () => {
    for (const out of Object.values(all)) {
      expect(out.html).not.toContain('orkora-wordmark-on-dark.png');
      expect(out.html).not.toMatch(/<img[^>]+alt="Orkora"/);
    }
  });
});
