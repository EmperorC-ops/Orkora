'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Tag, Trash2 } from 'lucide-react';
import { readActiveOrgId } from '@/lib/events';
import {
  type CreateDiscountInput,
  type DiscountCode,
  type DiscountKind,
  discountsApi,
} from '@/lib/discounts';
import { ActionButton } from '@/components/action-button';

const EMPTY_FORM = {
  code: '',
  kind: 'percent' as DiscountKind,
  value: '',
  currency: 'NGN',
  maxRedemptions: '',
  startsAt: '',
  endsAt: '',
  active: true,
};

export default function EventDiscountsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const load = useCallback(
    async (org: string) => {
      try {
        const rows = await discountsApi(org).listCodes(eventId);
        setCodes(rows);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [eventId],
  );

  useEffect(() => {
    const org = readActiveOrgId();
    if (!org || !eventId) return;
    setOrgId(org);
    void load(org);
  }, [eventId, load]);

  async function handleCreate() {
    if (!orgId) throw new Error('No active organization.');
    const value = Number(form.value);
    if (!form.code.trim()) throw new Error('Enter a code.');
    if (!Number.isFinite(value) || value < 1) throw new Error('Enter a value of at least 1.');
    if (form.kind === 'percent' && value > 100) {
      throw new Error('A percentage discount cannot exceed 100.');
    }
    const input: CreateDiscountInput = {
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      value: form.kind === 'fixed' ? Math.round(value * 100) : Math.round(value),
      active: form.active,
    };
    if (form.kind === 'fixed' && form.currency.trim()) {
      input.currency = form.currency.trim().toUpperCase();
    }
    if (form.maxRedemptions.trim()) {
      input.maxRedemptions = Math.max(1, Math.round(Number(form.maxRedemptions)));
    }
    if (form.startsAt) input.startsAt = new Date(form.startsAt).toISOString();
    if (form.endsAt) input.endsAt = new Date(form.endsAt).toISOString();

    await discountsApi(orgId).createCode(eventId, input);
    setForm({ ...EMPTY_FORM });
    await load(orgId);
  }

  async function handleDelete(codeId: string) {
    if (!orgId) return;
    await discountsApi(orgId).deleteCode(eventId, codeId);
    await load(orgId);
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8 text-ink-primary">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Discounts</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Discount codes</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Create percentage or fixed-amount codes buyers can apply at checkout.
        </p>
      </header>

      {/* Create form */}
      <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
        <h3 className="text-sm font-semibold text-ink-primary">New code</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Code">
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER20"
              className={inputCls}
            />
          </FormField>
          <FormField label="Type">
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as DiscountKind }))}
              className={inputCls}
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </FormField>
          <FormField label={form.kind === 'percent' ? 'Percent (1-100)' : 'Amount (major units)'}>
            <input
              type="number"
              min={1}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.kind === 'percent' ? '20' : '5'}
              className={inputCls}
            />
          </FormField>
          {form.kind === 'fixed' && (
            <FormField label="Currency">
              <input
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
                maxLength={3}
                placeholder="NGN"
                className={inputCls}
              />
            </FormField>
          )}
          <FormField label="Max redemptions (optional)">
            <input
              type="number"
              min={1}
              value={form.maxRedemptions}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
              placeholder="Unlimited"
              className={inputCls}
            />
          </FormField>
          <FormField label="Starts (optional)">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <FormField label="Ends (optional)">
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
              className={inputCls}
            />
          </FormField>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 rounded border-surface-border bg-surface-deep/60 accent-brand-500"
            />
            Active
          </label>
          <ActionButton
            variant="primary"
            onAction={async () => {
              setFormError(null);
              await handleCreate();
            }}
            idleLabel="Create code"
            pendingLabel="Creating..."
            successLabel="Created"
            idleIcon={<Tag className="h-4 w-4" />}
            onError={setFormError}
          />
        </div>
        {formError && <p className="mt-3 text-sm text-[#FF9090]">{formError}</p>}
      </section>

      {/* Existing codes */}
      <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
        <h3 className="text-sm font-semibold text-ink-primary">Existing codes</h3>
        {codes === null ? (
          <p className="mt-4 text-sm text-ink-secondary">Loading codes...</p>
        ) : codes.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No discount codes yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 pr-4 font-medium">Code</th>
                  <th className="pb-2 pr-4 font-medium">Discount</th>
                  <th className="pb-2 pr-4 font-medium">Redemptions</th>
                  <th className="pb-2 pr-4 font-medium">Window</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-surface-border/50">
                    <td className="py-3 pr-4 font-mono font-semibold text-ink-primary">{c.code}</td>
                    <td className="py-3 pr-4 text-ink-secondary">{describeDiscount(c)}</td>
                    <td className="py-3 pr-4 text-ink-secondary">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                    </td>
                    <td className="py-3 pr-4 text-ink-secondary">{describeWindow(c)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.active
                            ? 'bg-[#34D399]/10 text-[#34D399]'
                            : 'bg-surface-border text-ink-muted'
                        }`}
                      >
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <ActionButton
                        variant="danger"
                        onAction={() => handleDelete(c.id)}
                        idleLabel="Delete"
                        pendingLabel="Deleting..."
                        successLabel="Deleted"
                        idleIcon={<Trash2 className="h-4 w-4" />}
                        onError={setFormError}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */

const inputCls =
  'w-full rounded-xl border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function describeDiscount(c: DiscountCode): string {
  if (c.kind === 'percent') return `${c.value}% off`;
  const major = (c.value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${c.currency ? `${c.currency} ` : ''}${major} off`;
}

function describeWindow(c: DiscountCode): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  if (c.startsAt && c.endsAt) return `${fmt(c.startsAt)} - ${fmt(c.endsAt)}`;
  if (c.startsAt) return `From ${fmt(c.startsAt)}`;
  if (c.endsAt) return `Until ${fmt(c.endsAt)}`;
  return 'Always';
}
