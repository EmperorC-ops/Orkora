import { z } from 'zod';

/**
 * Server-side validation for custom registration questions.
 *
 * The web composer owns the rich UX (packages/contracts). Here the API enforces
 * the two boundaries that matter server-side: the shape of the question
 * definitions an organizer may store on an event, and whether a submitted
 * answer bag is valid against those definitions. Kept independent of the client
 * contracts on purpose, mirroring story.schema.ts.
 */

export const REGISTRATION_FIELD_TYPES = [
  'short_text',
  'long_text',
  'select',
  'multiselect',
  'number',
  'date',
  'checkbox',
] as const;
export type RegistrationFieldType = (typeof REGISTRATION_FIELD_TYPES)[number];

const fieldId = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/, 'id must be a lowercase slug');

export const RegistrationFieldSchema = z
  .object({
    id: fieldId,
    label: z.string().min(1).max(120),
    type: z.enum(REGISTRATION_FIELD_TYPES),
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
export type RegistrationField = z.infer<typeof RegistrationFieldSchema>;

export const RegistrationFormSchema = z
  .array(RegistrationFieldSchema)
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
export type RegistrationForm = z.infer<typeof RegistrationFormSchema>;

// ===== Answer validation =====

export type ResponseValue = string | number | boolean | string[];

export interface ResponseError {
  field: string;
  message: string;
}

export interface ResponseValidation {
  ok: boolean;
  errors: ResponseError[];
  // Only recognised fields survive, so unknown keys a client tries to smuggle
  // in are dropped rather than stored.
  cleaned: Record<string, ResponseValue>;
}

const DEFAULT_TEXT_MAX: Record<'short_text' | 'long_text', number> = {
  short_text: 200,
  long_text: 2000,
};

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
