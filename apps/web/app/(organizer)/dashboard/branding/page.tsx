'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Users } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { ActionButton } from '@/components/action-button';

interface OrgBrand {
  slug: string;
  name: string;
  brandColor: string | null;
  tagline: string | null;
  heroVariant: string;
  heroMediaUrl: string | null;
  heroMediaType: string | null;
  heroBio: string | null;
}

interface Subscribers {
  total: number;
}

export default function BrandingPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');
  const [heroVariant, setHeroVariant] = useState('default');
  const [heroMediaUrl, setHeroMediaUrl] = useState('');
  const [heroMediaType, setHeroMediaType] = useState('image');
  const [heroBio, setHeroBio] = useState('');
  const [subscribers, setSubscribers] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  useEffect(() => {
    if (!orgId) return;
    apiFetch<OrgBrand>(`/v1/organizations/${orgId}`)
      .then((o) => {
        setSlug(o.slug);
        setTagline(o.tagline ?? '');
        setHeroVariant(o.heroVariant ?? 'default');
        setHeroMediaUrl(o.heroMediaUrl ?? '');
        setHeroMediaType(o.heroMediaType ?? 'image');
        setHeroBio(o.heroBio ?? '');
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
    apiFetch<Subscribers>(`/v1/organizations/${orgId}/brand/subscribers`)
      .then((s) => setSubscribers(s.total))
      .catch(() => setSubscribers(null));
  }, [orgId]);

  async function save() {
    if (!orgId) throw new Error('No organization selected.');
    await apiFetch(`/v1/organizations/${orgId}`, {
      method: 'PATCH',
      json: {
        tagline: tagline.trim() || null,
        heroVariant,
        heroMediaUrl: heroMediaUrl.trim() || null,
        heroMediaType: heroMediaUrl.trim() ? heroMediaType : null,
        heroBio: heroBio.trim() || null,
      },
    });
  }

  const usesMedia = heroVariant === 'cinematic' || heroVariant === 'editorial';

  return (
    <div className="max-w-2xl space-y-8 text-ink-primary">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Brand Home</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Compose your brand home</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Your year-round public page at /o/{slug || 'your-brand'}.
          </p>
        </div>
        {slug ? (
          <a
            href={`/o/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface/40 px-4 py-2 text-sm font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            <ExternalLink className="h-4 w-4" /> View live
          </a>
        ) : null}
      </header>

      {subscribers !== null ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface/40 px-4 py-2 text-sm">
          <Users className="h-4 w-4 text-brand-300" />
          <span className="font-semibold">{subscribers.toLocaleString()}</span>
          <span className="text-ink-secondary">community subscribers</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-4 text-sm text-[#FF9090]">
          {error}
        </div>
      ) : null}

      {loaded ? (
        <div className="space-y-6 rounded-2xl border border-surface-border bg-surface/40 p-6">
          <Field label="Tagline" hint="One line under your name. Up to 80 characters.">
            <input
              value={tagline}
              maxLength={80}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="The world is year-round."
              className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
            />
          </Field>

          <Field label="Hero style">
            <select
              value={heroVariant}
              onChange={(e) => setHeroVariant(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary"
            >
              <option value="default">Default (gradient)</option>
              <option value="cinematic">Cinematic (full-bleed media)</option>
              <option value="editorial">Editorial (split with bio)</option>
            </select>
          </Field>

          {usesMedia ? (
            <>
              <Field
                label="Hero media URL"
                hint="Paste a hosted image or video URL. Leave blank to use the gradient."
              >
                <input
                  value={heroMediaUrl}
                  onChange={(e) => setHeroMediaUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
                />
              </Field>
              {heroMediaUrl.trim() ? (
                <Field label="Media type">
                  <select
                    value={heroMediaType}
                    onChange={(e) => setHeroMediaType(e.target.value)}
                    className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video (mp4/webm)</option>
                  </select>
                </Field>
              ) : null}
            </>
          ) : null}

          {heroVariant === 'editorial' ? (
            <Field label="Bio" hint="Shown next to your name in the editorial hero. Up to 400 characters.">
              <textarea
                value={heroBio}
                maxLength={400}
                rows={4}
                onChange={(e) => setHeroBio(e.target.value)}
                placeholder="Tell people what your brand is about."
                className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
              />
            </Field>
          ) : null}

          <ActionButton
            onAction={save}
            idleLabel="Save brand home"
            pendingLabel="Saving..."
            successLabel="Saved"
            variant="primary"
            onError={(m) => setError(m)}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
          Loading...
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-muted">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}
