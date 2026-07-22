'use client';

/**
 * Public attendee feedback form for the event page. Shown once an event is
 * live or ended. Collects an optional star rating (1-5), an optional NPS score
 * (0-10), and an optional comment, targeted either at the whole event or a
 * single session. Submission is anonymous unless the attendee volunteers an
 * email. At least one signal is required; the API enforces the same rule.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { ActionButton } from '@/components/action-button';

interface FeedbackSession {
  id: string;
  title: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function FeedbackForm({
  code,
  sessions,
}: {
  code: string;
  sessions: FeedbackSession[];
}) {
  const [target, setTarget] = useState<string>(''); // '' = event overall
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSignal = rating > 0 || nps !== null || comment.trim().length > 0;

  async function submit() {
    setError(null);
    const res = await fetch(`${API}/v1/events/${code}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: target || undefined,
        rating: rating > 0 ? rating : undefined,
        npsScore: nps !== null ? nps : undefined,
        comment: comment.trim() || undefined,
        email: email.trim() || undefined,
      }),
    });
    if (!res.ok) {
      let msg = 'Could not submit your feedback. Please try again.';
      try {
        const body = await res.json();
        if (typeof body?.detail === 'string') msg = body.detail;
        else if (typeof body?.message === 'string') msg = body.message;
        else if (Array.isArray(body?.message)) msg = body.message.join(', ');
      } catch {
        // keep default
      }
      throw new Error(msg);
    }
  }

  if (submitted) {
    return (
      <section className="rounded-xl border border-surface-border bg-surface p-6 text-center shadow-glow">
        <h2 className="text-xl font-bold text-ink-primary">Thank you</h2>
        <p className="mt-2 text-sm text-ink-secondary">
          Your feedback has been shared with the organizer.
        </p>
      </section>
    );
  }

  const displayRating = hoverRating || rating;

  return (
    <section className="rounded-xl border border-surface-border bg-surface p-6 shadow-glow">
      <h2 className="text-2xl font-bold text-ink-primary">Share your feedback</h2>
      <p className="mt-1 text-sm text-ink-secondary">
        Optional and anonymous. Help the organizer make the next one better.
      </p>

      <div className="mt-6 space-y-6">
        {sessions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              What is this about?
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink-primary"
            >
              <option value="">The event overall</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            How would you rate it?
          </label>
          <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n === rating ? 0 : n)}
                onMouseEnter={() => setHoverRating(n)}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className="p-1"
              >
                <Star
                  className={`h-7 w-7 transition ${
                    n <= displayRating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-ink-muted'
                  }`}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-ink-secondary">{rating}/5</span>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            How likely are you to recommend it? (0-10)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNps(n === nps ? null : n)}
                className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
                  n === nps
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-surface-border bg-surface-raised text-ink-secondary hover:border-brand-500/50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Anything you want to add?
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="What worked, what could be better..."
            className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-secondary">
            Email (optional, if you would like a reply)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
          />
        </div>

        {error && <p className="text-sm text-[#FF9090]">{error}</p>}

        <ActionButton
          onAction={submit}
          idleLabel="Submit feedback"
          pendingLabel="Submitting..."
          successLabel="Thanks!"
          variant="primary"
          disabled={!hasSignal}
          onError={(msg) => setError(msg)}
          onDone={() => setSubmitted(true)}
        />
      </div>
    </section>
  );
}
