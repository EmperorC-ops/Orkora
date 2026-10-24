'use client';

import { useEffect, useState } from 'react';
import {
  adminApi,
  type OrgDeletionPreview,
  type UserDeletionPreview,
} from '@/lib/admin';

/**
 * Platform-console deletion dialog for a user or an organization.
 *
 * Flow: load the server's preview (what will be removed and anything blocking
 * it), let the admin pick the action, and require the exact email or name to
 * be typed before the button unlocks. The server re-checks every rule inside
 * the delete itself; this dialog is the human checkpoint, not the safeguard.
 */

type Target =
  | { kind: 'user'; id: string; label: string }
  | { kind: 'org'; id: string; label: string };

type Action = 'delete' | 'erase';

export function DeletionDialog({
  target,
  onClose,
  onDone,
}: {
  target: Target;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [userPreview, setUserPreview] = useState<UserDeletionPreview | null>(null);
  const [orgPreview, setOrgPreview] = useState<OrgDeletionPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>('delete');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (target.kind === 'user') {
          const p = await adminApi.userDeletionPreview(target.id);
          if (cancelled) return;
          setUserPreview(p);
          // Default to the action that is actually possible.
          if (p.deleteBlockers.length > 0 && p.eraseBlockers.length === 0) setAction('erase');
        } else {
          const p = await adminApi.orgDeletionPreview(target.id);
          if (!cancelled) setOrgPreview(p);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load the preview.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, working]);

  const expected =
    target.kind === 'user' ? (userPreview?.user.email ?? '') : (orgPreview?.organization.name ?? '');
  const matches =
    target.kind === 'user'
      ? confirm.trim().toLowerCase() === expected.toLowerCase() && expected !== ''
      : confirm.trim() === expected.trim() && expected !== '';

  const blockers =
    target.kind === 'user'
      ? action === 'delete'
        ? (userPreview?.deleteBlockers ?? [])
        : (userPreview?.eraseBlockers ?? [])
      : (orgPreview?.deleteBlockers ?? []);
  const loaded = target.kind === 'user' ? !!userPreview : !!orgPreview;
  const canRun = loaded && blockers.length === 0 && matches && !working;

  async function run() {
    if (!canRun) return;
    setWorking(true);
    setError(null);
    try {
      if (target.kind === 'org') {
        await adminApi.deleteOrg(target.id, confirm.trim());
        onDone(`Deleted organization ${expected}.`);
      } else if (action === 'delete') {
        await adminApi.deleteUser(target.id, confirm.trim());
        onDone(`Deleted ${expected}.`);
      } else {
        await adminApi.eraseUser(target.id, confirm.trim());
        onDone(`Erased the details of ${expected}. Their records were kept.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed. Nothing was changed.');
      setWorking(false);
    }
  }

  const title =
    target.kind === 'org'
      ? 'Delete organization'
      : action === 'delete'
        ? 'Delete user'
        : 'Erase user details';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-border bg-surface-deep p-6 shadow-2xl">
        <h3 id="deletion-title" className="text-lg font-semibold text-ink-primary">
          {title}
        </h3>
        <p className="mt-1 text-sm text-ink-secondary">{target.label}</p>

        {loadError ? <p className="mt-4 text-sm text-[#FF9090]">{loadError}</p> : null}
        {!loaded && !loadError ? (
          <p className="mt-4 text-sm text-ink-secondary">Checking what this would affect...</p>
        ) : null}

        {target.kind === 'user' && userPreview ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['delete', 'erase'] as Action[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm ${
                    action === a
                      ? 'border-brand-500 bg-brand-500/10 text-ink-primary'
                      : 'border-surface-border text-ink-secondary hover:bg-surface/60'
                  }`}
                >
                  <span className="block font-semibold">
                    {a === 'delete' ? 'Delete account' : 'Erase details'}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {a === 'delete'
                      ? 'Removes the account and its activity.'
                      : 'Keeps records, removes who they are.'}
                  </span>
                </button>
              ))}
            </div>

            {action === 'delete' ? (
              <ul className="mt-4 space-y-1 text-sm text-ink-secondary">
                <li>{userPreview.willRemove.registrations} registration(s)</li>
                <li>{userPreview.willRemove.ticketsReleased} ticket(s), seats released back to sale</li>
                <li>{userPreview.willRemove.unpaidOrders} unpaid order(s)</li>
                <li>
                  {userPreview.willRemove.messages} chat or Q&amp;A message(s),{' '}
                  {userPreview.willRemove.pollVotes} poll vote(s)
                </li>
                <li>
                  Team access:{' '}
                  {userPreview.willRemove.memberships.length > 0
                    ? userPreview.willRemove.memberships.join(', ')
                    : 'none'}
                </li>
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-secondary">
                Name, email, phone and photo are replaced with &quot;Deleted user&quot;, their answers on
                registration forms are cleared, team access is removed and they are signed out
                everywhere. Orders, payments and attendance are kept
                {userPreview.keptRecords.paidOrders > 0
                  ? ` (${userPreview.keptRecords.paidOrders} paid order(s))`
                  : ''}
                . This cannot be undone.
              </p>
            )}
          </>
        ) : null}

        {target.kind === 'org' && orgPreview ? (
          <ul className="mt-4 space-y-1 text-sm text-ink-secondary">
            <li>
              {orgPreview.willRemove.events.length} event(s)
              {orgPreview.willRemove.events.length > 0
                ? `: ${orgPreview.willRemove.events.slice(0, 5).join(', ')}${
                    orgPreview.willRemove.events.length > 5 ? ', ...' : ''
                  }`
                : ''}
            </li>
            <li>
              {orgPreview.willRemove.registrations} registration(s), {orgPreview.willRemove.tickets}{' '}
              ticket(s)
            </li>
            <li>{orgPreview.willRemove.campaigns} campaign(s)</li>
            <li>
              {orgPreview.willRemove.members} team member(s) lose access. Their user accounts stay.
            </li>
          </ul>
        ) : null}

        {loaded && blockers.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">
            <p className="font-semibold">This cannot be done yet:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {loaded && blockers.length === 0 ? (
          <label className="mt-5 block text-sm text-ink-secondary">
            Type{' '}
            <span className="font-mono font-semibold text-ink-primary">{expected}</span> to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 w-full rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary focus:border-[#FF7675] focus:outline-none"
            />
          </label>
        ) : null}

        {error ? <p className="mt-3 text-sm text-[#FF9090]">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="rounded-full border border-surface-border px-4 py-2 text-sm text-ink-primary hover:bg-surface/60 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            className="rounded-full bg-[#E5484D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d13f44] disabled:opacity-40"
          >
            {working ? 'Working...' : title}
          </button>
        </div>
      </div>
    </div>
  );
}
