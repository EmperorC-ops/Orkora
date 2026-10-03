'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  ListChecks,
  Megaphone,
  MessageCircleQuestion,
  MessageSquare,
  Plus,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { readActiveOrgId, eventsApi, type EventSession } from '@/lib/events';
import {
  engagementApi,
  type ChatMessageMod,
  type Poll,
  type QaQuestion,
  type Spotlight,
  type SpotlightKind,
} from '@/lib/engagement';

export default function LiveControlPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<EventSession[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  const refreshPolls = useCallback(async () => {
    if (!orgId || !eventId) return;
    try {
      const list = await engagementApi(orgId).listPolls(eventId);
      setPolls(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, eventId]);

  const refreshQuestions = useCallback(async () => {
    if (!orgId || !eventId) return;
    try {
      const list = await engagementApi(orgId).listQuestionsOrganizer(eventId);
      setQuestions(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [orgId, eventId]);

  useEffect(() => {
    if (!orgId || !eventId) return;
    eventsApi(orgId)
      .get(eventId)
      .then((detail) => setSessions(detail.sessions))
      .catch((err: Error) => setError(err.message));
    refreshPolls();
    refreshQuestions();
  }, [orgId, eventId, refreshPolls, refreshQuestions]);

  return (
    <div className="space-y-8 text-ink-primary">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Live</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Live control</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Launch polls and moderate audience questions while your event is running.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-[#FF7675]/30 bg-[#FF7675]/5 p-4 text-sm text-[#FF9090]">
          {error}
        </div>
      )}

      <SpotlightSection orgId={orgId} eventId={eventId} onError={setError} />

      <PollsSection
        orgId={orgId}
        eventId={eventId}
        sessions={sessions}
        polls={polls}
        onChanged={refreshPolls}
        onError={setError}
      />

      <QaSection
        orgId={orgId}
        eventId={eventId}
        questions={questions}
        onChanged={refreshQuestions}
        onError={setError}
      />

      <ChatSection orgId={orgId} eventId={eventId} onError={setError} />
    </div>
  );
}

/* -------------------------------- chat -------------------------------- */

function ChatSection({
  orgId,
  eventId,
  onError,
}: {
  orgId: string | null;
  eventId: string;
  onError: (message: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessageMod[]>([]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      setMessages(await engagementApi(orgId).listChat(eventId));
    } catch (err) {
      onError((err as Error).message);
    }
  }, [orgId, eventId, onError]);

  // Chat moves quickly, so poll while the console is open.
  useEffect(() => {
    if (!orgId) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [orgId, refresh]);

  const remove = async (messageId: string) => {
    if (!orgId) throw new Error('No active organization');
    await engagementApi(orgId).deleteChatMessage(eventId, messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-brand-300" />
        <h2 className="text-lg font-semibold text-ink-primary">Chat</h2>
      </div>
      <p className="mt-1 text-sm text-ink-secondary">
        The live audience chat. Remove a message to drop it from everyone&apos;s screen.
      </p>

      <div className="mt-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-secondary">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-surface-border bg-surface-deep/30 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-200">
                  {m.authorName ?? 'Guest'}
                </p>
                <p className="mt-0.5 break-words text-sm text-ink-primary">{m.body}</p>
              </div>
              <ActionButton
                onAction={() => remove(m.id)}
                onError={onError}
                idleLabel="Delete"
                pendingLabel="Deleting…"
                successLabel="Deleted"
                idleIcon={<Trash2 className="h-3.5 w-3.5" />}
                variant="danger"
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ----------------------------- spotlight ----------------------------- */

function SpotlightSection({
  orgId,
  eventId,
  onError,
}: {
  orgId: string | null;
  eventId: string;
  onError: (message: string) => void;
}) {
  const [kind, setKind] = useState<SpotlightKind>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [current, setCurrent] = useState<Spotlight | null>(null);

  useEffect(() => {
    if (!orgId) return;
    engagementApi(orgId)
      .getSpotlight(eventId)
      .then(setCurrent)
      .catch(() => null);
  }, [orgId, eventId]);

  const show = async () => {
    if (!orgId) throw new Error('No active organization');
    const t = title.trim();
    const b = body.trim();
    const u = url.trim();
    if (kind === 'announcement' && !t && !b) throw new Error('Add a title or a message');
    if ((kind === 'link' || kind === 'video') && !u) throw new Error('Add a link');
    if ((kind === 'link' || kind === 'video') && !/^https?:\/\/\S+$/i.test(u)) {
      throw new Error('The link must be a full URL starting with https://');
    }
    const saved = await engagementApi(orgId).setSpotlight(eventId, {
      kind,
      title: t || undefined,
      body: kind === 'announcement' ? b || undefined : undefined,
      url: kind === 'announcement' ? undefined : u || undefined,
    });
    setCurrent(saved);
  };

  const clear = async () => {
    if (!orgId) throw new Error('No active organization');
    await engagementApi(orgId).clearSpotlight(eventId);
    setCurrent(null);
  };

  const inputClass =
    'w-full rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500/50 focus:outline-none';

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-brand-300" />
        <h2 className="text-lg font-semibold text-ink-primary">On screen now</h2>
      </div>
      <p className="mt-1 text-sm text-ink-secondary">
        Push an announcement, a link, or a video to every participant&apos;s live screen.
      </p>

      {current ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm">
          <span className="text-ink-secondary">
            Live now:{' '}
            <span className="font-semibold text-ink-primary">
              {current.title || current.url || current.body}
            </span>{' '}
            <span className="text-ink-muted">({current.kind})</span>
          </span>
          <ActionButton
            onAction={clear}
            onError={onError}
            idleLabel="Clear from screen"
            pendingLabel="Clearing…"
            successLabel="Cleared"
            variant="danger"
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-muted">Nothing on screen right now.</p>
      )}

      <div className="mt-5 space-y-4 rounded-2xl border border-surface-border bg-surface-deep/30 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Type
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SpotlightKind)}
            className={inputClass}
          >
            <option value="announcement">Announcement</option>
            <option value="link">Link</option>
            <option value="video">Video (YouTube or Vimeo)</option>
          </select>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          maxLength={120}
          className={inputClass}
        />

        {kind === 'announcement' ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Message to show on screen"
            className={inputClass}
          />
        ) : (
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            inputMode="url"
            className={inputClass}
          />
        )}

        <ActionButton
          onAction={show}
          onError={onError}
          idleLabel="Show on screen"
          pendingLabel="Sending…"
          successLabel="On screen"
          idleIcon={<Megaphone className="h-4 w-4" />}
          variant="primary"
          className="rounded-full px-5 py-2 text-sm font-semibold"
        />
      </div>
    </section>
  );
}

/* ------------------------------- polls ------------------------------- */

function PollsSection({
  orgId,
  eventId,
  sessions,
  polls,
  onChanged,
  onError,
}: {
  orgId: string | null;
  eventId: string;
  sessions: EventSession[];
  polls: Poll[];
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiSelect, setMultiSelect] = useState(false);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) setSessionId(sessions[0].id);
  }, [sessions, sessionId]);

  const setOption = (i: number, value: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  const addOption = () => setOptions((prev) => (prev.length >= 8 ? prev : [...prev, '']));
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const createPoll = async () => {
    if (!orgId) throw new Error('No active organization');
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) throw new Error('Add a question');
    if (cleaned.length < 2) throw new Error('Add at least two options');
    if (!sessionId) throw new Error('Pick a session');
    await engagementApi(orgId).createPoll(eventId, {
      sessionId,
      question: question.trim(),
      options: cleaned,
      multiSelect,
    });
    setQuestion('');
    setOptions(['', '']);
    setMultiSelect(false);
    await onChanged();
  };

  const closePoll = async (pollId: string) => {
    if (!orgId) throw new Error('No active organization');
    await engagementApi(orgId).closePoll(eventId, pollId);
    await onChanged();
  };

  const inputClass =
    'w-full rounded-xl border border-surface-border bg-surface-deep/40 px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500/50 focus:outline-none';

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-brand-300" />
        <h2 className="text-lg font-semibold text-ink-primary">Polls</h2>
      </div>

      <div className="mt-5 space-y-4 rounded-2xl border border-surface-border bg-surface-deep/30 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Session
          </label>
          {sessions.length > 0 ? (
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className={inputClass}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-ink-secondary">
              Add a session to this event before creating a poll.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Question
          </label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should we ask the room?"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Options
          </label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  disabled={options.length <= 2}
                  className="rounded-lg border border-surface-border p-2 text-ink-muted transition hover:text-ink-primary disabled:opacity-40"
                  aria-label="Remove option"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            disabled={options.length >= 8}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-300 transition hover:text-brand-200 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add option
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={multiSelect}
            onChange={(e) => setMultiSelect(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-deep/40"
          />
          Allow multiple choices
        </label>

        <ActionButton
          onAction={createPoll}
          idleLabel="Create poll"
          pendingLabel="Creating..."
          successLabel="Created"
          variant="primary"
          idleIcon={<Plus className="h-4 w-4" />}
          onError={onError}
          disabled={sessions.length === 0}
        />
      </div>

      <div className="mt-5 space-y-3">
        {polls.length === 0 ? (
          <p className="text-sm text-ink-secondary">No polls yet.</p>
        ) : (
          polls.map((poll) => (
            <div
              key={poll.id}
              className="rounded-xl border border-surface-border bg-surface-deep/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-primary">{poll.question}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {poll.session?.title ?? 'Session'} · {poll.totalVotes} vote
                    {poll.totalVotes === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      poll.status === 'open'
                        ? 'bg-[#34D399]/10 text-[#34D399]'
                        : 'bg-surface-border/60 text-ink-muted'
                    }`}
                  >
                    {poll.status}
                  </span>
                  {poll.status === 'open' && (
                    <ActionButton
                      onAction={() => closePoll(poll.id)}
                      idleLabel="Close"
                      pendingLabel="Closing..."
                      successLabel="Closed"
                      variant="secondary"
                      onError={onError}
                    />
                  )}
                </div>
              </div>
              <ul className="mt-3 space-y-1.5">
                {poll.options.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between text-sm text-ink-secondary"
                  >
                    <span>{o.label}</span>
                    <span className="font-semibold text-ink-primary">{o.votes}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* -------------------------------- Q&A -------------------------------- */

function QaSection({
  orgId,
  eventId,
  questions,
  onChanged,
  onError,
}: {
  orgId: string | null;
  eventId: string;
  questions: QaQuestion[];
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const toggleAnswered = async (q: QaQuestion) => {
    if (!orgId) throw new Error('No active organization');
    await engagementApi(orgId).setQuestionAnswered(eventId, q.id, !q.answeredAt);
    await onChanged();
  };

  const toggleHidden = async (q: QaQuestion) => {
    if (!orgId) throw new Error('No active organization');
    await engagementApi(orgId).setQuestionHidden(eventId, q.id, !q.hidden);
    await onChanged();
  };

  return (
    <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
      <div className="flex items-center gap-2">
        <MessageCircleQuestion className="h-5 w-5 text-brand-300" />
        <h2 className="text-lg font-semibold text-ink-primary">Q&amp;A moderation</h2>
      </div>

      <div className="mt-5 space-y-3">
        {questions.length === 0 ? (
          <p className="text-sm text-ink-secondary">No questions yet.</p>
        ) : (
          questions.map((q) => (
            <div
              key={q.id}
              className={`rounded-xl border border-surface-border bg-surface-deep/40 p-4 ${
                q.hidden ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="h-3.5 w-3.5" /> {q.upvotes}
                </span>
                {q.answeredAt && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#34D399]/10 px-2 py-0.5 font-semibold text-[#34D399]">
                    <CheckCircle2 className="h-3 w-3" /> Answered
                  </span>
                )}
                {q.hidden && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FF7675]/10 px-2 py-0.5 font-semibold text-[#FF9090]">
                    <Trash2 className="h-3 w-3" /> Hidden
                  </span>
                )}
                {q.authorName && <span className="ml-auto">{q.authorName}</span>}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-primary">{q.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton
                  onAction={() => toggleAnswered(q)}
                  idleLabel={q.answeredAt ? 'Unmark' : 'Mark answered'}
                  pendingLabel="Saving..."
                  successLabel="Saved"
                  variant="secondary"
                  idleIcon={<CheckCircle2 className="h-4 w-4" />}
                  onError={onError}
                />
                <ActionButton
                  onAction={() => toggleHidden(q)}
                  idleLabel={q.hidden ? 'Unhide' : 'Hide'}
                  pendingLabel="Saving..."
                  successLabel="Saved"
                  variant={q.hidden ? 'secondary' : 'danger'}
                  idleIcon={
                    q.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />
                  }
                  onError={onError}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
