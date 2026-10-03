'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  HelpCircle,
  Megaphone,
  MessageSquare,
  Send,
  Users,
  Vote,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';

interface Message {
  id: string;
  body: string;
  createdAt: string;
  replyToId: string | null;
  // Public live feed: the API sends a redacted display name (first name + last
  // initial) and no internal user id.
  user: { fullName: string; avatarUrl: string | null };
}

interface PollOption {
  id: string;
  label: string;
  votes: number;
}

interface PollView {
  id: string;
  sessionId: string;
  question: string;
  options: PollOption[];
  status: string;
  multiSelect: boolean;
  totalVotes: number;
  session: { id: string; title: string } | null;
}

interface QuestionView {
  id: string;
  body: string;
  createdAt: string;
  upvotes: number;
  hasUpvoted: boolean;
  user: { fullName: string; avatarUrl: string | null };
  replies: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { fullName: string; avatarUrl: string | null };
  }>;
}

interface Spotlight {
  kind: 'announcement' | 'link' | 'video';
  title: string | null;
  body: string | null;
  url: string | null;
  active: boolean;
  updatedAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Turn a YouTube or Vimeo watch URL into an embeddable one, mirroring the
// recordings /watch parser. Returns null for anything not embeddable, so the
// spotlight falls back to a plain link.
function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const m = u.pathname.match(/^\/(embed|live|shorts)\/([^/]+)/);
    if (m) return `https://www.youtube.com/embed/${m[2]}`;
    return null;
  }
  if (host === 'vimeo.com') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === 'player.vimeo.com') return raw;
  return null;
}

interface PublicEventLite {
  id: string;
  code: string;
  title: string;
}

