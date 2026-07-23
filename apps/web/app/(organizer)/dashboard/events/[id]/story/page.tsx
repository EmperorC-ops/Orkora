'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ExternalLink,
  GripVertical,
  Plus,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';
import { ActionButton } from '@/components/action-button';
import type { StoryBlock } from '@/lib/story';
import type { StoryEvent } from '@/app/(public)/e/[code]/StoryBlocks';
import StoryPreview from './StoryPreview';
import {
  ADDABLE_BLOCKS,
  BLOCK_LABELS,
  STORY_TEMPLATES,
  TEMPLATE_BLURBS,
  TEMPLATE_LABELS,
  type BlockType,
  type StoryTemplate,
  composeClassicFrom,
  createStoryPreviewToken,
  defaultBlock,
  getStoryAnalytics,
  publishStory,
  saveStory,
  templateSeed,
  unpublishStory,
  type StoryAnalyticsSummary,
} from '@/lib/story-edit';

interface PreviewSession {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  trackId: string | null;
}
interface PreviewSpeaker {
  id: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
}
interface PreviewTier {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  quantityTotal: number | null;
  quantitySold: number;
  isGroup: boolean;
  groupSize: number | null;
}

interface EventDetail {
  id: string;
  code: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  timezone: string;
  storyBlocks: StoryBlock[];
  storyTemplate: string;
  storyPublishedAt: string | null;
  sessions?: PreviewSession[];
  speakers?: PreviewSpeaker[];
  tiers?: PreviewTier[];
}

interface OrgInfo {
  name: string;
  brandColor: string | null;
  slug: string;
}

