/**
 * Current versions of the legal documents users must accept.
 *
 * Bumping a version here makes everyone who accepted an older version see the
 * acceptance prompt again on their next dashboard visit. Change the version in
 * the same commit that publishes the new text in apps/web/legal/*.md, and only
 * when that text is ready to take effect.
 *
 *   terms      Terms of Service: every account holder.
 *   privacy    Privacy Policy: acknowledged alongside the Terms.
 *   organizer  Organizer Agreement: accepted by an owner or admin on behalf of
 *              an organization, once per organization per version.
 */
export const LEGAL_DOCUMENTS = ['terms', 'privacy', 'organizer'] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export const CURRENT_LEGAL_VERSIONS: Record<LegalDocument, string> = {
  terms: '2.1',
  privacy: '1.1',
  organizer: '2.1',
};

/** Where an acceptance was given, kept as evidence alongside the timestamp. */
export const LEGAL_ACCEPTANCE_SOURCES = ['signup', 'org_create', 'prompt'] as const;
export type LegalAcceptanceSource = (typeof LEGAL_ACCEPTANCE_SOURCES)[number];

/** Roles that may accept the Organizer Agreement for an organization. */
export const ORGANIZER_AGREEMENT_ROLES = ['owner', 'admin'] as const;
