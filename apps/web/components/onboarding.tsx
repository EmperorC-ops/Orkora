'use client';

/**
 * Onboarding gate shown when a signed-in user has no organization memberships.
 *
 * The organizer dashboard reads the active org id from the access token's
 * `memberships` claim. A brand-new user has an empty list there, so every
 * page on the organizer surface lights up with "No active organization on
 * this account." This component takes over the layout for that case: a
 * single-step form that creates the org, refreshes the access token (so the
 * new membership appears in the JWT claim), and reloads the surface.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-|-$/g, '');
}

interface CreateOrgResponse {
  id: string;
  name: string;
  slug: string;
}

export function Onboarding({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [countryCode, setCountryCode] = useState('NG');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug from name until the user types their own.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError('Give your organization a name.');
      return;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) {
      setError('Slug must be lowercase letters, numbers, and dashes only.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch<CreateOrgResponse>('/v1/organizations', {
        method: 'POST',
        json: { name: name.trim(), slug, countryCode },
      });
      // Refresh the access token so the new membership lands in the JWT
      // claim. The refresh endpoint reads the httpOnly cookie set at signup.
      const refreshed = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/v1/auth/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}',
        },
      );
      if (refreshed.ok) {
        const tokens = (await refreshed.json()) as { accessToken: string };
        sessionStorage.setItem('access_token', tokens.accessToken);
      }
      if (onCreated) onCreated();
      // Hard reload so every hook reads the new membership claim fresh.
      window.location.assign('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create the organization.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-3xl border border-surface-border bg-surface/60 p-8 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
            <Sparkles className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink-primary">Welcome to Orkora</h1>
            <p className="text-sm text-ink-secondary">
              Set up your organization to start publishing events.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="org-name" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
              placeholder="Voltafrica"
              className="mt-2 w-full rounded-xl border border-surface-border bg-surface-deep/50 px-4 py-3 text-base text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              This is what attendees see on your public event pages.
            </p>
          </div>

          <div>
            <label htmlFor="org-slug" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              URL slug
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-surface-border bg-surface-deep/50 px-4 py-3">
              <span className="select-none pr-1 text-sm text-ink-muted">orkora.io/o/</span>
              <input
                id="org-slug"
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                }}
                maxLength={40}
                required
                placeholder="voltafrica"
                className="flex-1 bg-transparent text-base text-ink-primary placeholder:text-ink-muted focus:outline-none"
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              Lowercase letters, numbers, and dashes. 2 to 40 characters.
            </p>
          </div>

          <div>
            <label htmlFor="org-country" className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Primary country
            </label>
            <select
              id="org-country"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="mt-2 w-full rounded-xl border border-surface-border bg-surface-deep/50 px-4 py-3 text-base text-ink-primary focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="NG">Nigeria</option>
              <option value="GH">Ghana</option>
              <option value="KE">Kenya</option>
              <option value="ZA">South Africa</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="CA">Canada</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="OTHER">Other</option>
            </select>
            <p className="mt-1.5 text-xs text-ink-muted">
              Sets the default currency and payment provider for new events. You can override per event.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/10 px-4 py-3 text-sm text-[#FF9090]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || name.trim().length < 2 || slug.length < 2}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create organization
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
