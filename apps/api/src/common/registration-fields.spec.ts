import {
  RegistrationFormSchema,
  validateResponsesAgainstFields,
  isFieldVisible,
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

  it('accepts an info note and a conditional showIf referencing an existing field', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'mentor', label: 'Join mentorship?', type: 'select', options: ['Yes', 'No'] },
      {
        id: 'link',
        label: 'Join the WhatsApp group: https://chat.whatsapp.com/abc',
        type: 'info',
        showIf: { fieldId: 'mentor', equals: 'Yes' },
      },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects a required info note', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'note', label: 'A note', type: 'info', required: true },
    ]);
    expect(parsed.success).toBe(false);
  });

  it('rejects a showIf that references an unknown field', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'link', label: 'Note', type: 'info', showIf: { fieldId: 'ghost', equals: 'Yes' } },
    ]);
    expect(parsed.success).toBe(false);
  });

  it('rejects a field conditional on itself', () => {
    const parsed = RegistrationFormSchema.safeParse([
      { id: 'x', label: 'X', type: 'short_text', showIf: { fieldId: 'x', equals: 'Yes' } },
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

  it('does not require a hidden conditional field and drops its answer', () => {
    const conditional: RegistrationField[] = [
      { id: 'mentor', label: 'Join mentorship?', type: 'select', options: ['Yes', 'No'] },
      {
        id: 'whatsapp',
        label: 'WhatsApp number',
        type: 'short_text',
        required: true,
        showIf: { fieldId: 'mentor', equals: 'Yes' },
      },
    ];
    // mentor = No -> whatsapp hidden: not required, not stored even if sent.
    const hidden = validateResponsesAgainstFields(conditional, { mentor: 'No', whatsapp: '123' });
    expect(hidden.ok).toBe(true);
    expect(hidden.cleaned.whatsapp).toBeUndefined();
    // mentor = Yes -> whatsapp shown and required.
    const shownMissing = validateResponsesAgainstFields(conditional, { mentor: 'Yes' });
    expect(shownMissing.ok).toBe(false);
    const shownOk = validateResponsesAgainstFields(conditional, {
      mentor: 'Yes',
      whatsapp: '08012345678',
    });
    expect(shownOk.ok).toBe(true);
    expect(shownOk.cleaned.whatsapp).toBe('08012345678');
  });

  it('treats info notes as answerless (never required, never stored)', () => {
    const withInfo: RegistrationField[] = [
      { id: 'note', label: 'Read this', type: 'info' },
    ];
    const r = validateResponsesAgainstFields(withInfo, { note: 'anything' });
    expect(r.ok).toBe(true);
    expect(r.cleaned.note).toBeUndefined();
  });

  it('isFieldVisible handles select, checkbox and multiselect controllers', () => {
    const f = (showIf: { fieldId: string; equals: string }): RegistrationField => ({
      id: 'x',
      label: 'x',
      type: 'info',
      showIf,
    });
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'Yes' }), { q: 'Yes' })).toBe(true);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'Yes' }), { q: 'No' })).toBe(false);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'Yes' }), { q: true })).toBe(true);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'Yes' }), { q: false })).toBe(false);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'a' }), { q: ['a', 'b'] })).toBe(true);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'c' }), { q: ['a', 'b'] })).toBe(false);
    expect(isFieldVisible(f({ fieldId: 'q', equals: 'Yes' }), {})).toBe(false);
  });

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
