'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  eventsApi,
  readActiveOrgId,
  wallTimeToUtcISO,
  EVENT_CATEGORIES,
  type EventKind,
} from '@/lib/events';
import { ImageUpload } from '@/components/image-upload';

export default function NewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('No active organization on this account.');
      setLoading(false);
      return;
    }
    const f = new FormData(e.currentTarget);
    const timezone = String(f.get('timezone') ?? 'Africa/Lagos') || 'Africa/Lagos';
    const kind = (f.get('kind') as EventKind) || 'physical';
    const venueName = String(f.get('venueName') ?? '').trim();
    const venueAddress = String(f.get('venueAddress') ?? '').trim();
    const joinRaw = String(f.get('joinUrl') ?? '').trim();
    const wantsJoin = kind !== 'physical' && !!joinRaw;
    if (wantsJoin && !/^https?:\/\/\S+$/i.test(joinRaw)) {
      setError('The join link must be a full URL starting with https://.');
      setLoading(false);
      return;
    }
    const body = {
      title: String(f.get('title') ?? ''),
      description: (String(f.get('description') ?? '') || undefined) as string | undefined,
      kind,
      // Interpret the typed wall-clock times in the event's timezone, not the
      // organiser's browser zone, so the stored instant is correct regardless
      // of where the event is being created from.
      startAt: wallTimeToUtcISO(String(f.get('startAt') ?? ''), timezone),
      endAt: wallTimeToUtcISO(String(f.get('endAt') ?? ''), timezone),
      timezone,
      capacity: f.get('capacity') ? Number(f.get('capacity')) : undefined,
      bannerUrl: bannerUrl ?? undefined,
      category: (String(f.get('category') ?? '') || undefined) as string | undefined,
      city: (String(f.get('city') ?? '').trim() || undefined) as string | undefined,
      venueName: venueName || undefined,
      venueAddress: venueAddress || undefined,
      joinUrl: wantsJoin ? joinRaw : undefined,
      locationOnTicketOnly: f.get('locationOnTicketOnly') === 'on',
    };
    try {
      const created = await eventsApi(orgId).create(body);
      router.push(`/dashboard/events/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-secondary hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to events
      </Link>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink-primary">Create a new event</h2>
        <p className="text-sm text-ink-secondary">
          Save as a draft now, fine-tune details later, and publish when you are ready.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <Field label="Event title" name="title" required placeholder="Tech Summit Lagos 2026" />
        <Field
          label="Short description"
          name="description"
          textarea
          placeholder="One-paragraph elevator pitch shown on the event page."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Format</label>
            <select
              name="kind"
              defaultValue="physical"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            >
              <option value="physical">In person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <Field label="Capacity (optional)" name="capacity" type="number" min={1} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts" name="startAt" type="datetime-local" required />
          <Field label="Ends" name="endAt" type="datetime-local" required />
        </div>

        <Field
          label="Timezone"
          name="timezone"
          defaultValue="Africa/Lagos"
          placeholder="Africa/Lagos"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Category (optional)
            </label>
            <select
              name="category"
              defaultValue=""
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            >
              <option value="">No category</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Helps people find your event through search.
            </p>
          </div>
          <Field label="City (optional)" name="city" placeholder="Lagos" />
        </div>

        <fieldset className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Location</legend>
          <p className="text-xs text-slate-500">
            Where the event happens. You can keep the exact venue private until someone registers.
          </p>
          <div className="mt-3 space-y-4">
            <Field label="Venue name" name="venueName" placeholder="e.g. The Landmark Centre" maxLength={120} />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Full address / directions
              </label>
              <textarea
                name="venueAddress"
                rows={3}
                maxLength={400}
                placeholder="Street address, floor, landmark, parking notes..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <Field label="Online join link (for virtual or hybrid)" name="joinUrl" placeholder="https://..." inputMode="url" />
              <p className="mt-1 text-xs text-slate-500">
                Shown only on the attendee&apos;s ticket and email, never on the public page.
              </p>
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="locationOnTicketOnly"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">
                <span className="font-medium">Reveal the venue only on the ticket</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  When on, the public event page shows only the city. The venue name, full address
                  and join link appear on the attendee&apos;s ticket and ticket email after they
                  register.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <ImageUpload
          kind="banner"
          value={bannerUrl}
          onChange={setBannerUrl}
          label="Banner image"
        />

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/dashboard/events"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Create event
          </button>
        </div>
      </form>
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  textarea?: boolean;
}

function Field({ label, name, textarea, ...rest }: FieldProps) {
  const cls =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {textarea ? (
        <textarea name={name} rows={3} className={cls} placeholder={rest.placeholder} />
      ) : (
        <input name={name} className={cls} {...rest} />
      )}
    </div>
  );
}
