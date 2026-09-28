'use client';

import { isFieldVisible, type RegistrationField } from '@/lib/events';

const inputClass =
  'w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

// Turn http(s) links inside a question's label or help text into real clickable
// links. Only http/https URLs are linkified (never javascript: or other schemes),
// and everything else is rendered as plain text, which React escapes, so an
// organizer cannot inject markup. A trailing bracket or punctuation is kept
// outside the link so "...link: https://x/y)" does not swallow the ")".
const URL_RE = /(https?:\/\/[^\s<]+)/g;

function linkify(text: string): React.ReactNode {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part;
    const m = /^(https?:\/\/[^\s<]*?)([).,;:!?'"]*)$/.exec(part);
    const url = m ? m[1] : part;
    const trailing = m ? m[2] : '';
    return (
      <span key={i}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-brand-300 underline underline-offset-2 hover:text-brand-200"
        >
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}

/**
 * Renders an event's custom registration questions on the public register form.
 * Answers are held in one bag (per registration) and reported up via onChange.
 * Validation mirrors the server; per-field errors are passed back in.
 */
export function RegistrationQuestions({
  fields,
  answers,
  errors,
  onChange,
  disabled,
}: {
  fields: RegistrationField[];
  answers: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (id: string, value: unknown) => void;
  disabled?: boolean;
}) {
  if (fields.length === 0) return null;
  // Conditional questions: only render fields whose showIf condition is met by
  // the current answers. Hidden fields are not shown, not validated, and not
  // submitted (the register page mirrors this).
  const visible = fields.filter((field) => isFieldVisible(field, answers));
  if (visible.length === 0) return null;
  return (
    <div className="mt-4 space-y-5">
      {visible.map((field) => (
        <QuestionField
          key={field.id}
          field={field}
          value={answers[field.id]}
          error={errors[field.id]}
          onChange={(v) => onChange(field.id, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function QuestionField({
  field,
  value,
  error,
  onChange,
  disabled,
}: {
  field: RegistrationField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const labelRow = (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
      {linkify(field.label)}
      {field.required ? <span className="ml-1 text-[#FF9090]">*</span> : null}
    </span>
  );

  const help = field.helpText ? (
    <span className="mt-1 block text-xs text-ink-muted">{linkify(field.helpText)}</span>
  ) : null;

  const errNode = error ? (
    <span className="mt-1 block text-xs text-[#FF9090]">{error}</span>
  ) : null;

  // Display-only note: label plus optional help, no input, with clickable links.
  if (field.type === 'info') {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-ink-secondary">
        <span className="block font-medium text-ink-primary">{linkify(field.label)}</span>
        {field.helpText ? (
          <span className="mt-1 block text-xs text-ink-muted">{linkify(field.helpText)}</span>
        ) : null}
      </div>
    );
  }

  // Consent checkbox: label sits beside the box.
  if (field.type === 'checkbox') {
    return (
      <label className="block">
        <span className="flex items-start gap-3 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-surface-border bg-surface-deep/60 text-brand-500 focus:ring-brand-500/30"
          />
          <span>
            {linkify(field.label)}
            {field.required ? <span className="ml-1 text-[#FF9090]">*</span> : null}
          </span>
        </span>
        {help}
        {errNode}
      </label>
    );
  }

  if (field.type === 'long_text') {
    return (
      <label className="block">
        {labelRow}
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder={field.placeholder}
          className={inputClass}
        />
        {help}
        {errNode}
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="block">
        {labelRow}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">Choose one</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {help}
        {errNode}
      </label>
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="block">
        {labelRow}
        <div className="space-y-2">
          {(field.options ?? []).map((opt) => {
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-3 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt]
                      : selected.filter((v) => v !== opt);
                    onChange(next);
                  }}
                  disabled={disabled}
                  className="h-4 w-4 rounded border-surface-border bg-surface-deep/60 text-brand-500 focus:ring-brand-500/30"
                />
                {opt}
              </label>
            );
          })}
        </div>
        {help}
        {errNode}
      </div>
    );
  }

  // short_text, number, date
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <label className="block">
      {labelRow}
      <input
        type={inputType}
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={field.placeholder}
        className={inputClass}
      />
      {help}
      {errNode}
    </label>
  );
}
