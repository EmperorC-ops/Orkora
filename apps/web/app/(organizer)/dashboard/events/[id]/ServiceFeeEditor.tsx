'use client';

import { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { eventsApi } from '@/lib/events';

/**
 * Who bears the Orkora platform fee for this event: the organizer absorbs it
 * (comes out of their proceeds) or passes it on to attendees (added to what they
 * pay at checkout). Saved per event. The fee is not charged until Orkora's fee
 * goes live, so this is a choice the organizer sets ahead of time.
 */
export default function ServiceFeeEditor({
  orgId,
  eventId,
  initialPassOn,
  disabled,
  onSaved,
  onError,
}: {
  orgId: string;
  eventId: string;
  initialPassOn: boolean;
  disabled?: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [passOn, setPassOn] = useState(initialPassOn);
  const [saving, setSaving] = useState(false);
  const dirty = passOn !== initialPassOn;

  async function save() {
    setSaving(true);
    try {
      await eventsApi(orgId).update(eventId, { platformFeePassOn: passOn });
      onSaved('Fee handling saved');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save fee handling.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-brand-700" />
        <h3 className="font-semibold text-slate-900">Service fee</h3>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Orkora&apos;s fee on paid tickets is 3% plus USD 0.99 per ticket. Choose who covers it. This
        applies once Orkora&apos;s fee is live; it changes nothing today.
      </p>

      <div className="mt-4 space-y-3">
        <FeeOption
          selected={!passOn}
          disabled={disabled || saving}
          onSelect={() => setPassOn(false)}
          title="I will absorb the fee"
          body="The fee comes out of your proceeds. Attendees pay only the ticket price."
        />
        <FeeOption
          selected={passOn}
          disabled={disabled || saving}
          onSelect={() => setPassOn(true)}
          title="Pass the fee on to attendees"
          body="The fee is added on top of the ticket price, so attendees pay more at checkout. You receive the full ticket price."
        />
      </div>

      {!disabled && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      )}
    </section>
  );
}

function FeeOption({
  selected,
  disabled,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-brand-500 bg-brand-50'
          : 'border-slate-200 bg-white hover:border-brand-200'
      } disabled:opacity-60`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
            selected ? 'border-brand-600' : 'border-slate-300'
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-brand-600" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{body}</p>
        </div>
      </div>
    </button>
  );
}
