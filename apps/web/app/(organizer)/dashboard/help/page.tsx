'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { HelpMarkdown } from '@/lib/help-markdown';

interface HelpSection {
  id: string;
  title: string;
  minRole: 'staff' | 'organizer' | 'admin';
  body: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  organizer: 'Organizer',
  staff: 'Staff',
};

/**
 * Organizer help, filtered by the viewer's role. The sections come from the
 * API, which only returns what this role may read, so nothing beyond the
 * viewer's access is ever sent to the browser.
 */
export default function DashboardHelpPage() {
  const [sections, setSections] = useState<HelpSection[] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = readActiveOrgId();
    if (!orgId) {
      setError('Join or create an organization to see the organizer guide.');
      return;
    }
    apiFetch<{ role: string | null; sections: HelpSection[] }>(`/v1/organizations/${orgId}/help`)
      .then((res) => {
        setRole(res.role);
        setSections(res.sections);
      })
      .catch(() => setError('Could not load help right now. Please reload the page.'));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Help</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Guidance for your role
          {role && ROLE_LABEL[role] ? (
            <>
              {' '}
              (<span className="font-semibold text-ink-primary">{ROLE_LABEL[role]}</span>)
            </>
          ) : null}
          . Attendee and general questions are on the{' '}
          <a href="/help" className="font-semibold text-brand-300 underline hover:text-brand-200">
            public help page
          </a>
          .
        </p>
      </header>

      {error ? <p className="text-sm text-[#FF9090]">{error}</p> : null}
      {!sections && !error ? <p className="text-sm text-ink-secondary">Loading help...</p> : null}

      {sections && sections.length > 0 ? (
        <>
          <nav aria-label="Help topics" className="rounded-2xl border border-surface-border bg-surface/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Topics</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-brand-300 hover:text-brand-200">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 rounded-2xl border border-surface-border bg-surface/40 p-6"
            >
              <h2 className="text-lg font-semibold text-ink-primary">{s.title}</h2>
              <div className="mt-3">
                <HelpMarkdown source={s.body} />
              </div>
            </section>
          ))}
        </>
      ) : null}

      {sections && sections.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          There is no organizer guidance for your role yet. See the{' '}
          <a href="/help" className="font-semibold text-brand-300 underline">public help page</a>.
        </p>
      ) : null}

      <section className="rounded-2xl border border-surface-border bg-surface/40 p-6 text-sm text-ink-secondary">
        <h2 className="text-lg font-semibold text-ink-primary">Still stuck?</h2>
        <p className="mt-2">
          Email hello@orkora.events with your organization name, the event link and a screenshot.
          Problems caused by Orkora itself, account access and payment problems are always handled
          free. Hands-on help beyond these guides is a paid service; details will be published.
        </p>
      </section>
    </div>
  );
}
