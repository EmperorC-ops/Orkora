'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { eventsApi, type RegistrationField, type RegistrationFieldType } from '@/lib/events';

const TYPE_LABELS: Record<RegistrationFieldType, string> = {
  short_text: 'Short text',
  long_text: 'Paragraph',
  select: 'Dropdown (pick one)',
  multiselect: 'Checkboxes (pick many)',
  number: 'Number',
  date: 'Date',
  checkbox: 'Consent checkbox',
};

const TYPE_ORDER: RegistrationFieldType[] = [
  'short_text',
  'long_text',
  'select',
  'multiselect',
  'number',
  'date',
  'checkbox',
];

function needsOptions(t: RegistrationFieldType): boolean {
  return t === 'select' || t === 'multiselect';
}

// Local editing shape: options are held as a single textarea string (one per
// line) and split on save, which is friendlier than a list of inputs.
interface Draft {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  optionsText: string;
  helpText: string;
  placeholder: string;
}

function toDraft(f: RegistrationField): Draft {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    required: !!f.required,
    optionsText: (f.options ?? []).join('\n'),
    helpText: f.helpText ?? '',
    placeholder: f.placeholder ?? '',
  };
}

// A stable, internal key answers are stored under. Kept as q1, q2, ... so the
// organizer never has to think about it, and never reused within one form.
function nextId(existing: Draft[]): string {
  const ids = new Set(existing.map((d) => d.id));
  let n = 1;
  while (ids.has(`q${n}`)) n += 1;
  return `q${n}`;
}

export default function RegistrationFieldsEditor({
  orgId,
  eventId,
  initialFields,
  initialIntroHidden,
  disabled,
  onSaved,
  onError,
}: {
  orgId: string;
  eventId: string;
  initialFields: RegistrationField[];
  initialIntroHidden?: boolean;
  disabled?: boolean;
  onSaved: () => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => initialFields.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [introHidden, setIntroHidden] = useState(!!initialIntroHidden);

  function patch(i: number, next: Partial<Draft>) {
    setDrafts((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...next } : d)));
  }

  function addField() {
    setDrafts((ds) => [
      ...ds,
      {
        id: nextId(ds),
        label: '',
        type: 'short_text',
        required: false,
        optionsText: '',
        helpText: '',
        placeholder: '',
      },
    ]);
  }

  function remove(i: number) {
    setDrafts((ds) => ds.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setDrafts((ds) => {
      const j = i + dir;
      if (j < 0 || j >= ds.length) return ds;
      const copy = [...ds];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function build(): { fields: RegistrationField[]; errors: string[] } {
    const errors: string[] = [];
    const fields: RegistrationField[] = drafts.map((d) => {
      const options = needsOptions(d.type)
        ? d.optionsText
            .split('\n')
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
      if (!d.label.trim()) errors.push('Every question needs a label.');
      if (needsOptions(d.type) && (!options || options.length === 0)) {
        errors.push(`"${d.label.trim() || d.id}" needs at least one option.`);
      }
      return {
        id: d.id,
        label: d.label.trim(),
        type: d.type,
        required: d.required,
        ...(options ? { options } : {}),
        ...(d.placeholder.trim() ? { placeholder: d.placeholder.trim() } : {}),
        ...(d.helpText.trim() ? { helpText: d.helpText.trim() } : {}),
      };
    });
    if (drafts.length > 30) errors.push('At most 30 questions.');
    return { fields, errors };
  }

  async function save() {
    const { fields, errors } = build();
    if (errors.length) {
      setProblems([...new Set(errors)]);
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      await eventsApi(orgId).update(eventId, {
        registrationFields: fields,
        registrationIntroHidden: introHidden,
      });
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the registration form.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-slate-900">Registration form</h3>
      <p className="mt-1 text-sm text-slate-500">
        Extra questions asked at registration. Leave it empty to just collect name, email and
        phone.
      </p>

      {drafts.length > 0 && (
        <ul className="mt-4 space-y-4">
          {drafts.map((d, i) => (
            <li key={d.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Question
                      </label>
                      <input
                        value={d.label}
                        onChange={(e) => patch(i, { label: e.target.value })}
                        disabled={disabled || busy}
                        placeholder="e.g. Company name"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                      <select
                        value={d.type}
                        onChange={(e) =>
                          patch(i, { type: e.target.value as RegistrationFieldType })
                        }
                        disabled={disabled || busy}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                      >
                        {TYPE_ORDER.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {needsOptions(d.type) && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Options (one per line)
                      </label>
                      <textarea
                        value={d.optionsText}
                        onChange={(e) => patch(i, { optionsText: e.target.value })}
                        disabled={disabled || busy}
                        rows={3}
                        placeholder={'None\nVegetarian\nVegan'}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Helper text (optional)
                    </label>
                    <input
                      value={d.helpText}
                      onChange={(e) => patch(i, { helpText: e.target.value })}
                      disabled={disabled || busy}
                      placeholder="A short line explaining why you ask"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={d.required}
                      onChange={(e) => patch(i, { required: e.target.checked })}
                      disabled={disabled || busy}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                    />
                    Required
                  </label>
                </div>

                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={disabled || busy || i === 0}
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={disabled || busy || i === drafts.length - 1}
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={disabled || busy}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={introHidden}
          onChange={(e) => setIntroHidden(e.target.checked)}
          disabled={disabled || busy}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
        />
        Hide the intro heading above the questions on the register page
      </label>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={addField}
          disabled={disabled || busy || drafts.length >= 30}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add question
        </button>
        <button
          type="button"
          onClick={save}
          disabled={disabled || busy}
          className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save form
        </button>
      </div>
    </section>
  );
}
