'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { subscribeToBrand } from '@/lib/brand';

/**
 * Community subscribe on the public Brand Home. Captures an email into the
 * brand's audience. Idempotent server-side, so it never reveals membership.
 */
export default function SubscribeForm({
  slug,
  color,
  compact = false,
}: {
  slug: string;
  color: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setState('sending');
    const ok = await subscribeToBrand(slug, value);
    if (ok) {
      setState('done');
      setEmail('');
    } else {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <p className="inline-flex items-center gap-2 text-sm font-medium text-ink-primary">
        <Check className="h-4 w-4" style={{ color }} /> You are on the list. See you soon.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className={`flex gap-2 ${compact ? '' : 'max-w-md'}`}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="flex-1 rounded-full border border-surface-border bg-surface/60 px-4 py-2.5 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
      />
      <button
        type="submit"
        disabled={!email || state === 'sending'}
        className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
        style={{ backgroundColor: color }}
      >
        {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Subscribe
      </button>
    </form>
  );
}