export default function LiveEngagementPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const [event, setEvent] = useState<PublicEventLite | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [polls, setPolls] = useState<PollView[]>([]);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [presence, setPresence] = useState<number>(0);
  const [draft, setDraft] = useState('');
  const [qDraft, setQDraft] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load the event header.
  useEffect(() => {
    fetch(`${API}/v1/events/by-code/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? (r.json() as Promise<PublicEventLite>) : Promise.reject()))
      .then(setEvent)
      .catch(() => null);
  }, [code]);

  // Connect when we have the event id and a token.
  useEffect(() => {
    if (!event) return;
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
    // Attendees reach the room straight from their ticket link (/live?t=CODE);
    // the ticket code is the credential, so no login is required. Fall back to a
    // signed-in token (organizers, logged-in users), then to the sign-in gate.
    const ticketCode =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('t')
        : null;
    const cred: { ticket: string } | { token: string } | null = ticketCode
      ? { ticket: ticketCode }
      : token
        ? { token }
        : null;
    if (!cred) {
      setSignedOut(true);
      return;
    }

    // Bootstrap recent messages and active polls via REST.
    fetch(`${API}/v1/events/${event.id}/engagement/chat`)
      .then((r) => r.json() as Promise<{ channelId: string; messages: Message[] }>)
      .then((data) => {
        setChannelId(data.channelId);
        setMessages(data.messages);
      })
      .catch(() => null);
    fetch(`${API}/v1/events/${event.id}/engagement/polls`)
      .then((r) => r.json() as Promise<PollView[]>)
      .then(setPolls)
      .catch(() => null);
    fetch(`${API}/v1/events/${event.id}/engagement/questions`)
      .then((r) => r.json() as Promise<QuestionView[]>)
      .then(setQuestions)
      .catch(() => null);
    fetch(`${API}/v1/events/${event.id}/engagement/spotlight`)
      .then((r) => r.json() as Promise<Spotlight | null>)
      .then(setSpotlight)
      .catch(() => null);

    const socket = io(`${API}/engagement`, {
      auth: cred,
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit(
        'chat:join',
        { eventId: event.id },
        (resp: { ok: boolean; channelId?: string; recent?: Message[] }) => {
          if (resp?.ok && resp.recent) setMessages(resp.recent);
          if (resp?.channelId) setChannelId(resp.channelId);
        },
      );
    });
    socket.on('chat:message', (m: Message) => {
      setMessages((prev) => [...prev, m]);
    });
    socket.on('poll:update', (p: PollView) => {
      setPolls((prev) => {
        const idx = prev.findIndex((x) => x.id === p.id);
        if (idx === -1) return [...prev, p];
        const next = [...prev];
        next[idx] = p;
        return next;
      });
    });
    socket.on('presence', (data: { eventId: string; count: number }) => {
      if (data.eventId === event.id) setPresence(data.count);
    });
    socket.on('qa:list', (list: QuestionView[]) => {
      setQuestions(list);
    });
    socket.on('spotlight:update', (s: Spotlight | null) => {
      setSpotlight(s);
    });
    socket.on('chat:deleted', (d: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== d.id));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [event]);

  // Auto-scroll the chat to bottom on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body || !channelId || !event || !socketRef.current) return;
    socketRef.current.emit('chat:message', {
      eventId: event.id,
      channelId,
      body,
    });
    setDraft('');
  }

  function vote(pollId: string, optionId: string) {
    if (!event || !socketRef.current) return;
    socketRef.current.emit('poll:vote', {
      eventId: event.id,
      pollId,
      optionIds: [optionId],
    });
  }

  function askQuestion() {
    const body = qDraft.trim();
    if (!body || !event || !socketRef.current) return;
    socketRef.current.emit('qa:ask', { eventId: event.id, body });
    setQDraft('');
  }

  function upvoteQuestion(questionId: string) {
    if (!event || !socketRef.current) return;
    socketRef.current.emit('qa:upvote', { eventId: event.id, questionId });
  }

  if (signedOut) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center">
          <p className="text-base font-semibold text-ink-primary">
            Register to join the live room.
          </p>
          <p className="mt-2 text-sm text-ink-secondary">
            Follow along, ask questions, and vote from your phone. Register for this event, then
            open the live room from your ticket.
          </p>
          <Link
            href={`/e/${code}/register`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-7 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            Register for this event
          </Link>
          <p className="mt-4 text-xs text-ink-muted">
            Already registered? Open the live room from the link on your ticket or in your
            confirmation email.
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Have an account?{' '}
            <Link
              href={`/login?next=/e/${code}/live`}
              className="font-semibold text-brand-300 transition hover:text-brand-200"
            >
              Sign in
            </Link>
          </p>
        </div>
      </Wrapper>
    );
  }

  if (!event) {
    return (
      <Wrapper>
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-10 text-center text-sm text-ink-secondary">
          Loading...
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Link
        href={`/e/${event.code}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Live</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.title}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-surface-border bg-surface/40 px-4 py-2 text-xs text-ink-secondary">
          <Users className="h-3.5 w-3.5 text-brand-300" />
          {presence} live
        </div>
      </header>

      {spotlight ? (
        <section className="mb-8 rounded-2xl border border-brand-500/30 bg-brand-500/10 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-200">
            <Megaphone className="h-4 w-4" /> On screen now
          </p>
          {spotlight.title ? (
            <h2 className="mt-2 text-lg font-semibold text-ink-primary">{spotlight.title}</h2>
          ) : null}
          {spotlight.body ? (
            <p className="mt-1 whitespace-pre-line text-sm text-ink-secondary">{spotlight.body}</p>
          ) : null}
          {spotlight.kind === 'video' && spotlight.url && toEmbedUrl(spotlight.url) ? (
            <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-surface-border">
              <iframe
                src={toEmbedUrl(spotlight.url) as string}
                title={spotlight.title ?? 'Live video'}
                className="h-full w-full"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : spotlight.url ? (
            <a
              href={spotlight.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
            >
              <ExternalLink className="h-4 w-4" /> Open link
            </a>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
        <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <MessageSquare className="h-3 w-3" /> Chat
          </h2>
          <div
            ref={scrollRef}
            className="mt-4 h-[420px] space-y-3 overflow-y-auto rounded-xl bg-surface-deep/40 p-4"
          >
            {messages.length === 0 ? (
              <p className="pt-32 text-center text-sm text-ink-muted">
                No messages yet. Be the first to say hello.
              </p>
            ) : (
              messages.map((m) => <ChatBubble key={m.id} m={m} />)
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Say something..."
              className="flex-1 rounded-full border border-surface-border bg-surface-deep/60 px-4 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <HelpCircle className="h-3 w-3" /> Questions
          </h2>
          <div className="mt-4 flex gap-2">
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  askQuestion();
                }
              }}
              placeholder="Ask the speaker something..."
              className="flex-1 rounded-full border border-surface-border bg-surface-deep/60 px-4 py-2 text-sm text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
            />
            <button
              type="button"
              onClick={askQuestion}
              disabled={!qDraft.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Ask
            </button>
          </div>
          <ul className="mt-5 space-y-3">
            {questions.length === 0 ? (
              <li className="rounded-xl border border-dashed border-surface-border bg-surface-deep/40 p-6 text-center text-sm text-ink-muted">
                No questions yet. Be the first to ask.
              </li>
            ) : (
              questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  onUpvote={() => upvoteQuestion(q.id)}
                />
              ))
            )}
          </ul>
        </section>
        </div>

        <aside className="rounded-2xl border border-surface-border bg-surface/40 p-5">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <Vote className="h-3 w-3" /> Polls
          </h2>
          <div className="mt-4 space-y-4">
            {polls.length === 0 ? (
              <p className="text-sm text-ink-muted">No polls yet.</p>
            ) : (
              polls.map((p) => (
                <PollCard key={p.id} poll={p} onVote={(oid) => vote(p.id, oid)} />
              ))
            )}
          </div>
        </aside>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-surface-deep text-ink-primary">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[420px] w-[920px] -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 py-12">{children}</div>
    </main>
  );
}

function QuestionCard({
  q,
  onUpvote,
}: {
  q: QuestionView;
  onUpvote: () => void;
}) {
  const initial = q.user.fullName.trim().charAt(0).toUpperCase() || '?';
  return (
    <li className="rounded-xl border border-surface-border bg-surface-deep/40 p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onUpvote}
          className={`flex flex-none flex-col items-center justify-center rounded-lg px-3 py-2 transition ${
            q.hasUpvoted
              ? 'bg-brand-500 text-white'
              : 'bg-surface/60 text-ink-secondary hover:bg-brand-500/15 hover:text-brand-300'
          }`}
        >
          <ArrowUp className="h-3.5 w-3.5" />
          <span className="mt-0.5 text-xs font-bold">{q.upvotes}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[10px] font-bold text-white">
              {initial}
            </span>
            <span className="truncate text-xs font-semibold text-ink-primary">
              {q.user.fullName}
            </span>
            <span className="text-[10px] text-ink-muted">
              {new Date(q.createdAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="mt-2 break-words text-sm text-ink-primary">{q.body}</p>
          {q.replies.length > 0 ? (
            <ul className="mt-3 space-y-2 border-l-2 border-surface-border pl-3">
              {q.replies.map((r) => (
                <li key={r.id} className="text-xs">
                  <span className="font-semibold text-brand-300">{r.user.fullName}</span>{' '}
                  <span className="text-ink-secondary">{r.body}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ChatBubble({ m }: { m: Message }) {
  const initial = m.user.fullName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
        {initial}
      </span>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-ink-primary">{m.user.fullName}</span>
          <span className="text-[10px] text-ink-muted">
            {new Date(m.createdAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="mt-1 break-words text-sm text-ink-secondary">{m.body}</p>
      </div>
    </div>
  );
}

function PollCard({ poll, onVote }: { poll: PollView; onVote: (optionId: string) => void }) {
  const total = poll.totalVotes || 1;
  const closed = poll.status !== 'open';
  return (
    <div className="rounded-xl border border-surface-border bg-surface-deep/40 p-4">
      {poll.session ? (
        <p className="text-[10px] uppercase tracking-wider text-ink-muted">{poll.session.title}</p>
      ) : null}
      <p className="mt-1 text-sm font-semibold text-ink-primary">{poll.question}</p>
      <div className="mt-3 space-y-2">
        {poll.options.map((o) => {
          const pct = Math.round((o.votes / total) * 100);
          return (
            <button
              key={o.id}
              type="button"
              disabled={closed}
              onClick={() => onVote(o.id)}
              className="group relative w-full overflow-hidden rounded-lg border border-surface-border bg-surface/40 px-3 py-2 text-left transition hover:border-brand-500/40 disabled:cursor-default disabled:opacity-70"
            >
              <span
                className="absolute inset-y-0 left-0 bg-brand-500/15 transition-all"
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between text-xs">
                <span className="text-ink-primary">{o.label}</span>
                <span className="text-ink-muted">
                  {o.votes} <span className="text-ink-muted">({pct}%)</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-ink-muted">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
        {closed ? ' / closed' : ''}
      </p>
    </div>
  );
}
