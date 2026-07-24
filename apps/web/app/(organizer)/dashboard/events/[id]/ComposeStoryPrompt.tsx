'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X } from 'lucide-react';

/**
 * First-visit nudge (D2): prompts the organiser to compose this event as a
 * Story Mode narrative. Shows only when the event has no published story, and
 * remembers "Skip for now" per event in localStorage so it does not nag.
 */
export default function ComposeStoryPrompt({
  eventId,
  published,
}: {
  eventId: string;
  published: boolean;
}) {
  const key = `orkora_dismiss_story_prompt_${eventId}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (published) {
      setShow(false);
      return;
    }
    try {
      setShow(localStorage.getItem(key) !== '1');
    } catch {
      setShow(true);
    }
  }, [published, key]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(key, '1');
    } catch {
      // ignore
    }
    setShow(false);
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <div className="flex items-start gap-3 pr-8">
        <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-100">
          <Sparkles className="h-4 w-4 text-brand-700" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Compose your event story</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Turn this event page into a scroll-narrative so attendees feel the event before they see the price.
            Pick a template and you have a beautiful page in minutes.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/events/${eventId}/story`}
              className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Sparkles className="h-4 w-4" /> Pick a template
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
