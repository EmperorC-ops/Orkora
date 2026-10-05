/**
 * Device-local memory for the installed Orkora (PWA) launch experience.
 *
 * The problem: a PWA launches to a single fixed start_url. An attendee who
 * installed Orkora from their ticket page then taps the icon at the door and
 * lands on the marketing homepage instead of their QR code, which undoes the
 * whole promise of "keep your ticket on your phone".
 *
 * The fix: the ticket page records the last ticket code viewed on this device,
 * and the /app launcher reads it to open straight to that ticket. Ticket pages
 * are public by code and cached by the service worker, so this works offline
 * too. The code is stored in localStorage (not a cookie) so it never leaves
 * the device in a request header.
 *
 * Only the code is stored, never the signed qrToken. Anyone with the code can
 * already open /t/<code>, so this adds no exposure beyond the URL itself.
 */

const LAST_TICKET_KEY = 'orkora_last_ticket_code';

export function rememberLastTicket(code: string): void {
  if (typeof window === 'undefined' || !code) return;
  try {
    window.localStorage.setItem(LAST_TICKET_KEY, code);
  } catch {
    /* storage unavailable (private mode, quota); the launcher falls back */
  }
}

export function readLastTicket(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(LAST_TICKET_KEY);
    // Ticket codes are short alphanumerics; refuse anything else so a
    // tampered value can never become a path we navigate to.
    return v && /^[A-Za-z0-9-]{4,32}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function forgetLastTicket(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_TICKET_KEY);
  } catch {
    /* ignore */
  }
}
