/**
 * Orkora Technologies Limited: statutory particulars.
 *
 * CAMA 2020 ss. 304 and 729 require a company's registered name, registration
 * number and directors (forename or initials, and surname) on its business
 * letters, receipts and other business documents. The Corporate Affairs
 * Commission has enforced this since 1 August 2026. Every transactional and
 * campaign email Orkora sends carries these lines (see notifications/templates.ts
 * and campaigns.service.ts).
 *
 * Source: CAC certificate of incorporation and status report, 21 July 2026.
 *
 * KEEP IN SYNC with apps/web/lib/company.ts, the letterhead, and the billing
 * workbook. Change all of them the same day a director joins or leaves or the
 * registered office moves.
 */
export const COMPANY = {
  name: 'Orkora Technologies Limited',
  rcNumber: 'RC 9697234',
  directors: 'Director: T. F. Sodeinde',
  /**
   * Whether the directors line is printed on emails. Off by the owner's
   * instruction (3 Oct 2026) pending counsel's advice on how s. 304 applies to
   * transactional and campaign email. Set to true to restore it everywhere.
   */
  showDirectors: false,
  /**
   * Registered office as filed with the CAC. Deliberately null for now: the
   * address on file is a private residence and a change of registered office
   * is being filed. When the CAC approves the new address, set it here and it
   * appears in every email footer automatically.
   */
  registeredOffice: null as string | null,
} as const;

/** The statutory lines, in display order, with nothing empty. */
export function statutoryLines(): string[] {
  const lines = [`${COMPANY.name}, ${COMPANY.rcNumber}. Registered in Nigeria.`];
  if (COMPANY.registeredOffice) lines.push(`Registered office: ${COMPANY.registeredOffice}`);
  if (COMPANY.showDirectors) lines.push(COMPANY.directors);
  return lines;
}

/** Plain-text footer for the text/plain part of an email. */
export function statutoryText(): string {
  return statutoryLines().join(' ');
}
