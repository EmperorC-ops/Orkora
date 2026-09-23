'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  eventsApi,
  wallTimeToUtcISO,
  utcISOToWallTime,
  type EventKind,
} from '@/lib/events';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60';

const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

/**
 * Edit the core details of an event (title, description, format, dates, and
 * timezone) after it has been created. The API allows these edits at any
 * status, so a published event can be corrected without recreating it.
 */
export default function EventDetailsEditor({
  orgId,
  eventId,
  title,
  description,
  kind,
  startAt,
  endAt,
  timezone,
  disabled,
  onSaved,
  onError,
}: {
  orgId: string;
  eventId: string;
  title: string;
  description: string | null;
  kind: EventKind;
  startAt: string;
  endAt: string;
  timezone: string;
  disabled?: boolean;
  onSaved: () => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [t, setT] = useState(title);
  const [desc, setDesc] = useState(description ?? '');
  const [k, setK] = useState<EventKind>(kind);
  const [tz, setTz] = useState(timezone);
  const [start, setStart] = useState(() => utcISOToWallTime(startAt, timezone));
  const [end, setEnd] = useState(() => utcISOToWallTime(endAt, timezone));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!t.trim()) {
      setErr('Title is required.');
      return;
    }
    if (!start || !end) {
      setErr('Start and end times are required.');
      return;
    }
    const zone = tz.trim() || 'Africa/Lagos';
    const startIso = wallTimeToUtcISO(start, zone);
    const endIso = wallTimeToUtcISO(end, zone);
    if (new Date(endIso) <= new Date(startIso)) {
      setErr('The end must be after the start.');
      return;
    }
    setBusy(true);
    try {
      await eventsApi(orgId).update(eventId, {
        title: t.trim(),
        // Empty string clears the description; the API treats it as a value,
        // not "no change".
        description: desc.trim(),
        kind: k,
        startAt: startIso,
        endAt: endIso,
        timezone: zone,
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save event details.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900">Event details</h3>
      <p className="mt-1 text-sm text-slate-500">
        Title, description, format, dates and timezone. Changes to a published event go live
        immediately.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelClass}>Title</label>
          <input
            value={t}
            onChange={(e) => setT(e.target.value)}
            disabled={disabled || busy}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            disabled={disabled || busy}
            rows={4}
            placeholder="What is this event about?"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Format</label>
            <select
              value={k}
              onChange={(e) => setK(e.target.value as EventKind)}
              disabled={disabled || busy}
              className={inputClass}
            >
              <option value="physical">In person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              disabled={disabled || busy}
              placeholder="Africa/Lagos"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Starts</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={disabled || busy}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Ends</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={disabled || busy}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {err ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={disabled || busy}
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
      </div>
    </section>
  );
}
