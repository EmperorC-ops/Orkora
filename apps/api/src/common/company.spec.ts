import { COMPANY, statutoryLines, statutoryText } from './company';

describe('company statutory particulars', () => {
  it('match the CAC certificate of incorporation', () => {
    expect(COMPANY.name).toBe('Orkora Technologies Limited');
    expect(COMPANY.rcNumber).toBe('RC 9697234');
  });

  it('omit the registered office line while it is unset', () => {
    if (COMPANY.registeredOffice === null) {
      expect(statutoryLines().join(' ')).not.toContain('Registered office');
    }
  });

  it('print the directors line only when switched on', () => {
    expect(statutoryLines().includes(COMPANY.directors)).toBe(COMPANY.showDirectors);
  });

  it('never emit an empty line', () => {
    for (const l of statutoryLines()) expect(l.trim().length).toBeGreaterThan(0);
  });

  it('text form contains every line', () => {
    for (const l of statutoryLines()) expect(statutoryText()).toContain(l);
  });

  it('contains no em dash', () => {
    expect(statutoryText()).not.toContain('\u2014');
  });
});
