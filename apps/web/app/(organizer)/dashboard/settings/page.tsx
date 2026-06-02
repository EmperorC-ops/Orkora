'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  Copy,
  Key,
  Mail,
  Palette,
  Plus,
  Shield,
  Trash2,
  UserCog,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { useToast } from '@/components/toast';

type TabKey = 'profile' | 'branding' | 'members' | 'api-keys' | 'payments';

interface Organization {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  plan: string;
  countryCode: string;
}

interface OrgMember {
  id: string;
  role: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    createdAt: string;
    lastLoginAt: string | null;
  };
}

interface OrgInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

interface ApiKeyRow {
  id: string;
  name: string;
  lastFour: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: { id: string; fullName: string; email: string };
}

interface NewApiKey {
  id: string;
  name: string;
  lastFour: string;
  scopes: string[];
  createdAt: string;
  token: string;
}

interface PaymentPrefs {
  enabledProviders: string[];
  preferences: Array<{ currency: string; provider: string; updatedAt: string }>;
}

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Building2 }> = [
  { key: 'profile', label: 'Organization', Icon: Building2 },
  { key: 'branding', label: 'Branding', Icon: Palette },
  { key: 'members', label: 'Members', Icon: UserCog },
  { key: 'api-keys', label: 'API keys', Icon: Key },
  { key: 'payments', label: 'Payments', Icon: Wallet },
];

export default function SettingsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('profile');

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Settings</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Organization</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Profile, branding, members, API keys, and payment provider preferences.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-full border border-surface-border bg-surface/40 p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === key
                ? 'bg-brand-500 text-white shadow'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </nav>

      {!orgId ? (
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-12 text-center text-sm text-ink-muted">
          Loading organization context...
        </div>
      ) : (
        <>
          {tab === 'profile' && <ProfileTab orgId={orgId} />}
          {tab === 'branding' && <BrandingTab orgId={orgId} />}
          {tab === 'members' && <MembersTab orgId={orgId} />}
          {tab === 'api-keys' && <ApiKeysTab orgId={orgId} />}
          {tab === 'payments' && <PaymentsTab orgId={orgId} />}
        </>
      )}
    </div>
  );
}

/* ---------------- Profile ---------------- */

function ProfileTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [countryCode, setCountryCode] = useState('NG');

  useEffect(() => {
    apiFetch<Organization>(`/v1/organizations/${orgId}`)
      .then((o) => {
        setOrg(o);
        setName(o.name);
        setSlug(o.slug);
        setCountryCode(o.countryCode);
      })
      .catch((err: Error) => setError(err.message));
  }, [orgId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiFetch<Organization>(`/v1/organizations/${orgId}`, {
        method: 'PATCH',
        json: { name, slug, countryCode: countryCode.toUpperCase() },
      });
      setOrg(updated);
      toast.success('Saved', 'Organization profile updated.');
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorPanel text={error} />;
  if (!org) return <SkeletonCard />;

  return (
    <Section title="Organization profile" subtitle="Public name, URL slug, default country">
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
            className="w-full rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/60"
          />
        </Field>
        <Field label="Slug" hint="Lowercase letters, numbers, hyphens. Used in public URLs.">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            pattern="^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$"
            required
            className="w-full rounded-lg border border-surface-border bg-surface/40 px-3 py-2 font-mono text-sm text-ink-primary outline-none focus:border-brand-500/60"
          />
        </Field>
        <Field label="Country code" hint="2-letter ISO code (e.g. NG, KE, GH).">
          <input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            maxLength={2}
            className="w-24 rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-center text-sm text-ink-primary uppercase outline-none focus:border-brand-500/60"
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </Section>
  );
}

/* ---------------- Branding ---------------- */

function BrandingTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#6D28D9');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Organization>(`/v1/organizations/${orgId}`).then((o) => {
      setOrg(o);
      setLogoUrl(o.logoUrl ?? '');
      setBrandColor(o.brandColor ?? '#6D28D9');
    });
  }, [orgId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await apiFetch<Organization>(`/v1/organizations/${orgId}`, {
        method: 'PATCH',
        json: {
          logoUrl: logoUrl.trim() === '' ? null : logoUrl.trim(),
          brandColor,
        },
      });
      setOrg(updated);
      toast.success('Saved', 'Branding updated.');
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  if (!org) return <SkeletonCard />;

  return (
    <Section
      title="Branding"
      subtitle="Logo URL and primary colour. Applied to public event pages and emails."
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="Logo URL" hint="HTTPS URL of a square logo (PNG or SVG).">
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://media.orkora.events/logo.png"
            className="w-full rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/60"
          />
        </Field>
        <Field label="Primary brand colour">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
              className="h-10 w-16 cursor-pointer rounded-lg border border-surface-border bg-surface/40"
            />
            <input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
              pattern="^#[0-9A-Fa-f]{6}$"
              className="w-32 rounded-lg border border-surface-border bg-surface/40 px-3 py-2 font-mono text-sm uppercase text-ink-primary outline-none focus:border-brand-500/60"
            />
            <div
              className="ml-3 h-10 w-32 rounded-lg shadow-inner"
              style={{ backgroundColor: brandColor }}
              aria-label="Colour preview"
            />
          </div>
        </Field>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save branding'}
          </button>
        </div>
      </form>

      {logoUrl && (
        <div className="mt-6 rounded-2xl border border-dashed border-surface-border bg-surface-deep/40 p-6">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Org logo preview"
            className="mt-3 h-16 w-16 rounded-lg object-contain"
            onError={(e) => ((e.currentTarget.style.display = 'none'))}
          />
        </div>
      )}
    </Section>
  );
}

