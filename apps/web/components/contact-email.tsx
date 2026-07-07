'use client';

/**
 * ContactEmail
 *
 * Renders an email address with two affordances side by side:
 *   1. Text of the address, click to open the OS default mail handler
 *      (mailto:). Works out of the box for users with Outlook, Apple
 *      Mail, Thunderbird, etc. set up.
 *   2. A small copy icon that copies the address to clipboard so
 *      webmail users (Gmail, Outlook.com, ProtonMail) can paste it into
 *      their own compose window instead of being funneled through an
 *      unfamiliar mailto dialog.
 *
 * Why this matters: default mailto opens the OS handler which many users
 * on Windows do not have configured. Rather than assume a handler is
 * present, we always offer the copy path. A toast confirms the copy.
 *
 * Usage:
 *   <ContactEmail address="hello@orkora.events" />
 *   <ContactEmail address="privacy@orkora.events" subject="DSR request" />
 *   <ContactEmail address="hello@orkora.events" className="text-sm" />
 */

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface ContactEmailProps {
  address: string;
  /** Optional subject seeded into the mailto link. */
  subject?: string;
  /** Optional body seeded into the mailto link. */
  body?: string;
  /** Additional Tailwind classes for the wrapper span. */
  className?: string;
  /** When true, only the address text is rendered (no copy button). */
  suppressCopy?: boolean;
}

export function ContactEmail({ address, subject, body, className, suppressCopy = false }: ContactEmailProps) {
  const [copied, setCopied] = useState(false);

  const mailtoHref = (() => {
    const q: string[] = [];
    if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
    if (body) q.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${address}${q.length ? `?${q.join('&')}` : ''}`;
  })();

  const copy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        // Legacy fallback for older browsers or non-secure contexts.
        const el = document.createElement('textarea');
        el.value = address;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Copy failed silently; user can still click the address to open mailto.
    }
  }, [address]);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <a
        href={mailtoHref}
        className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 transition hover:text-brand-200"
      >
        {address}
      </a>
      {!suppressCopy && (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Address copied' : `Copy ${address} to clipboard`}
          title={copied ? 'Copied' : 'Copy address'}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-surface-border bg-surface/40 text-ink-secondary transition hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-300"
        >
          {copied ? (
            <Check className="h-3 w-3 text-brand-300" aria-hidden />
          ) : (
            <Copy className="h-3 w-3" aria-hidden />
          )}
        </button>
      )}
    </span>
  );
}

export default ContactEmail;
