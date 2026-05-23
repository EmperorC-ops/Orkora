'use client';

import { useEffect, useState } from 'react';
import { adminApi, type PlatformOverview } from '@/lib/admin';

export default function AdminOverviewPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .overview()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load overview.'));
  }, []);

  if (error) return <p className="text-sm text-[#FF9090]">{error}</p>;
  if (!data) return <p className="text-sm text-ink-secondary">Loading...</p>;

  const cards = [
    {
      label: 'Organizations',
      value: data.organizations.total,
      hint: `${data.organizations.active} active · ${data.organizations.suspended} suspended`,
    },
    {
      label: 'Users',
      value: data.users.total,
      hint: `${data.users.superAdmins} super admin${data.users.superAdmins === 1 ? '' : 's'}`,
    },
    { label: 'Events', value: data.events.total, hint: `${data.events.published} published` },
    {
      label: 'Registrations',
      value: data.registrations,
      hint: `${data.ticketsIssued.toLocaleString()} tickets issued`,
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-ink-primary">Platform overview</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-surface-border bg-surface/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-ink-primary">{c.value.toLocaleString()}</p>
            <p className="mt-1 text-xs text-ink-secondary">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Paid revenue</p>
        {Object.keys(data.revenueByCurrency).length === 0 ? (
          <p className="mt-2 text-sm text-ink-secondary">No paid orders yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {Object.entries(data.revenueByCurrency).map(([cur, minor]) => (
              <li key={cur} className="text-sm text-ink-primary">
                <span className="font-mono">{cur}</span> {(minor / 100).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">{data.paidOrders.toLocaleString()} paid orders</p>
      </div>
    </div>
  );
}
