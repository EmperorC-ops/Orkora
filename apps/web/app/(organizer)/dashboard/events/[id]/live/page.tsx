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
  MessageCircleQuestion,
  Plus,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { ActionButton } from '@/components/action-button';
import { readActiveOrgId, eventsApi, type EventSession } from '@/lib/events';
import { engagementApi, type Poll, type QaQuestion } from '@/lib/engagement';

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
    </div>
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
