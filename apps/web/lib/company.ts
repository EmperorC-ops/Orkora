/**
 * Orkora Technologies Limited: statutory particulars for the public site.
 *
 * Source: CAC certificate of incorporation and status report, 21 July 2026.
 * KEEP IN SYNC with apps/api/src/common/company.ts (email footers), the
 * letterhead, and the billing workbook.
 */
export const COMPANY = {
  name: 'Orkora Technologies Limited',
  rcNumber: 'RC 9697234',
  directors: 'Director: T. F. Sodeinde',
  /**
   * Whether the directors line is shown in the site footer. Off by the
   * owner's instruction (3 Oct 2026) pending counsel's advice. Mirrors
   * apps/api/src/common/company.ts.
   */
  showDirectors: false,
  /**
   * Registered office as filed with the CAC. Null until the change of
   * registered office is approved: the address currently on file is a private
   * residence. Set it here and it appears in the site footer.
   */
  registeredOffice: null as string | null,
} as const;
