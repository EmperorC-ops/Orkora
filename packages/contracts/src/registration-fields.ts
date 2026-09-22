import { z } from 'zod';

/**
 * Custom registration questions.
 *
 * An event can define extra questions asked at registration
 * (`events.registration_fields`). Answers are stored per registration in
 * `registrations.form_responses`, keyed by field id. Both the API (validating a
 * submission) and the clients (rendering the form, pre-validating) import these
 * shapes and the validator so the rules stay in one place.
 *
 * v1 scope: per-event fields, one answer bag per registration. No per-attendee
 * answers and no org-level template yet. See REGISTRATION_QUESTIONS.md.
 */

export const RegistrationFieldType = z.enum([
  'short_text',
  'long_text',
  'select',
  'multiselect',
  'number',
  'date',
  'checkbox',
]);
export type RegistrationFieldType = z.infer<typeof RegistrationFieldType>;

// A stable, url-safe key. This is what answers are stored under, so it must not
// change once registrations exist against it.
const fieldId = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/, 'id must be a lowercase slug');

export const RegistrationField = z
  .object({
    id: fieldId,
    label: z.string().min(1).max(120),
    type: RegistrationFieldType,
    required: z.boolean().default(false),
    options: z.array(z.string().min(1).max(120)).max(50).optional(),
    placeholder: z.string().max(120).optional(),
    helpText: z.string().max(240).optional(),
    maxLength: z.number().int().positive().max(5000).optional(),
  })
  .superRefine((f, ctx) => {
    const needsOptions = f.type === 'select' || f.type === 'multiselect';
    if (needsOptions && (!f.options || f.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${f.id}" is a ${f.type} and needs at least one option`,
        path: ['options'],
      });
    }
    if (!needsOptions && f.options && f.options.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'options are only valid for select and multiselect fields',
        path: ['options'],
      });
    }
  });
export type RegistrationField = z.infer<typeof RegistrationField>;

export const RegistrationForm = z
  .array(RegistrationField)
  .max(30)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate field id "${f.id}"`,
          path: [],
        });
      }
      seen.add(f.id);
    }
  });
export type RegistrationForm = z.infer<typeof RegistrationForm>;

// ===== Answer validation =====

export type ResponseValue = string | number | boolean | string[];

export interface ResponseError {
  field: string;
  message: string;
}

export interface ResponseValidation {
  ok: boolean;
  errors: ResponseError[];
  // Only known fields end up here, so unknown keys a client tries to smuggle in
  // are dropped rather than stored.
  cleaned: Record<string, ResponseValue>;
}

const DEFAULT_TEXT_MAX = { short_text: 200, long_text: 2000 } as const;

/**
 * Validate a submitted answer bag against an event's field definitions.
 * Enforces required, allowed options, and per-type shape; returns a cleaned map
 * containing only recognised fields.
 */
export function validateResponsesAgainstFields(
  fields: RegistrationField[],
  responses: Record<string, unknown> | null | undefined,
): ResponseValidation {
  const res = responses ?? {};
  const errors: ResponseError[] = [];
  const cleaned: Record<string, ResponseValue> = {};

  for (const field of fields) {
    const raw = res[field.id];
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '') ||
      (Array.isArray(raw) && raw.length === 0);

    if (empty) {
      if (field.required) {
        errors.push({
          field: field.id,
          message:
            field.type === 'checkbox'
              ? `${field.label} must be accepted`
              : `${field.label} is required`,
        });
      }
      continue;
    }

    switch (field.type) {
      case 'short_text':
      case 'long_text': {
        if (typeof raw !== 'string') {
          errors.push({ field: field.id, message: `${field.label} must be text` });
          break;
        }
        const max = field.maxLength ?? DEFAULT_TEXT_MAX[field.type];
        if (raw.length > max) {
          errors.push({ field: field.id, message: `${field.label} is too long` });
          break;
        }
        cleaned[field.id] = raw.trim();
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
          errors.push({ field: field.id, message: `${field.label} must be a number` });
          break;
        }
        cleaned[field.id] = n;
        break;
      }
      case 'date': {
        if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
          errors.push({ field: field.id, message: `${field.label} must be a valid date` });
          break;
        }
        cleaned[field.id] = raw;
        break;
      }
      case 'checkbox': {
        if (typeof raw !== 'boolean') {
          errors.push({ field: field.id, message: `${field.label} must be yes or no` });
          break;
        }
        if (field.required && raw !== true) {
          errors.push({ field: field.id, message: `${field.label} must be accepted` });
          break;
        }
        cleaned[field.id] = raw;
        break;
      }
      case 'select': {
        if (typeof raw !== 'string' || !(field.options ?? []).includes(raw)) {
          errors.push({ field: field.id, message: `${field.label} has an invalid choice` });
          break;
        }
        cleaned[field.id] = raw;
        break;
      }
      case 'multiselect': {
        const opts = field.options ?? [];
        if (
          !Array.isArray(raw) ||
          raw.some((v) => typeof v !== 'string' || !opts.includes(v))
        ) {
          errors.push({ field: field.id, message: `${field.label} has an invalid choice` });
          break;
        }
        cleaned[field.id] = raw as string[];
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors, cleaned };
}
