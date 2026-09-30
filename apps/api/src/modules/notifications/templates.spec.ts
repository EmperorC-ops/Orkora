import { ticketConfirmationTemplate } from './templates';

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
