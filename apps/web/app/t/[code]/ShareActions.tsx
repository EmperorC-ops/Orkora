'use client';

/**
 * Post-purchase share sheet for a ticket. Turns every ticket into marketing:
 *
 *   - A brand-styled card is generated server-side at /og/ticket/<code>. We show
 *     it as a preview and let the attendee download the Instagram Story (9:16)
 *     or square (1:1) version to post. The event URL is burned into the image,
 *     so followers who see the story know where to go.
 *   - "Share event" uses the Web Share API to share the PUBLIC event link (with
 *     a source tag for attribution), never the ticket code, so nothing an
 *     attendee posts can be used to view their QR or check in as them.
 */

import { useEffect, useState } from 'react';
import { Download, Share2, Check, Copy } from 'lucide-react';
import { recordTicketCardEvent } from '@/lib/brand';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://orkora.events';

export default function ShareActions({
  code,
  eventCode,
  eventTitle,
}: {
  code: string;
  eventCode: string;
  eventTitle: string;
}) {
  const [copied, setCopied] = useState(false);

  // The attendee is shown a generated card on this page - count it once. The
  // API resolves the brand from the ticket code, so no org slug is needed here.
  useEffect(() => {
    recordTicketCardEvent(code, 'shareable_card.generated', 'ticket_page');
  }, [code]);

  // Same-origin route in the web app. Relative URLs keep it origin-correct.
  const storyUrl = `/og/ticket/${encodeURIComponent(code)}?format=story`;
  const squareUrl = `/og/ticket/${encodeURIComponent(code)}?format=square`;
  const previewUrl = `/og/ticket/${encodeURIComponent(code)}?format=og`;

  // The link we actually share is the public event page, tagged for attribution.
  const shareLink = `${APP}/e/${encodeURIComponent(eventCode)}?source=shareable_card`;

  async function shareEvent() {
    const data = {
      title: eventTitle,
      text: `I am going to ${eventTitle}. Come with me.`,
      url: shareLink,
    };
    // Native share sheet on mobile; clipboard fallback on desktop.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // user cancelled or share failed; fall through to copy
      }
    }
    await copyLink();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // no-op
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-surface-border bg-surface/40 p-6">
      <h2 className="text-lg font-semibold text-ink-primary">You are in. Share it.</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Post your card, or send friends the event.
      </p>

      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Card preview */}
        <div className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-surface-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Your shareable card" className="block w-full" />
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2 sm:max-w-xs">
          <button
            type="button"
            onClick={shareEvent}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            <Share2 className="h-4 w-4" /> Share event
          </button>

          <a
            href={storyUrl}
            download={`orkora-${eventCode}-story.png`}
            onClick={() => recordTicketCardEvent(code, 'shareable_card.downloaded', 'story')}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-surface-border bg-surface/60 px-4 py-2.5 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Download story card (9:16)
          </a>

          <a
            href={squareUrl}
            download={`orkora-${eventCode}-square.png`}
            onClick={() => recordTicketCardEvent(code, 'shareable_card.downloaded', 'square')}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-surface-border bg-surface/60 px-4 py-2.5 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Download square card (1:1)
          </a>

          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#00C896]" /> Link copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy event link
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
