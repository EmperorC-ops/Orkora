'use client';

/**
 * ActionButton — a button that gives the user immediate, visible feedback for
 * an action: it flips through idle → pending → success (or error) states with
 * a matching label and icon, then settles back to idle.
 *
 * This is the reusable answer to "when any button is clicked, it should show
 * the action in hover form (like copied, sent, saved)". Wrap an async handler
 * and the button handles the transient state machine for you:
 *
 *   <ActionButton
 *     onAction={() => api.send()}
 *     idleLabel="Send test"
 *     pendingLabel="Sending…"
 *     successLabel="Sent"
 *     idleIcon={<Mail className="h-4 w-4" />}
 *   />
 *
 * The success flash lasts ~1.6s then reverts. Errors surface as a brief error
 * state; pass onError to also raise a toast. The component is intentionally
 * unopinionated about layout so it drops into existing button slots.
 */

import { useCallback, useRef, useState } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-brand-gradient text-white shadow-glow hover:opacity-95',
  secondary:
    'border border-surface-border bg-surface/40 text-ink-primary hover:bg-white/5',
  ghost: 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
  danger:
    'border border-[#FF7675]/30 bg-[#FF7675]/10 text-[#FF9090] hover:bg-[#FF7675]/15',
};

interface ActionButtonProps {
  /** The async (or sync) action to run. Throwing shows the error state. */
  onAction: () => Promise<unknown> | unknown;
  idleLabel: string;
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  idleIcon?: React.ReactNode;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  /** Fired on a thrown error so the caller can raise a toast. */
  onError?: (message: string) => void;
  /** Fired after a successful action (post-flash), e.g. to close a form. */
  onDone?: () => void;
  type?: 'button' | 'submit';
  /** How long the success/error flash lingers before reverting (ms). */
  flashMs?: number;
}

type State = 'idle' | 'pending' | 'success' | 'error';

export function ActionButton({
  onAction,
  idleLabel,
  pendingLabel,
  successLabel = 'Done',
  errorLabel = 'Failed',
  idleIcon,
  variant = 'secondary',
  className = '',
  disabled = false,
  onError,
  onDone,
  type = 'button',
  flashMs = 1600,
}: ActionButtonProps) {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (state === 'pending') return;
    if (timer.current) clearTimeout(timer.current);
    setState('pending');
    try {
      await onAction();
      setState('success');
      timer.current = setTimeout(() => {
        setState('idle');
        onDone?.();
      }, flashMs);
    } catch (err) {
      setState('error');
      onError?.(err instanceof Error ? err.message : 'Something went wrong.');
      timer.current = setTimeout(() => setState('idle'), flashMs);
    }
  }, [onAction, onDone, onError, state, flashMs]);

  const content = (() => {
    switch (state) {
      case 'pending':
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {pendingLabel ?? idleLabel}
          </>
        );
      case 'success':
        return (
          <>
            <Check className="h-4 w-4" />
            {successLabel}
          </>
        );
      case 'error':
        return (
          <>
            <X className="h-4 w-4" />
            {errorLabel}
          </>
        );
      default:
        return (
          <>
            {idleIcon}
            {idleLabel}
          </>
        );
    }
  })();

  const stateTint =
    state === 'success'
      ? 'ring-2 ring-[#00C896]/40'
      : state === 'error'
        ? 'ring-2 ring-[#FF7675]/40'
        : '';

  return (
    <button
      type={type}
      onClick={type === 'submit' ? undefined : run}
      disabled={disabled || state === 'pending'}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${VARIANT_CLASS[variant]} ${stateTint} ${className}`}
    >
      {content}
    </button>
  );
}

/**
 * CopyButton — a compact button that copies text to the clipboard and flashes
 * "Copied". Used anywhere the user needs to grab a value (share URLs, slugs,
 * API keys, event codes).
 */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = '',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const el = document.createElement('textarea');
        el.value = value;
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // no-op; value stays visible for manual copy
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface/40 px-2.5 py-1 text-xs font-semibold text-ink-secondary transition hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-300 ${className}`}
      aria-label={copied ? copiedLabel : `${label} to clipboard`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-brand-300" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
