'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Archive,
  Calendar,
  Camera,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Radio,
  Tag,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import {
  eventsApi,
  formatEventDateRange,
  formatPrice,
  readActiveOrgId,
  sameCalendarDay,
  wallTimeToUtcISO,
  utcISOToWallTime,
  type EventDetail,
  type EventTier,
  type EventStatus,
  type EventSpeaker,
} from '@/lib/events';
import { ImageUpload } from '@/components/image-upload';
import { ActionButton } from '@/components/action-button';
import { useToast } from '@/components/toast';

const STATUS_STYLES: Record<EventStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  published: 'bg-emerald-100 text-emerald-700',
  live: 'bg-rose-100 text-rose-700',
  ended: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [showTierForm, setShowTierForm] = useState(false);
  const [showSpeakerForm, setShowSpeakerForm] = useState(false);
  // The speaker currently being edited (null = the form, when open, creates a
  // new speaker). Set by a card's Edit button; cleared on save/cancel.
  const [editingSpeaker, setEditingSpeaker] = useState<EventSpeaker | null>(null);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [editingTrack, setEditingTrack] = useState<{ id: string; name: string; color: string | null } | null>(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [editingSession, setEditingSession] = useState<EventDetail['sessions'][number] | null>(null);

  const orgId = typeof window !== 'undefined' ? readActiveOrgId() : null;

  async function refresh() {
    if (!orgId) return;
    const detail = await eventsApi(orgId).get(id);
    setEvent(detail);
  }

  useEffect(() => {
    if (!orgId) {
      setError('No active organization. Please sign in.');
      setLoading(false);
      return;
    }
    eventsApi(orgId)
      .get(id)
      .then(setEvent)
      .catch(() => setError('Could not load this event.'))
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function togglePublish() {
    if (!event || !orgId) return;
    setActing(true);
    try {
      if (event.status === 'published') {
        await eventsApi(orgId).unpublish(id);
        toast.info('Event unpublished', 'Attendees can no longer see it.');
      } else {
        await eventsApi(orgId).publish(id);
        toast.success('Event published', 'Attendees can register now.');
      }
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update status.';
      toast.error('Status update failed', msg);
    } finally {
      setActing(false);
    }
  }

  async function setBanner(url: string | null) {
    if (!event || !orgId) return;
    setActing(true);
    try {
      await eventsApi(orgId).update(id, { bannerUrl: url ?? null });
      await refresh();
      toast.success(url ? 'Banner updated' : 'Banner removed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update banner.';
      toast.error('Banner update failed', msg);
    } finally {
      setActing(false);
    }
  }

  async function archive() {
    if (!event || !orgId) return;
    if (!confirm('Archive this event? Attendees will no longer be able to view it.')) return;
    setActing(true);
    try {
      await eventsApi(orgId).archive(id);
      router.push('/dashboard/events');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive.');
      setActing(false);
    }
  }

  async function copyShareLink() {
    if (!event) return;
    const url = `${window.location.origin}/e/${event.code}`;
    await navigator.clipboard.writeText(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Loading event...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? 'Event not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/events"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to events
      </Link>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="group relative h-40 w-full overflow-hidden bg-brand-gradient">
          {event.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
          <BannerEditor
            current={event.bannerUrl ?? null}
            onChange={setBanner}
            disabled={event.status === 'archived' || acting}
          />
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-900">{event.title}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[event.status]}`}
                >
                  {event.status}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="h-4 w-4" />
                {formatEventDateRange(event.startAt, event.endAt, event.timezone)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Code <span className="font-mono">{event.code}</span> &middot; {event.kind}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                variant="secondary"
                onAction={copyShareLink}
                idleLabel="Copy share link"
                pendingLabel="Copying…"
                successLabel="Copied"
                idleIcon={<Copy className="h-4 w-4" />}
                onError={(m) => toast.error('Could not copy', m)}
              />
              <Link
                href={`/dashboard/events/${id}/registrations`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Users className="h-4 w-4" /> Registrations
              </Link>
              <Link
                href={`/dashboard/events/${id}/checkin`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Run check-in
              </Link>
              <Link
                href={`/dashboard/events/${id}/analytics`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Analytics
              </Link>
              <Link
                href={`/dashboard/events/${id}/feedback`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <MessageSquare className="h-4 w-4" /> Feedback
              </Link>
              <Link
                href={`/dashboard/events/${id}/discounts`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Tag className="h-4 w-4" /> Discounts
              </Link>
              <Link
                href={`/dashboard/events/${id}/recordings`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Video className="h-4 w-4" /> Recordings
              </Link>
              <Link
                href={`/dashboard/events/${id}/live`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Radio className="h-4 w-4" /> Live
              </Link>
              <button
                onClick={togglePublish}
                disabled={acting || event.status === 'archived'}
                className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
              >
                {acting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : event.status === 'published' ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {event.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button
                onClick={archive}
                disabled={acting || event.status === 'archived'}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Archive className="h-4 w-4" /> Archive
              </button>
            </div>
          </div>

          {event.description && (
            <p className="mt-4 max-w-3xl text-sm text-slate-600">{event.description}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Stat label="Sessions" value={event.sessions.length} />
        <Stat label="Speakers" value={event.speakers.length} />
        <Stat label="Ticket tiers" value={event.tiers.length} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Ticket tiers</h3>
          <button
            onClick={() => setShowTierForm((s) => !s)}
            className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add tier
          </button>
        </div>

        {showTierForm && orgId && (
          <NewTierForm
            orgId={orgId}
            eventId={id}
            onCreated={async () => {
              setShowTierForm(false);
              await refresh();
            }}
          />
        )}

        {event.tiers.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tiers yet. Add at least one tier (Free, Standard, VIP, etc.) to start selling.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {event.tiers.map((tier) => (
              <TierRow
                key={tier.id}
                tier={tier}
                onDelete={async () => {
                  if (!orgId) return;
                  if (!confirm(`Delete tier "${tier.name}"?`)) return;
                  await eventsApi(orgId).deleteTier(id, tier.id);
                  await refresh();
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Tracks</h3>
          <button
            onClick={() => setShowTrackForm((s) => !s)}
            className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add track
          </button>
        </div>

        {(showTrackForm || editingTrack) && orgId ? (
          <TrackForm
            orgId={orgId}
            eventId={id}
            track={editingTrack}
            onSaved={async (wasEdit) => {
              setShowTrackForm(false);
              setEditingTrack(null);
              await refresh();
              toast.success(wasEdit ? 'Track updated' : 'Track added');
            }}
            onCancel={() => {
              setShowTrackForm(false);
              setEditingTrack(null);
            }}
            onError={(msg) =>
              toast.error(editingTrack ? 'Could not update track' : 'Could not add track', msg)
            }
          />
        ) : null}

        {event.tracks.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tracks yet. Group sessions into tracks (e.g. Main Stage, Workshop).
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {event.tracks.map((tr) => (
              <li
                key={tr.id}
                className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {tr.color ? (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tr.color }}
                  />
                ) : null}
                {tr.name}
                <button
                  type="button"
                  onClick={() => {
                    setShowTrackForm(false);
                    setEditingTrack({ id: tr.id, name: tr.name, color: tr.color ?? null });
                  }}
                  className="ml-1 rounded-full p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-brand-50 hover:text-brand-700"
                  aria-label={`Edit track ${tr.name}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!orgId) return;
                    if (!confirm(`Delete track "${tr.name}"? Sessions on this track will lose their grouping.`)) return;
                    try {
                      await eventsApi(orgId).deleteTrack(id, tr.id);
                      toast.success('Track deleted');
                      await refresh();
                    } catch (err) {
                      toast.error('Could not delete', err instanceof Error ? err.message : '');
                    }
                  }}
                  className="rounded-full p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete track ${tr.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Sessions</h3>
          <button
            onClick={() => setShowSessionForm((s) => !s)}
            className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add session
          </button>
        </div>

        {(showSessionForm || editingSession) && orgId ? (
          <SessionForm
            orgId={orgId}
            eventId={id}
            session={editingSession}
            tracks={event.tracks}
            timezone={event.timezone}
            onSaved={async (wasEdit) => {
              setShowSessionForm(false);
              setEditingSession(null);
              await refresh();
              toast.success(wasEdit ? 'Session updated' : 'Session added');
            }}
            onCancel={() => {
              setShowSessionForm(false);
              setEditingSession(null);
            }}
            onError={(msg) =>
              toast.error(editingSession ? 'Could not update session' : 'Could not add session', msg)
            }
          />
        ) : null}

        {event.sessions.length === 0 ? (
          <p className="text-sm text-slate-500">
            No sessions yet. Add talks, workshops, or panels with their start / end times.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...event.sessions]
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((s) => {
                const track = event.tracks.find((t) => t.id === s.trackId) ?? null;
                return (
                  <SessionRow
                    key={s.id}
                    session={s}
                    track={track}
                    timezone={event.timezone}
                    onEdit={() => {
                      setShowSessionForm(false);
                      setEditingSession(s);
                    }}
                    onDelete={async () => {
                      if (!orgId) return;
                      if (!confirm(`Delete session "${s.title}"?`)) return;
                      try {
                        await eventsApi(orgId).deleteSession(id, s.id);
                        toast.success('Session deleted');
                        await refresh();
                      } catch (err) {
                        toast.error('Could not delete', err instanceof Error ? err.message : '');
                      }
                    }}
                  />
                );
              })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Speakers</h3>
          <button
            onClick={() => setShowSpeakerForm((s) => !s)}
            className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add speaker
          </button>
        </div>

        {(showSpeakerForm || editingSpeaker) && orgId ? (
          <SpeakerForm
            orgId={orgId}
            eventId={id}
            speaker={editingSpeaker}
            onSaved={async (wasEdit) => {
              setShowSpeakerForm(false);
              setEditingSpeaker(null);
              await refresh();
              toast.success(wasEdit ? 'Speaker updated' : 'Speaker added');
            }}
            onCancel={() => {
              setShowSpeakerForm(false);
              setEditingSpeaker(null);
            }}
            onError={(msg) =>
              toast.error(editingSpeaker ? 'Could not update speaker' : 'Could not add speaker', msg)
            }
          />
        ) : null}

        {event.speakers.length === 0 ? (
          <p className="text-sm text-slate-500">
            No speakers yet. Add the people who will lead sessions.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {event.speakers.map((sp) => (
              <SpeakerCard
                key={sp.id}
                speaker={sp}
                onEdit={() => {
                  setShowSpeakerForm(false);
                  setEditingSpeaker(sp);
                }}
                onDelete={async () => {
                  if (!orgId) return;
                  if (!confirm(`Remove ${sp.fullName}?`)) return;
                  try {
                    await eventsApi(orgId).deleteSpeaker(id, sp.id);
                    toast.success('Speaker removed');
                    await refresh();
                  } catch (err) {
                    toast.error(
                      'Could not remove speaker',
                      err instanceof Error ? err.message : '',
                    );
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SpeakerCard({
  speaker,
  onEdit,
  onDelete,
}: {
  speaker: { id: string; fullName: string; title: string | null; bio: string | null; avatarUrl: string | null };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {speaker.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={speaker.avatarUrl}
          alt={speaker.fullName}
          className="h-12 w-12 flex-none rounded-full object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
          {speaker.fullName.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{speaker.fullName}</p>
            {speaker.title ? (
              <p className="truncate text-xs text-slate-500">{speaker.title}</p>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="text-slate-400 transition hover:text-brand-700"
              aria-label="Edit speaker"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="text-slate-400 transition hover:text-red-600"
              aria-label="Remove speaker"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {speaker.bio ? (
          <p className="mt-2 line-clamp-2 text-xs text-slate-500">{speaker.bio}</p>
        ) : null}
      </div>
    </li>
  );
}

// Create OR edit a speaker. When `speaker` is provided the form is pre-filled
// and PATCHes; otherwise it POSTs a new speaker. Save shows a Saved flash.
function SpeakerForm({
  orgId,
  eventId,
  speaker,
  onSaved,
  onCancel,
  onError,
}: {
  orgId: string;
  eventId: string;
  speaker: EventSpeaker | null;
  onSaved: (wasEdit: boolean) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const isEdit = !!speaker;
  const [fullName, setFullName] = useState(speaker?.fullName ?? '');
  const [title, setTitle] = useState(speaker?.title ?? '');
  const [bio, setBio] = useState(speaker?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(speaker?.avatarUrl ?? null);

  async function save() {
    const payload = {
      fullName: fullName.trim(),
      title: title.trim() || undefined,
      bio: bio.trim() || undefined,
      avatarUrl: avatarUrl ?? undefined,
    };
    if (!payload.fullName) {
      onError('Speaker name is required.');
      throw new Error('validation');
    }
    if (isEdit && speaker) {
      await eventsApi(orgId).updateSpeaker(eventId, speaker.id, payload);
    } else {
      await eventsApi(orgId).createSpeaker(eventId, payload);
    }
    onSaved(isEdit);
  }

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-[120px_1fr]">
      <div className="flex flex-col items-center gap-2">
        <ImageUpload kind="avatar" value={avatarUrl} onChange={setAvatarUrl} aspect="square" />
      </div>
      <div className="space-y-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          placeholder="Full name"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Role / title (optional)"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
        />
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Short bio (optional)"
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            Cancel
          </button>
          <ActionButton
            variant="primary"
            onAction={save}
            idleLabel={isEdit ? 'Save changes' : 'Add speaker'}
            pendingLabel="Saving…"
            successLabel="Saved"
            onError={onError}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TierRow({ tier, onDelete }: { tier: EventTier; onDelete: () => void }) {
  const sold = tier.quantitySold;
  const total = tier.quantityTotal ?? null;
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{tier.name}</p>
        {tier.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{tier.description}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {sold} sold{total !== null ? ` of ${total}` : ''}
          {tier.isGroup && tier.groupSize ? ` · group of ${tier.groupSize}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-900">
          {formatPrice(tier.priceMinor, tier.currency)}
        </span>
        <button
          onClick={onDelete}
          className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete tier ${tier.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

interface NewTierFormProps {
  orgId: string;
  eventId: string;
  onCreated: () => Promise<void> | void;
}

function NewTierForm({ orgId, eventId, onCreated }: NewTierFormProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const f = new FormData(e.currentTarget);
    const groupSize = isGroup ? Number(f.get('groupSize') ?? 0) : undefined;
    const maxPerOrder = f.get('maxPerOrder') ? Number(f.get('maxPerOrder')) : undefined;
    if (isGroup && (!groupSize || groupSize < 2)) {
      setErr('Group size must be at least 2.');
      setBusy(false);
      return;
    }
    if (isGroup && groupSize && maxPerOrder && groupSize > maxPerOrder) {
      setErr('Group size cannot exceed the maximum per order.');
      setBusy(false);
      return;
    }
    try {
      await eventsApi(orgId).createTier(eventId, {
        name: String(f.get('name') ?? ''),
        priceMinor: Math.round(Number(f.get('price') ?? 0) * 100),
        currency: String(f.get('currency') ?? 'NGN'),
        quantityTotal: f.get('quantity') ? Number(f.get('quantity')) : undefined,
        description: (String(f.get('description') ?? '') || undefined) as string | undefined,
        isGroup,
        groupSize: isGroup ? groupSize : undefined,
        maxPerOrder,
      });
      await onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create tier.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-6">
      <input
        name="name"
        required
        placeholder="Tier name (e.g. Early bird)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-2"
      />
      <input
        name="price"
        type="number"
        step="0.01"
        min="0"
        defaultValue="0"
        required
        placeholder="Price"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
      />
      <select
        name="currency"
        defaultValue="NGN"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
      >
        <option>NGN</option>
        <option>USD</option>
        <option>KES</option>
        <option>GHS</option>
        <option>ZAR</option>
      </select>
      <input
        name="quantity"
        type="number"
        min="1"
        placeholder="Qty (optional)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Saving...' : 'Add'}
      </button>
      <textarea
        name="description"
        rows={2}
        placeholder="Description (optional)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-6"
      />
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-6">
        <input
          type="checkbox"
          checked={isGroup}
          onChange={(e) => setIsGroup(e.target.checked)}
        />
        Group ticket (buyers must register a minimum number of people per order)
      </label>
      {isGroup && (
        <div className="grid grid-cols-1 gap-3 sm:col-span-6 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            Minimum group size
            <input
              name="groupSize"
              type="number"
              min="2"
              defaultValue="2"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Maximum per order
            <input
              name="maxPerOrder"
              type="number"
              min="2"
              defaultValue="10"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
            />
          </label>
        </div>
      )}
      {err && <p className="text-xs text-red-700 sm:col-span-6">{err}</p>}
    </form>
  );
}

/* ----------------- Tracks / Sessions forms ----------------- */

interface TrackFormProps {
  orgId: string;
  eventId: string;
  track: { id: string; name: string; color: string | null } | null;
  onSaved: (wasEdit: boolean) => Promise<void> | void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

function TrackForm({ orgId, eventId, track, onSaved, onCancel, onError }: TrackFormProps) {
  const isEdit = !!track;
  const [name, setName] = useState(track?.name ?? '');
  const [color, setColor] = useState(track?.color ?? '#6D28D9');

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Track name is required.');
    if (isEdit) {
      await eventsApi(orgId).updateTrack(eventId, track!.id, { name: trimmed, color });
    } else {
      await eventsApi(orgId).createTrack(eventId, { name: trimmed, color });
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Track name (e.g. Main stage)"
        className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
      />
      <input
        value={color}
        onChange={(e) => setColor(e.target.value)}
        type="color"
        className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200"
        aria-label="Track colour"
      />
      <ActionButton
        onAction={save}
        idleLabel={isEdit ? 'Save changes' : 'Add'}
        pendingLabel="Saving…"
        successLabel="Saved"
        variant="primary"
        onError={onError}
        onDone={() => onSaved(isEdit)}
      />
      {isEdit ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

interface SessionFormProps {
  orgId: string;
  eventId: string;
  session: EventDetail['sessions'][number] | null;
  tracks: Array<{ id: string; name: string }>;
  timezone: string;
  onSaved: (wasEdit: boolean) => Promise<void> | void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

function SessionForm({
  orgId,
  eventId,
  session,
  tracks,
  timezone,
  onSaved,
  onCancel,
  onError,
}: SessionFormProps) {
  const isEdit = !!session;
  const [title, setTitle] = useState(session?.title ?? '');
  const [trackId, setTrackId] = useState(session?.trackId ?? '');
  const [startAt, setStartAt] = useState(
    session ? utcISOToWallTime(session.startAt, timezone) : '',
  );
  const [endAt, setEndAt] = useState(
    session ? utcISOToWallTime(session.endAt, timezone) : '',
  );
  const [streamUrl, setStreamUrl] = useState(session?.streamUrl ?? '');
  const [capacity, setCapacity] = useState(
    session?.capacity != null ? String(session.capacity) : '',
  );
  const [description, setDescription] = useState(session?.description ?? '');
  const [requiresRsvp, setRequiresRsvp] = useState(session?.requiresRsvp ?? false);

  async function save() {
    const t = title.trim();
    if (!t) throw new Error('Session title is required.');
    if (!startAt || !endAt) throw new Error('Start and end times are required.');
    const cap = capacity.trim();
    if (isEdit) {
      await eventsApi(orgId).updateSession(eventId, session!.id, {
        title: t,
        description: description.trim() || undefined,
        trackId: trackId || null,
        startAt: wallTimeToUtcISO(startAt, timezone),
        endAt: wallTimeToUtcISO(endAt, timezone),
        streamUrl: streamUrl.trim() || null,
        capacity: cap ? Number(cap) : null,
        requiresRsvp,
      });
    } else {
      await eventsApi(orgId).createSession(eventId, {
        title: t,
        description: description.trim() || undefined,
        trackId: trackId || undefined,
        startAt: wallTimeToUtcISO(startAt, timezone),
        endAt: wallTimeToUtcISO(endAt, timezone),
        streamUrl: streamUrl.trim() || undefined,
        capacity: cap ? Number(cap) : undefined,
        requiresRsvp,
      });
    }
  }

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-6">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="Session title"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-4"
      />
      <select
        value={trackId}
        onChange={(e) => setTrackId(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-2"
      >
        <option value="">No track</option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="text-xs font-medium text-slate-600 sm:col-span-3">
        Starts at
        <input
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          required
          type="datetime-local"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
        />
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-3">
        Ends at
        <input
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          required
          type="datetime-local"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400"
        />
      </label>
      <input
        value={streamUrl}
        onChange={(e) => setStreamUrl(e.target.value)}
        type="url"
        placeholder="Stream URL (https://...)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-4"
      />
      <input
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        type="number"
        min="1"
        placeholder="Capacity (optional)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-2"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 sm:col-span-6"
      />
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 sm:col-span-4">
        <input
          type="checkbox"
          checked={requiresRsvp}
          onChange={(e) => setRequiresRsvp(e.target.checked)}
        />
        Requires RSVP (cap how many attendees can join this session)
      </label>
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {isEdit ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        ) : null}
        <ActionButton
          onAction={save}
          idleLabel={isEdit ? 'Save changes' : 'Add session'}
          pendingLabel="Saving…"
          successLabel="Saved"
          variant="primary"
          onError={onError}
          onDone={() => onSaved(isEdit)}
        />
      </div>
    </div>
  );
}

function SessionRow({
  session,
  track,
  timezone,
  onEdit,
  onDelete,
}: {
  session: {
    id: string;
    title: string;
    description: string | null;
    startAt: string;
    endAt: string;
    streamUrl: string | null;
    capacity: number | null;
    requiresRsvp: boolean;
    trackId: string | null;
  };
  track: { id: string; name: string; color: string | null } | null;
  timezone: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  const sameDay = sameCalendarDay(start, end, timezone);
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900">{session.title}</p>
          {track ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
            >
              {track.color ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: track.color }}
                />
              ) : null}
              {track.name}
            </span>
          ) : null}
          {session.requiresRsvp ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              RSVP
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {start.toLocaleString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
          })}{' '}
          –{' '}
          {sameDay
            ? end.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: timezone,
              })
            : end.toLocaleString('en-GB', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: timezone,
              })}
        </p>
        {session.streamUrl ? (
          <p className="mt-1 truncate text-xs text-brand-700">
            <a href={session.streamUrl} target="_blank" rel="noreferrer" className="hover:underline">
              {session.streamUrl}
            </a>
          </p>
        ) : null}
        {session.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{session.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          className="rounded-full p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-700"
          aria-label={`Edit session ${session.title}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete session ${session.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

/* ----------------- Banner editor ----------------- */

function BannerEditor({
  current,
  onChange,
  disabled,
}: {
  current: string | null;
  onChange: (url: string | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (disabled) return null;

  if (editing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">Update banner</h4>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3">
            <ImageUpload
              kind="banner"
              value={current}
              onChange={async (url) => {
                await onChange(url);
                setEditing(false);
              }}
              aspect="banner"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
    >
      <Camera className="h-3.5 w-3.5" /> Edit banner
    </button>
  );
}