/* ---------------- Members ---------------- */

function MembersTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invites, setInvites] = useState<OrgInvite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'organizer' | 'staff' | 'vendor'>(
    'organizer',
  );
  const [inviting, setInviting] = useState(false);

  async function refresh() {
    try {
      const [m, i] = await Promise.all([
        apiFetch<OrgMember[]>(`/v1/organizations/${orgId}/members`),
        apiFetch<OrgInvite[]>(`/v1/organizations/${orgId}/invitations`),
      ]);
      setMembers(m);
      setInvites(i);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await apiFetch(`/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        json: { email: inviteEmail.trim().toLowerCase(), role: inviteRole },
      });
      setInviteEmail('');
      toast.success('Invitation sent', `Sent to ${inviteEmail.trim().toLowerCase()}`);
      refresh();
    } catch (err) {
      toast.error('Could not invite', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    try {
      await apiFetch(`/v1/organizations/${orgId}/members/${userId}`, {
        method: 'PATCH',
        json: { role },
      });
      toast.success('Role updated');
      refresh();
    } catch (err) {
      toast.error('Could not change role', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function remove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this organization?`)) return;
    try {
      await apiFetch(`/v1/organizations/${orgId}/members/${userId}`, { method: 'DELETE' });
      toast.success('Member removed');
      refresh();
    } catch (err) {
      toast.error('Could not remove', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function revokeInvite(invitationId: string) {
    try {
      await apiFetch(`/v1/organizations/${orgId}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      toast.success('Invitation revoked');
      refresh();
    } catch (err) {
      toast.error('Could not revoke', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (error) return <ErrorPanel text={error} />;

  return (
    <div className="space-y-6">
      <Section title="Invite a teammate" subtitle="They get an email with an accept link.">
        <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-3">
          <Field label="Email" className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface/40 px-3 py-2">
              <Mail className="h-4 w-4 text-ink-muted" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="teammate@example.com"
                className="w-full bg-transparent text-sm text-ink-primary outline-none"
              />
            </div>
          </Field>
          <Field label="Role">
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as 'admin' | 'organizer' | 'staff' | 'vendor')
              }
              className="rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary outline-none"
            >
              <option value="admin">Admin</option>
              <option value="organizer">Organizer</option>
              <option value="staff">Staff</option>
              <option value="vendor">Vendor</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {inviting ? 'Sending...' : 'Send invite'}
          </button>
        </form>
      </Section>

      <Section title="Members" subtitle={members ? `${members.length} active` : ''}>
        {!members ? (
          <SkeletonRows />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Person</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Joined</th>
                  <th className="px-5 py-3 font-semibold">Last login</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface/40">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink-primary">{m.user.fullName}</div>
                      <div className="text-[11px] text-ink-muted">{m.user.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.user.id, e.target.value)}
                        className="rounded-md border border-surface-border bg-surface/40 px-2 py-1 text-xs text-ink-primary"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="organizer">Organizer</option>
                        <option value="staff">Staff</option>
                        <option value="vendor">Vendor</option>
                      </select>
                    </td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {new Date(m.joinedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {m.user.lastLoginAt
                        ? new Date(m.user.lastLoginAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })
                        : 'Never'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => remove(m.user.id, m.user.fullName)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#FF9090] hover:bg-[#FF7675]/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Pending invitations" subtitle={invites ? `${invites.length} open` : ''}>
        {!invites ? (
          <SkeletonRows />
        ) : invites.length === 0 ? (
          <Empty text="No pending invitations." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Expires</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface/40">
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td className="px-5 py-4 text-ink-primary">{i.email}</td>
                    <td className="px-5 py-4 text-ink-secondary">{i.role}</td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {new Date(i.expiresAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => revokeInvite(i.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#FF9090] hover:bg-[#FF7675]/10"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------- API Keys ---------------- */

const ALL_SCOPES: Array<{ value: string; label: string }> = [
  { value: 'events.read', label: 'events:read' },
  { value: 'events.write', label: 'events:write' },
  { value: 'registrations.read', label: 'registrations:read' },
  { value: 'registrations.write', label: 'registrations:write' },
  { value: 'analytics.read', label: 'analytics:read' },
];

function ApiKeysTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set(['events.read']));
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewApiKey | null>(null);

  async function refresh() {
    try {
      setKeys(await apiFetch<ApiKeyRow[]>(`/v1/organizations/${orgId}/api-keys`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const k = await apiFetch<NewApiKey>(`/v1/organizations/${orgId}/api-keys`, {
        method: 'POST',
        json: { name: name.trim(), scopes: [...scopes] },
      });
      setNewKey(k);
      setName('');
      refresh();
      toast.success('API key created', 'Copy the token now; it will not be shown again.');
    } catch (err) {
      toast.error('Could not create', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

  async function revoke(keyId: string, label: string) {
    if (!confirm(`Revoke API key "${label}"? Calls using it will start failing immediately.`))
      return;
    try {
      await apiFetch(`/v1/organizations/${orgId}/api-keys/${keyId}`, { method: 'DELETE' });
      toast.success('Revoked');
      refresh();
    } catch (err) {
      toast.error('Could not revoke', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  function toggleScope(scope: string) {
    const next = new Set(scopes);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    setScopes(next);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy', 'Select the token manually.');
    }
  }

  if (error) return <ErrorPanel text={error} />;

  return (
    <div className="space-y-6">
      <Section
        title="Create an API key"
        subtitle="Tokens carry the org id and the scopes you select."
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Name" hint="Helps you identify this key in the list below.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
              placeholder="CI deploys, Zapier integration, ..."
              className="w-full rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/60"
            />
          </Field>
          <Field label="Scopes">
            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map((s) => (
                <label
                  key={s.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                    scopes.has(s.value)
                      ? 'border-brand-500/60 bg-brand-500/15 text-brand-300'
                      : 'border-surface-border text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={scopes.has(s.value)}
                    onChange={() => toggleScope(s.value)}
                    className="hidden"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Creating...' : 'Create key'}
            </button>
          </div>
        </form>

        {newKey && (
          <div className="mt-5 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-brand-300">
                  New key: {newKey.name}
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary">
                  Copy now. The plaintext will not be shown again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewKey(null)}
                className="text-[11px] text-ink-muted hover:text-ink-primary"
              >
                Dismiss
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-deep px-3 py-2">
              <code className="flex-1 break-all font-mono text-[11px] text-ink-primary">
                {newKey.token}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(newKey.token)}
                className="inline-flex items-center gap-1 rounded-md bg-brand-500/20 px-2 py-1 text-[11px] font-semibold text-brand-300 hover:bg-brand-500/30"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Active keys" subtitle="Revoked keys remain for audit but cannot authenticate.">
        {!keys ? (
          <SkeletonRows />
        ) : keys.length === 0 ? (
          <Empty text="No keys yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Token</th>
                  <th className="px-5 py-3 font-semibold">Scopes</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Last used</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface/40">
                {keys.map((k) => (
                  <tr key={k.id} className={k.revokedAt ? 'opacity-60' : ''}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink-primary">{k.name}</div>
                      <div className="text-[10px] text-ink-muted">
                        by {k.createdBy.fullName}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-ink-secondary">
                      ork_••••{k.lastFour}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.length === 0 ? (
                          <span className="text-[10px] text-ink-muted">no scopes</span>
                        ) : (
                          k.scopes.map((s) => (
                            <span
                              key={s}
                              className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[9px] font-semibold text-brand-300"
                            >
                              {s}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {new Date(k.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                          })
                        : '-'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {k.revokedAt ? (
                        <span className="text-[10px] text-ink-muted">Revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => revoke(k.id, k.name)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#FF9090] hover:bg-[#FF7675]/10"
                        >
                          <Shield className="h-3 w-3" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------- Payments ---------------- */

const COMMON_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP'];

function PaymentsTab({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [data, setData] = useState<PaymentPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('NGN');
  const [provider, setProvider] = useState('paystack');

  async function refresh() {
    try {
      const d = await apiFetch<PaymentPrefs>(`/v1/organizations/${orgId}/payment-preferences`);
      setData(d);
      if (d.enabledProviders.length > 0 && !d.enabledProviders.includes(provider)) {
        setProvider(d.enabledProviders[0]!);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function upsert(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch(
        `/v1/organizations/${orgId}/payment-preferences/${currency.toUpperCase()}`,
        {
          method: 'PUT',
          json: { provider },
        },
      );
      toast.success('Saved', `${currency.toUpperCase()} → ${provider}`);
      refresh();
    } catch (err) {
      toast.error('Could not save', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function remove(cur: string) {
    if (!confirm(`Remove the override for ${cur}? Default routing will apply.`)) return;
    try {
      await apiFetch(`/v1/organizations/${orgId}/payment-preferences/${cur}`, {
        method: 'DELETE',
      });
      toast.success('Removed');
      refresh();
    } catch (err) {
      toast.error('Could not remove', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (error) return <ErrorPanel text={error} />;
  if (!data) return <SkeletonCard />;

  return (
    <div className="space-y-6">
      <Section
        title="Provider preferences"
        subtitle="Override the default per-currency routing. Leaves the default in place when no row exists."
      >
        <form onSubmit={upsert} className="flex flex-wrap items-end gap-3">
          <Field label="Currency">
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              list="common-currencies"
              required
              className="w-24 rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-center font-mono text-sm uppercase text-ink-primary outline-none focus:border-brand-500/60"
            />
            <datalist id="common-currencies">
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-sm text-ink-primary outline-none"
            >
              {data.enabledProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow"
          >
            Save preference
          </button>
        </form>
        <p className="mt-3 text-[11px] text-ink-muted">
          Enabled providers on this server: {data.enabledProviders.join(', ') || 'none'}.
        </p>
      </Section>

      <Section title="Active overrides" subtitle={`${data.preferences.length} configured`}>
        {data.preferences.length === 0 ? (
          <Empty text="No overrides set. Default per-currency ordering applies." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Currency</th>
                  <th className="px-5 py-3 font-semibold">Provider</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface/40">
                {data.preferences.map((p) => (
                  <tr key={p.currency}>
                    <td className="px-5 py-4 font-mono text-ink-primary">{p.currency}</td>
                    <td className="px-5 py-4 text-ink-secondary">{p.provider}</td>
                    <td className="px-5 py-4 text-[11px] text-ink-muted">
                      {new Date(p.updatedAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => remove(p.currency)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#FF9090] hover:bg-[#FF7675]/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------- Layout helpers ---------------- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
        {subtitle ? <p className="text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[10px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function ErrorPanel({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-6 text-sm text-[#FF9090]">
      {text}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-surface-deep/40 p-8 text-center text-sm text-ink-muted">
      {text}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-72 animate-pulse rounded-2xl border border-surface-border bg-surface/40" />
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg border border-surface-border bg-surface/40"
        />
      ))}
    </div>
  );
}

