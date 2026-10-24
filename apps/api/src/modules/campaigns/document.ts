import { createHmac } from 'crypto';
import { acceptOwnMediaUrl } from './flyer';

/**
 * Campaign document: one optional PDF (for example a newsletter) linked from a
 * campaign email with a "Download" button. Never sent as an attachment:
 * attachments multiply the payload per recipient, break batch sending and
 * hurt deliverability, and a link can be corrected after sending.
 *
 * The button points at an Orkora redirect (/v1/c/doc/:campaignId?r=...) so
 * the organizer can see how many recipients opened the document. The redirect
 * only ever forwards to the campaign's own stored document, which must live on
 * our media host under campaign_documents/.
 */

export const DOCUMENT_FOLDER = 'campaign_documents';

/** The normalised document URL if it is one of our uploaded PDFs, else null. */
export function acceptDocumentUrl(
  raw: string | null | undefined,
  publicBaseUrl: string | null | undefined,
): string | null {
  return acceptOwnMediaUrl(raw, publicBaseUrl, DOCUMENT_FOLDER, /\.pdf$/i);
}

/**
 * A safe display name for the document button: the file name only, no path,
 * no control characters, letters, digits, spaces and . _ - ( ) & only, at most
 * 80 characters, always ending in .pdf. Falls back to "document.pdf".
 */
export function sanitizeDocumentName(raw: string | null | undefined): string {
  let name = String(raw ?? '').slice(0, 300);
  name = name.split(/[\\/]/).pop() ?? '';
  name = name.replace(/[^\p{L}\p{N} ._\-()&]/gu, ' ').replace(/\s+/g, ' ').trim();
  name = name.replace(/\.pdf$/i, '').trim();
  if (!name) name = 'document';
  if (name.length > 76) name = name.slice(0, 76).trim();
  return `${name}.pdf`;
}

/**
 * Opaque per-recipient key for download counting. Keyed HMAC of the campaign
 * and the recipient's email, so the link carries no personal data and the
 * count can be checked against the campaign's real recipients.
 */
export function documentRecipientKey(pepper: string, campaignId: string, email: string): string {
  return createHmac('sha256', pepper)
    .update(`doc|${campaignId}|${email.trim().toLowerCase()}`)
    .digest('base64url')
    .slice(0, 22);
}

export function formatDocumentSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 1) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The download card placed above the campaign body (below any flyer). */
export function renderDocumentBlock(input: {
  href: string;
  name: string;
  sizeBytes?: number | null;
}): string {
  const size = formatDocumentSize(input.sizeBytes);
  const label = escapeHtml(input.name);
  return `<div style="margin:0 0 24px 0;padding:16px;border:1px solid #E2E8F0;border-radius:12px;text-align:center;">
<div style="font-size:14px;line-height:20px;color:#0F172A;font-weight:600;">${label}</div>
<div style="font-size:12px;line-height:18px;color:#64748B;margin-top:2px;">PDF document${size ? ` &middot; ${size}` : ''}</div>
<a href="${escapeHtml(input.href)}" style="display:inline-block;margin-top:12px;background:#6D28D9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:600;font-size:14px;">Download PDF</a>
</div>`;
}
