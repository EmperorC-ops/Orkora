import { apiFetch } from './auth';

/**
 * Clickwrap acceptance of the Terms of Service, Privacy Policy and Organizer
 * Agreement. The API owns the current versions and records each acceptance
 * with a timestamp; the web only shows the prompt and posts the answer.
 */

export type LegalDocument = 'terms' | 'privacy' | 'organizer';
export type LegalVersions = Record<LegalDocument, string>;

export interface PendingAcceptance {
  document: LegalDocument;
  version: string;
  organizationId?: string;
  organizationName?: string;
}

export interface LegalStatus {
  versions: LegalVersions;
  pending: PendingAcceptance[];
}

export const LEGAL_LINKS: Record<LegalDocument, { label: string; href: string }> = {
  terms: { label: 'Terms of Service', href: '/legal/terms' },
  privacy: { label: 'Privacy Policy', href: '/legal/privacy' },
  organizer: { label: 'Organizer Agreement', href: '/legal/organizer' },
};

/**
 * Consent given on the signup page, carried to the code step, where the
 * account and session exist and the acceptance can be recorded.
 */
const SIGNUP_CONSENT_KEY = 'orkora_signup_consent';

export const legalApi = {
  versions: () => apiFetch<LegalVersions>('/v1/legal/versions', { auth: false }),
  status: () => apiFetch<LegalStatus>('/v1/legal/status'),
  accept: (
    documents: Array<{ document: LegalDocument; version: string; organizationId?: string }>,
    source: 'signup' | 'org_create' | 'prompt' = 'prompt',
  ) =>
    apiFetch<LegalStatus>('/v1/legal/accept', {
      method: 'POST',
      json: { documents, source },
    }),
};

export function rememberSignupConsent(versions: LegalVersions): void {
  try {
    sessionStorage.setItem(
      SIGNUP_CONSENT_KEY,
      JSON.stringify({ terms: versions.terms, privacy: versions.privacy }),
    );
  } catch {
    // Storage blocked: the dashboard prompt will ask instead.
  }
}

/**
 * Record the consent captured at signup, if any. Best effort: if it fails, the
 * dashboard prompt asks the user to accept, so nothing is lost.
 */
export async function recordSignupConsent(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(SIGNUP_CONSENT_KEY);
    sessionStorage.removeItem(SIGNUP_CONSENT_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const v = JSON.parse(raw) as { terms?: string; privacy?: string };
    if (!v.terms || !v.privacy) return;
    await legalApi.accept(
      [
        { document: 'terms', version: v.terms },
        { document: 'privacy', version: v.privacy },
      ],
      'signup',
    );
  } catch {
    // Ignored; see above.
  }
}
