'use client';

import type { RegistrationField } from '@/lib/events';

const inputClass =
  'w-full rounded-xl border border-surface-border bg-surface-deep/60 px-4 py-3 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

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
  return (
    <div className="mt-4 space-y-5">
      {fields.map((field) => (
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
      {field.label}
      {field.required ? <span className="ml-1 text-[#FF9090]">*</span> : null}
    </span>
  );

  const help = field.helpText ? (
    <span className="mt-1 block text-xs text-ink-muted">{field.helpText}</span>
  ) : null;

  const errNode = error ? (
    <span className="mt-1 block text-xs text-[#FF9090]">{error}</span>
  ) : null;

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
            {field.label}
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
