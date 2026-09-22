import {
  RegistrationFormSchema,
  validateResponsesAgainstFields,
  type RegistrationField,
} from './registration-fields';

describe('RegistrationFormSchema', () => {
  it('accepts a valid field set', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'company', label: 'Company', type: 'short_text', required: true },
      { id: 'diet', label: 'Dietary needs', type: 'select', options: ['None', 'Vegan'] },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects a select with no options', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'diet', label: 'Diet', type: 'select' },
    ]);
    expect(parsed.success).toBe(false);
  });

  it('rejects options on a non-option field', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'name', label: 'Name', type: 'short_text', options: ['x'] },
    ]);
    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate field ids', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'a', label: 'A', type: 'short_text' },
      { id: 'a', label: 'A2', type: 'short_text' },
    ]);
    expect(parsed.success).toBe(false);
  });

  it('rejects an id that is not a slug', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'Company Name', label: 'Company', type: 'short_text' },
    ]);
    expect(parsed.success).toBe(false);
  });
});

describe('validateResponsesAgainstFields', () => {
  const fields: RegistrationField[] = [
    { id: 'company', label: 'Company', type: 'short_text', required: true },
    { id: 'role', label: 'Role', type: 'select', required: false, options: ['Dev', 'PM'] },
    { id: 'tags', label: 'Interests', type: 'multiselect', required: false, options: ['a', 'b'] },
    { id: 'headcount', label: 'Headcount', type: 'number', required: false },
    { id: 'agree', label: 'Agree to terms', type: 'checkbox', required: true },
  ];

  it('passes with valid answers and returns a cleaned map', () => {
    const r = validateResponsesAgainstFields(fields, {
      company: '  Acme  ',
      role: 'Dev',
      tags: ['a'],
      headcount: 12,
      agree: true,
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.cleaned).toEqual({
      company: 'Acme',
      role: 'Dev',
      tags: ['a'],
      headcount: 12,
      agree: true,
    });
  });

  it('flags a missing required field', () => {
    const r = validateResponsesAgainstFields(fields, { agree: true });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('company');
  });

  it('requires a required checkbox to be true', () => {
    const r = validateResponsesAgainstFields(fields, { company: 'Acme', agree: false });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('agree');
  });

  it('rejects a select value outside the options', () => {
    const r = validateResponsesAgainstFields(fields, {
      company: 'Acme',
      agree: true,
      role: 'Designer',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('role');
  });

  it('rejects a multiselect value outside the options', () => {
    const r = validateResponsesAgainstFields(fields, {
      company: 'Acme',
      agree: true,
      tags: ['a', 'z'],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('tags');
  });

  it('rejects a non-numeric number answer', () => {
    const r = validateResponsesAgainstFields(fields, {
      company: 'Acme',
      agree: true,
      headcount: 'lots',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.field)).toContain('headcount');
  });

  it('drops unknown keys rather than storing them', () => {
    const r = validateResponsesAgainstFields(fields, {
      company: 'Acme',
      agree: true,
      sneaky: 'value',
    });
    expect(r.ok).toBe(true);
    expect(r.cleaned).not.toHaveProperty('sneaky');
  });

  it('treats no fields as no requirements', () => {
    const r = validateResponsesAgainstFields([], { anything: 'goes' });
    expect(r.ok).toBe(true);
    expect(r.cleaned).toEqual({});
  });
});