export default function StoryComposerPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [blocks, setBlocks] = useState<StoryBlock[]>([]);
  const [template, setTemplate] = useState<StoryTemplate>('classic');
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<'editor' | 'preview'>('editor');
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<StoryAnalyticsSummary | null>(null);

  // Keep the latest state accessible to the autosave interval without
  // re-registering it on every keystroke.
  const latest = useRef({ blocks, template, dirty, orgId });
  latest.current = { blocks, template, dirty, orgId };

  useEffect(() => {
    const org = readActiveOrgId();
    if (!org || !eventId) return;
    setOrgId(org);
    apiFetch<EventDetail>(`/v1/organizations/${org}/events/${eventId}`)
      .then((e) => {
        setEvent(e);
        const existing = Array.isArray(e.storyBlocks) ? e.storyBlocks : [];
        setBlocks(existing);
        setTemplate((STORY_TEMPLATES as readonly string[]).includes(e.storyTemplate) ? (e.storyTemplate as StoryTemplate) : 'classic');
        setPublishedAt(e.storyPublishedAt);
        setSelectedId(existing[0]?.id ?? null);
      })
      .catch((err: Error) => setError(err.message));
    apiFetch<OrgInfo>(`/v1/organizations/${org}`)
      .then((o) => setOrgInfo({ name: o.name, brandColor: o.brandColor, slug: o.slug }))
      .catch(() => setOrgInfo(null));
    getStoryAnalytics(org, eventId)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [eventId]);

  const hasTickets = blocks.some((b) => b.type === 'tickets' && !b.hidden);

  const doSave = useCallback(async () => {
    const { orgId: org } = latest.current;
    if (!org) throw new Error('No organization selected.');
    if (!latest.current.blocks.some((b) => b.type === 'tickets' && !b.hidden)) {
      throw new Error('Add a visible Tickets block before saving.');
    }
    await saveStory(org, eventId, latest.current.blocks, latest.current.template);
    setDirty(false);
    setNotice(null);
  }, [eventId]);

  // Autosave every 30s while there are unsaved changes.
  useEffect(() => {
    const t = setInterval(() => {
      if (latest.current.dirty && latest.current.blocks.some((b) => b.type === 'tickets' && !b.hidden)) {
        void doSave().catch(() => undefined);
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [doSave]);

  function seed(t: StoryTemplate) {
    setTemplate(t);
    setBlocks(templateSeed(t));
    setDirty(true);
    setSelectedId(null);
  }

  function seedFromCurrent() {
    if (!event) return;
    setTemplate('classic');
    setBlocks(composeClassicFrom(event));
    setDirty(true);
    setSelectedId(null);
  }

  async function copyPreviewLink() {
    if (!orgId || !event) throw new Error('Not ready yet.');
    if (dirty) await doSave();
    const { token } = await createStoryPreviewToken(orgId, eventId);
    const url = `${window.location.origin}/e/${event.code}?preview=${token}`;
    await navigator.clipboard.writeText(url);
  }

  function mutate(next: StoryBlock[]) {
    setBlocks(next);
    setDirty(true);
  }

  function patchData(id: string, partial: Record<string, unknown>) {
    mutate(
      blocks.map((b) => (b.id === id ? ({ ...b, data: { ...b.data, ...partial } } as StoryBlock) : b)),
    );
  }

  function setHeroVariant(id: string, variant: 'image' | 'video' | 'minimal') {
    mutate(blocks.map((b) => (b.id === id && b.type === 'hero' ? { ...b, variant } : b)));
  }

  function addBlock(type: BlockType) {
    const b = defaultBlock(type);
    mutate([...blocks, b]);
    setSelectedId(b.id);
    setAddOpen(false);
  }

  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  }

  function toggleHidden(id: string) {
    mutate(blocks.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)));
  }

  function remove(id: string) {
    mutate(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // Native HTML5 drag-drop reorder. Reorders live as you drag over a target,
  // so the list settles into place before you drop. Move up/down remains as a
  // keyboard-friendly fallback.
  function onDragOverBlock(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    const from = blocks.findIndex((b) => b.id === dragId);
    const to = blocks.findIndex((b) => b.id === overId);
    if (from < 0 || to < 0) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    mutate(next);
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null;
  const liveHref = event ? `/e/${event.code}` : '#';

  if (error && !event) {
    return <div className="p-6 text-sm text-[#FF9090]">{error}</div>;
  }
  if (!event) {
    return <div className="p-10 text-center text-sm text-ink-secondary">Loading Story Mode...</div>;
  }

  const showPicker = blocks.length === 0;

  const previewEvent: StoryEvent = {
    code: event.code,
    title: event.title,
    timezone: event.timezone ?? 'Africa/Lagos',
    bannerUrl: event.bannerUrl,
    status: publishedAt ? 'published' : 'draft',
    storyBlocks: blocks,
    organization: {
      name: orgInfo?.name ?? event.title,
      brandColor: orgInfo?.brandColor ?? null,
      slug: orgInfo?.slug,
    },
    sessions: event.sessions,
    speakers: event.speakers,
    tiers: event.tiers,
  };

  return (
    <div className="space-y-6 text-ink-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/events/${eventId}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition hover:text-ink-primary"
          >
            <ArrowLeft className="h-4 w-4" /> {event.title}
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-5 w-5 text-brand-300" /> Story Mode
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              publishedAt ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-raised text-ink-muted'
            }`}
          >
            {publishedAt ? 'Published' : 'Draft'}
          </span>
          <a
            href={liveHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface/40 px-3 py-1.5 text-xs font-medium text-ink-secondary transition hover:text-ink-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View live
          </a>
          {!showPicker ? (
            <ActionButton
              onAction={copyPreviewLink}
              idleLabel="Copy preview link"
              pendingLabel="..."
              successLabel="Link copied"
              variant="ghost"
              onError={(m) => setError(m)}
            />
          ) : null}
          {!showPicker ? (
            <div className="inline-flex rounded-full border border-surface-border bg-surface/40 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setView('editor')}
                className={`rounded-full px-3 py-1 transition ${view === 'editor' ? 'bg-brand-500 text-white' : 'text-ink-secondary hover:text-ink-primary'}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setView('preview')}
                className={`rounded-full px-3 py-1 transition ${view === 'preview' ? 'bg-brand-500 text-white' : 'text-ink-secondary hover:text-ink-primary'}`}
              >
                Preview
              </button>
            </div>
          ) : null}
          {!showPicker ? (
            <ActionButton
              onAction={doSave}
              idleLabel={dirty ? 'Save' : 'Saved'}
              pendingLabel="Saving..."
              successLabel="Saved"
              variant="secondary"
              onError={(m) => setError(m)}
            />
          ) : null}
          {publishedAt ? (
            <ActionButton
              onAction={async () => {
                if (!orgId) return;
                await unpublishStory(orgId, eventId);
                setPublishedAt(null);
              }}
              idleLabel="Unpublish"
              pendingLabel="..."
              successLabel="Unpublished"
              variant="ghost"
              onError={(m) => setError(m)}
            />
          ) : (
            <ActionButton
              onAction={async () => {
                if (!orgId) return;
                if (dirty) await doSave();
                await publishStory(orgId, eventId);
                setPublishedAt(new Date().toISOString());
              }}
              idleLabel="Publish"
              pendingLabel="Publishing..."
              successLabel="Published"
              variant="primary"
              disabled={!hasTickets || blocks.length === 0}
              onError={(m) => setError(m)}
            />
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-3 text-sm text-[#FF9090]">{error}</div>
      ) : null}
      {!hasTickets && !showPicker ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">
          Every event page needs a way to buy tickets. Add a Tickets block to save and publish.
        </div>
      ) : null}
      {notice ? <div className="text-sm text-ink-secondary">{notice}</div> : null}

      {!showPicker && analytics && analytics.views > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-surface-border bg-surface/40 px-4 py-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Engagement</span>
          <span>
            <span className="font-semibold text-ink-primary">{analytics.views.toLocaleString()}</span>{' '}
            <span className="text-ink-secondary">views</span>
          </span>
          <span>
            <span className="font-semibold text-ink-primary">{analytics.ticketsReached.toLocaleString()}</span>{' '}
            <span className="text-ink-secondary">reached tickets</span>
          </span>
          <span>
            <span className="font-semibold text-ink-primary">
              {analytics.views > 0 ? Math.round((analytics.ticketsReached / analytics.views) * 100) : 0}%
            </span>{' '}
            <span className="text-ink-secondary">scrolled to buy</span>
          </span>
          {analytics.blocks[0] ? (
            <span className="text-ink-secondary">
              Most viewed:{' '}
              <span className="font-semibold text-ink-primary">
                {BLOCK_LABELS[analytics.blocks[0].blockType as BlockType] ?? analytics.blocks[0].blockType}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {showPicker ? (
        <TemplatePicker onPick={seed} onFromCurrent={seedFromCurrent} />
      ) : view === 'preview' ? (
        <StoryPreview event={previewEvent} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Block list */}
          <div className="lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">Blocks</h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface/40 px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Add block
                </button>
                {addOpen ? (
                  <div className="absolute right-0 z-10 mt-2 grid w-56 gap-0.5 rounded-xl border border-surface-border bg-surface-deep p-1.5 shadow-xl">
                    {ADDABLE_BLOCKS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => addBlock(t)}
                        className="rounded-lg px-3 py-1.5 text-left text-sm text-ink-secondary hover:bg-brand-500/15 hover:text-ink-primary"
                      >
                        {BLOCK_LABELS[t]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <ul className="space-y-2">
              {blocks.map((b, i) => (
                <li
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragOver={(e) => onDragOverBlock(e, b.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`flex items-center gap-2 rounded-xl border p-3 transition ${
                    selectedId === b.id ? 'border-brand-500 bg-brand-500/10' : 'border-surface-border bg-surface/40'
                  } ${b.hidden ? 'opacity-60' : ''} ${dragId === b.id ? 'opacity-40' : ''}`}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-ink-muted" />
                  <button type="button" onClick={() => setSelectedId(b.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink-primary">{BLOCK_LABELS[b.type]}</span>
                      {b.type === 'tickets' ? (
                        <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-brand-300">
                          Required
                        </span>
                      ) : null}
                      {b.hidden ? <span className="text-[10px] uppercase text-ink-muted">Hidden</span> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">{summarize(b)}</p>
                  </button>
                  <div className="flex items-center gap-0.5 text-ink-muted">
                    <IconBtn label="Move up" disabled={i === 0} onClick={() => move(b.id, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Move down" disabled={i === blocks.length - 1} onClick={() => move(b.id, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label={b.hidden ? 'Show' : 'Hide'} onClick={() => toggleHidden(b.id)}>
                      {b.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => remove(b.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Properties */}
          <div className="lg:col-span-7">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              {selected ? `${BLOCK_LABELS[selected.type]} settings` : 'Settings'}
            </h2>
            {selected ? (
              <div className="space-y-4 rounded-2xl border border-surface-border bg-surface/40 p-5">
                <Properties block={selected} patchData={patchData} setHeroVariant={setHeroVariant} />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-surface-border p-10 text-center text-sm text-ink-muted">
                Select a block to edit its content.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(b: StoryBlock): string {
  switch (b.type) {
    case 'hero':
      return b.data.headline || `${b.variant} hero`;
    case 'editorial':
      return b.data.body ? b.data.body.slice(0, 60) : 'Empty paragraph';
    case 'pullQuote':
      return b.data.quote || 'Empty quote';
    case 'cast':
      return b.data.useEventSpeakers ? 'From event speakers' : `${b.data.people.length} people`;
    case 'moodboard':
      return `${b.data.tiles.length} images`;
    case 'playlist':
      return b.data.variant === 'embed' ? b.data.embedUrl || 'No embed set' : `${b.data.tracks.length} tracks`;
    case 'agenda':
      return 'From event sessions';
    case 'tickets':
      return 'From event ticket tiers';
    case 'faq':
      return `${b.data.items.length} questions`;
    case 'brandCollab':
      return b.data.partnerName || 'No partner set';
    case 'location':
      return b.data.address || 'No address set';
    default:
      return '';
  }
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 transition hover:bg-white/10 hover:text-ink-primary disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function TemplatePicker({
  onPick,
  onFromCurrent,
}: {
  onPick: (t: StoryTemplate) => void;
  onFromCurrent: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
        <h2 className="text-lg font-semibold">Compose your event story</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Pick a starting template. Templates are a seed, not a lock-in. Once you start editing, the composition is
          yours.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STORY_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-xl border border-surface-border bg-surface-deep/50 p-4 text-left transition hover:border-brand-500 hover:bg-brand-500/10"
            >
              <div className="font-semibold text-ink-primary">{TEMPLATE_LABELS[t]}</div>
              <div className="mt-1 text-xs text-ink-muted">{TEMPLATE_BLURBS[t]}</div>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFromCurrent}
          className="mt-4 text-sm font-semibold text-brand-300 hover:text-brand-200"
        >
          Or start from my current event page
        </button>
      </div>
    </div>
  );
}

// ===== Properties panel =====

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary">{label}</div>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500';

function Properties({
  block,
  patchData,
  setHeroVariant,
}: {
  block: StoryBlock;
  patchData: (id: string, partial: Record<string, unknown>) => void;
  setHeroVariant: (id: string, v: 'image' | 'video' | 'minimal') => void;
}) {
  const p = (partial: Record<string, unknown>) => patchData(block.id, partial);

  switch (block.type) {
    case 'hero':
      return (
        <>
          <Field label="Style">
            <select
              value={block.variant}
              onChange={(e) => setHeroVariant(block.id, e.target.value as 'image' | 'video' | 'minimal')}
              className={inputClass}
            >
              <option value="image">Image (full-bleed)</option>
              <option value="video">Video (full-bleed autoplay)</option>
              <option value="minimal">Minimal (type on colour)</option>
            </select>
          </Field>
          {block.variant !== 'minimal' ? (
            <Field label="Media URL">
              <input
                value={block.data.mediaUrl ?? ''}
                onChange={(e) =>
                  p({ mediaUrl: e.target.value || null, mediaType: block.variant === 'video' ? 'video' : 'image' })
                }
                placeholder="https://..."
                className={inputClass}
              />
            </Field>
          ) : null}
          <Field label="Headline">
            <input value={block.data.headline} onChange={(e) => p({ headline: e.target.value })} placeholder="Defaults to the event title" className={inputClass} />
          </Field>
          <Field label="Sub-headline">
            <input value={block.data.subheadline} onChange={(e) => p({ subheadline: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Date + city line">
            <input value={block.data.dateCityLine} onChange={(e) => p({ dateCityLine: e.target.value })} placeholder="Saturday 22 August · Lagos" className={inputClass} />
          </Field>
          <Field label="Primary button text">
            <input value={block.data.ctaPrimaryText} onChange={(e) => p({ ctaPrimaryText: e.target.value })} className={inputClass} />
          </Field>
        </>
      );
    case 'editorial':
      return (
        <>
          <Field label="Body">
            <textarea value={block.data.body} onChange={(e) => p({ body: e.target.value })} rows={6} className={inputClass} />
          </Field>
          <Field label="Pull quote (optional)">
            <input value={block.data.pullQuote ?? ''} onChange={(e) => p({ pullQuote: e.target.value || null })} className={inputClass} />
          </Field>
        </>
      );
    case 'pullQuote':
      return (
        <>
          <Field label="Quote">
            <textarea value={block.data.quote} onChange={(e) => p({ quote: e.target.value })} rows={3} className={inputClass} />
          </Field>
          <Field label="Attribution">
            <input value={block.data.attribution ?? ''} onChange={(e) => p({ attribution: e.target.value || null })} className={inputClass} />
          </Field>
        </>
      );
    case 'cast':
      return (
        <>
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={block.data.useEventSpeakers}
              onChange={(e) => p({ useEventSpeakers: e.target.checked })}
            />
            Use the event&apos;s speakers automatically
          </label>
          <Field label="Layout">
            <select value={block.data.variant} onChange={(e) => p({ variant: e.target.value })} className={inputClass}>
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </Field>
          {block.data.variant === 'grid' ? (
            <Field label="Columns">
              <select value={block.data.columns} onChange={(e) => p({ columns: Number(e.target.value) })} className={inputClass}>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </Field>
          ) : null}
          {!block.data.useEventSpeakers ? (
            <PeopleEditor
              people={block.data.people}
              onChange={(people) => p({ people })}
            />
          ) : (
            <p className="text-xs text-ink-muted">Turn off the toggle above to add people manually.</p>
          )}
        </>
      );
    case 'moodboard':
      return <TilesEditor tiles={block.data.tiles} onChange={(tiles) => p({ tiles })} />;
    case 'playlist':
      return (
        <>
          <Field label="Type">
            <select value={block.data.variant} onChange={(e) => p({ variant: e.target.value })} className={inputClass}>
              <option value="embed">Embed</option>
              <option value="tracklist">Track list</option>
            </select>
          </Field>
          {block.data.variant === 'embed' ? (
            <Field label="Embed URL">
              <input
                value={block.data.embedUrl ?? ''}
                onChange={(e) => p({ embedUrl: e.target.value || null })}
                placeholder="Spotify / Apple Music / SoundCloud / YouTube embed URL"
                className={inputClass}
              />
            </Field>
          ) : (
            <TracksEditor tracks={block.data.tracks} onChange={(tracks) => p({ tracks })} />
          )}
        </>
      );
    case 'agenda':
      return (
        <Field label="Heading">
          <input value={block.data.heading} onChange={(e) => p({ heading: e.target.value })} className={inputClass} />
        </Field>
      );
    case 'tickets':
      return (
        <>
          <Field label="Heading">
            <input value={block.data.heading} onChange={(e) => p({ heading: e.target.value })} className={inputClass} />
          </Field>
          <p className="text-xs text-ink-muted">Ticket tiers are pulled from the event automatically.</p>
        </>
      );
    case 'faq':
      return <FaqEditor items={block.data.items} onChange={(items) => p({ items })} />;
    case 'brandCollab':
      return (
        <>
          <Field label="Partner name">
            <input value={block.data.partnerName} onChange={(e) => p({ partnerName: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Blurb">
            <input value={block.data.text} onChange={(e) => p({ text: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Image URL">
            <input value={block.data.imageUrl ?? ''} onChange={(e) => p({ imageUrl: e.target.value || null })} className={inputClass} />
          </Field>
          <Field label="Link URL">
            <input value={block.data.url ?? ''} onChange={(e) => p({ url: e.target.value || null })} className={inputClass} />
          </Field>
        </>
      );
    case 'location':
      return (
        <>
          <Field label="Address">
            <input value={block.data.address} onChange={(e) => p({ address: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Map embed URL (optional)">
            <input value={block.data.mapEmbedUrl ?? ''} onChange={(e) => p({ mapEmbedUrl: e.target.value || null })} className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input type="checkbox" checked={block.data.approximate} onChange={(e) => p({ approximate: e.target.checked })} />
            Approximate. Exact address sent after ticket purchase.
          </label>
        </>
      );
    default:
      return null;
  }
}

function PeopleEditor({
  people,
  onChange,
}: {
  people: { name: string; role: string | null; avatarUrl: string | null; social: string | null; bio: string | null }[];
  onChange: (v: { name: string; role: string | null; avatarUrl: string | null; social: string | null; bio: string | null }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {people.map((p, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={p.name}
            onChange={(e) => onChange(people.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            placeholder="Name"
            className={inputClass}
          />
          <input
            value={p.role ?? ''}
            onChange={(e) => onChange(people.map((x, j) => (j === i ? { ...x, role: e.target.value || null } : x)))}
            placeholder="Role"
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(people.filter((_, j) => j !== i))} aria-label="Remove" className="rounded-md p-2 text-ink-muted hover:text-[#FF9090]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...people, { name: '', role: null, avatarUrl: null, social: null, bio: null }])}
        className="text-sm font-semibold text-brand-300 hover:text-brand-200"
      >
        + Add person
      </button>
    </div>
  );
}

function TilesEditor({
  tiles,
  onChange,
}: {
  tiles: { url: string; caption: string | null }[];
  onChange: (v: { url: string; caption: string | null }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {tiles.map((t, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={t.url}
            onChange={(e) => onChange(tiles.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            placeholder="Image URL"
            className={inputClass}
          />
          <input
            value={t.caption ?? ''}
            onChange={(e) => onChange(tiles.map((x, j) => (j === i ? { ...x, caption: e.target.value || null } : x)))}
            placeholder="Caption"
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(tiles.filter((_, j) => j !== i))} aria-label="Remove" className="rounded-md p-2 text-ink-muted hover:text-[#FF9090]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...tiles, { url: '', caption: null }])} className="text-sm font-semibold text-brand-300 hover:text-brand-200">
        + Add image
      </button>
    </div>
  );
}

function TracksEditor({
  tracks,
  onChange,
}: {
  tracks: { title: string; artist: string | null }[];
  onChange: (v: { title: string; artist: string | null }[]) => void;
}) {
  return (
    <div className="space-y-2">
      {tracks.map((t, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={t.title}
            onChange={(e) => onChange(tracks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            placeholder="Title"
            className={inputClass}
          />
          <input
            value={t.artist ?? ''}
            onChange={(e) => onChange(tracks.map((x, j) => (j === i ? { ...x, artist: e.target.value || null } : x)))}
            placeholder="Artist"
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(tracks.filter((_, j) => j !== i))} aria-label="Remove" className="rounded-md p-2 text-ink-muted hover:text-[#FF9090]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...tracks, { title: '', artist: null }])} className="text-sm font-semibold text-brand-300 hover:text-brand-200">
        + Add track
      </button>
    </div>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: { q: string; a: string }[];
  onChange: (v: { q: string; a: string }[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-surface-border p-3">
          <input
            value={it.q}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
            placeholder="Question"
            className={inputClass}
          />
          <textarea
            value={it.a}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
            placeholder="Answer"
            rows={2}
            className={inputClass}
          />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-xs font-semibold text-[#FF9090]">
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { q: '', a: '' }])} className="text-sm font-semibold text-brand-300 hover:text-brand-200">
        + Add question
      </button>
    </div>
  );
}
