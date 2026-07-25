'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Eye, Users } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { ActionButton } from '@/components/action-button';
import { ImageUpload } from '@/components/image-upload';

interface OrgBrand {
  slug: string;
  name: string;
  brandColor: string | null;
  tagline: string | null;
  heroVariant: string;
  heroMediaUrl: string | null;
  heroMediaType: string | null;
  heroBio: string | null;
  brandAccent: string | null;
  brandSurface: string | null;
  socials: Record<string, string> | null;
}

const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'x', label: 'X' },
  { key: 'whatsapp', label: 'WhatsApp channel' },
] as const;

interface Subscribers {
  total: number;
}

interface BrandAnalyticsSummary {
  brandHomeViews: number;
  cardGenerated: number;
  cardViewed: number;
  cardDownloaded: number;
  topSources: { source: string; count: number }[];
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
  const [brandAccent, setBrandAccent] = useState('');
  const [brandSurface, setBrandSurface] = useState('');
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [subscribers, setSubscribers] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<BrandAnalyticsSummary | null>(null);
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
        setBrandAccent(o.brandAccent ?? '');
        setBrandSurface(o.brandSurface ?? '');
        setSocials(o.socials ?? {});
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));
    apiFetch<Subscribers>(`/v1/organizations/${orgId}/brand/subscribers`)
      .then((s) => setSubscribers(s.total))
      .catch(() => setSubscribers(null));
    apiFetch<BrandAnalyticsSummary>(`/v1/organizations/${orgId}/brand/analytics`)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [orgId]);

  async function save() {
    if (!orgId) throw new Error('No organization selected.');
    // Normalize a pasted media URL: add https:// if the user left off the
    // scheme, so the API's URL validation does not reject an otherwise-fine
    // link with "heroMediaUrl must be a URL address".
    const media = heroMediaUrl.trim();
    const normalizedMedia = media
      ? /^https?:\/\//i.test(media)
        ? media
        : `https://${media}`
      : null;
    const hex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null);
    const cleanSocials: Record<string, string> = {};
    for (const { key } of SOCIAL_FIELDS) {
      const url = (socials[key] ?? '').trim();
      if (url) cleanSocials[key] = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }
    await apiFetch(`/v1/organizations/${orgId}`, {
      method: 'PATCH',
      json: {
        tagline: tagline.trim() || null,
        heroVariant,
        heroMediaUrl: normalizedMedia,
        heroMediaType: normalizedMedia ? heroMediaType : null,
        heroBio: heroBio.trim() || null,
        brandAccent: hex(brandAccent),
        brandSurface: hex(brandSurface),
        socials: cleanSocials,
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

      <div className="flex flex-wrap items-center gap-3">
        {subscribers !== null ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface/40 px-4 py-2 text-sm">
            <Users className="h-4 w-4 text-brand-300" />
            <span className="font-semibold">{subscribers.toLocaleString()}</span>
            <span className="text-ink-secondary">community subscribers</span>
          </div>
        ) : null}
        {analytics ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface/40 px-4 py-2 text-sm">
            <Eye className="h-4 w-4 text-brand-300" />
            <span className="font-semibold">{analytics.brandHomeViews.toLocaleString()}</span>
            <span className="text-ink-secondary">Brand Home views</span>
          </div>
        ) : null}
      </div>

      {analytics && (analytics.cardViewed > 0 || analytics.cardGenerated > 0) ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Shareable Card reach
          </h2>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Stat label="Cards shown" value={analytics.cardGenerated} />
            <Stat label="Downloads" value={analytics.cardDownloaded} />
            <Stat label="Card-driven event views" value={analytics.cardViewed} />
            <div>
              <div className="font-semibold text-ink-primary">
                {analytics.cardGenerated > 0
                  ? (analytics.cardViewed / analytics.cardGenerated).toFixed(1)
                  : '0.0'}
                x
              </div>
              <div className="text-xs text-ink-muted">reach per card</div>
            </div>
          </div>
          {analytics.topSources.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Top Brand Home sources
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {analytics.topSources.map((s) => (
                  <span
                    key={s.source}
                    className="inline-flex items-center gap-1.5 rounded-full border border-surface-border px-2.5 py-1 text-xs text-ink-secondary"
                  >
                    {s.source}
                    <span className="font-semibold text-ink-primary">{s.count.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
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
                label="Hero image"
                hint="Upload an image for the hero, or paste a hosted image/video URL below."
              >
                <ImageUpload
                  kind="banner"
                  aspect="banner"
                  value={heroMediaType === 'image' ? heroMediaUrl || null : null}
                  onChange={(url) => {
                    setHeroMediaUrl(url ?? '');
                    if (url) setHeroMediaType('image');
                  }}
                />
              </Field>
              <Field
                label="Or paste a media URL"
                hint="A full https:// link to a hosted image or video. Leave blank to use the gradient."
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

          <Field label="Accent colour" hint="Secondary / hover colour. Leave blank to auto-derive from your brand colour.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(brandAccent) ? brandAccent : '#6C5CE7'}
                onChange={(e) => setBrandAccent(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-surface-border bg-transparent"
                aria-label="Accent colour"
              />
              {brandAccent ? (
                <button type="button" onClick={() => setBrandAccent('')} className="text-xs text-ink-muted hover:text-ink-primary">
                  Reset
                </button>
              ) : (
                <span className="text-xs text-ink-muted">Auto</span>
              )}
            </div>
          </Field>

          <Field label="Surface colour" hint="Page background for your Brand Home. Leave blank for the default deep surface.">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(brandSurface) ? brandSurface : '#0B0B14'}
                onChange={(e) => setBrandSurface(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-surface-border bg-transparent"
                aria-label="Surface colour"
              />
              {brandSurface ? (
                <button type="button" onClick={() => setBrandSurface('')} className="text-xs text-ink-muted hover:text-ink-primary">
                  Reset
                </button>
              ) : (
                <span className="text-xs text-ink-muted">Default</span>
              )}
            </div>
          </Field>

          <Field label="Socials" hint="Links shown on your Brand Home header.">
            <div className="space-y-2">
              {SOCIAL_FIELDS.map(({ key, label }) => (
                <input
                  key={key}
                  value={socials[key] ?? ''}
                  onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
                  placeholder={`${label} URL`}
                  className="w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
                />
              ))}
            </div>
          </Field>

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-semibold text-ink-primary">{value.toLocaleString()}</div>
      <div className="text-xs text-ink-muted">{label}</div>
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
