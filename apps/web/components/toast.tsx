'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

interface ToastApi {
  show: (input: { tone?: Tone; title: string; body?: string; ttl?: number }) => number;
  success: (title: string, body?: string) => number;
  error: (title: string, body?: string) => number;
  info: (title: string, body?: string) => number;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Mount once near the app root. Children call `useToast()` to push.
 * Toasts stack at the bottom right and auto-dismiss after ttl ms (default 4s).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ tone = 'info', title, body, ttl = 4000 }: { tone?: Tone; title: string; body?: string; ttl?: number }) => {
      const id = seq.current++;
      setToasts((prev) => [...prev, { id, tone, title, body }]);
      if (ttl > 0) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ tone: 'success', title, body }),
      error: (title, body) => show({ tone: 'error', title, body, ttl: 6000 }),
      info: (title, body) => show({ tone: 'info', title, body }),
      dismiss,
    }),
    [show, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Not throwing because some pages render server-side; we return a no-op
    // so calling code never crashes if it sneaks past the provider.
    return {
      show: () => 0,
      success: () => 0,
      error: () => 0,
      info: () => 0,
      dismiss: () => undefined,
    };
  }
  return ctx;
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col-reverse gap-2 sm:w-96">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const tone = toast.tone;
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? XCircle : Info;
  const accent =
    tone === 'success'
      ? 'bg-[#00C896]/15 text-[#00C896] border-[#00C896]/30'
      : tone === 'error'
        ? 'bg-[#FF7675]/15 text-[#FF9090] border-[#FF7675]/30'
        : 'bg-brand-500/15 text-brand-300 border-brand-500/30';

  return (
    <div
      className={`pointer-events-auto rounded-2xl border bg-surface/95 p-4 shadow-2xl backdrop-blur transition-all duration-200 ${
        mounted ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      } ${accent}`}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 flex-none" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-primary">{toast.title}</p>
          {toast.body ? (
            <p className="mt-1 text-xs text-ink-secondary">{toast.body}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-ink-muted transition hover:text-ink-primary"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
