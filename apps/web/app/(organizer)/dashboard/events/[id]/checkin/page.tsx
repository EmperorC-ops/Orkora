'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/auth';
import { readActiveOrgId } from '@/lib/events';

interface CheckinResult {
  id: string;
  code: string;
  holderName: string;
  tier: string;
  status: string;
  checkedInAt: string | null;
  alreadyCheckedIn: boolean;
}

interface CheckinTierStat {
  tierId: string;
  name: string;
  issued: number;
  checkedIn: number;
}

interface CheckinStats {
  issued: number;
  checkedIn: number;
  tiers: CheckinTierStat[];
}

type Outcome =
  | { kind: 'success'; result: CheckinResult }
  | { kind: 'duplicate'; result: CheckinResult }
  | { kind: 'undone'; result: CheckinResult }
  | { kind: 'error'; message: string }
  | null;

const COOL_DOWN_MS = 1500;

export default function CheckinPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const [orgId, setOrgId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<{ destroy: () => void } | null>(null);
  const lastSeenRef = useRef<{ token: string; t: number }>({ token: '', t: 0 });

  const [scanning, setScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [stats, setStats] = useState<CheckinStats | null>(null);

  useEffect(() => {
    setOrgId(readActiveOrgId());
  }, []);

  // Fetch the live checked-in / issued counts. Called by the poller and, for
  // an instant update, right after every check-in.
  const refreshStats = useCallback(async () => {
    if (!orgId || !eventId) return;
    try {
      const s = await apiFetch<CheckinStats>(
        `/v1/organizations/${orgId}/events/${eventId}/checkin/stats`,
      );
      setStats(s);
    } catch {
      // ignore polling errors
    }
  }, [orgId, eventId]);

  // Live stats polling. Cheap because the rows are indexed. The post-check-in
  // refresh keeps the count instant; the poll catches other staff's scans.
  useEffect(() => {
    if (!orgId || !eventId) return;
    void refreshStats();
    const t = setInterval(() => void refreshStats(), 5_000);
    return () => clearInterval(t);
  }, [orgId, eventId, refreshStats]);

  async function startScanner() {
    setScannerError(null);
    if (!videoRef.current) return;
    const video = videoRef.current;

    const QrScannerModule = await import('qr-scanner');
    const QrScanner = QrScannerModule.default;

    // If the device has no camera at all (common on a desktop PC), say so
    // plainly instead of a generic "could not access" so the operator knows to
    // switch to a phone or use the paste-a-token fallback below.
    const hasCamera = await QrScanner.hasCamera().catch(() => false);
    if (!hasCamera) {
      setScannerError(
        'No camera found on this device. Open this check-in page on a phone or tablet, or paste a ticket token below.',
      );
      return;
    }

    const build = (preferredCamera: 'environment' | 'user') =>
      new QrScanner(
        video,
        (r) => {
          handleScan(typeof r === 'string' ? r : r.data);
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 4,
          preferredCamera,
        },
      );

    // Prefer the rear ('environment') camera for scanning at a door, but many
    // laptops only have a front ('user') camera, and qr-scanner reports
    // "Camera not found." when the preferred facing mode cannot be satisfied.
    // Fall back to the front camera before giving up.
    try {
      const scanner = build('environment');
      await scanner.start();
      scannerRef.current = scanner;
      setScanning(true);
      return;
    } catch {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    }
    try {
      const scanner = build('user');
      await scanner.start();
      scannerRef.current = scanner;
      setScanning(true);
    } catch (err) {
      scannerRef.current?.destroy();
      scannerRef.current = null;
      const detail =
        err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      setScannerError(
        detail
          ? `Could not start the camera: ${detail}`
          : 'Could not access the camera. Allow camera permission and try again.',
      );
    }
  }

  function stopScanner() {
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => stopScanner(), []);

  function handleScan(token: string) {
    if (!token) return;
    const now = Date.now();
    if (lastSeenRef.current.token === token && now - lastSeenRef.current.t < COOL_DOWN_MS) {
      return; // duplicate frame within cool-down
    }
    lastSeenRef.current = { token, t: now };
    void submit(token);
  }

  async function submit(qrToken: string) {
    if (!orgId || !eventId) return;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await apiFetch<CheckinResult>(
        `/v1/organizations/${orgId}/events/${eventId}/checkin`,
        { method: 'POST', json: { qrToken } },
      );
      setOutcome({
        kind: result.alreadyCheckedIn ? 'duplicate' : 'success',
        result,
      });
      // Instant count update so staff see progress without waiting for the poll.
      void refreshStats();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? prettify(err)
          : (err as Error).message ?? 'Check-in failed.';
      setOutcome({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  // Manual entry accepts either the short ticket code (typed by hand) or a full
  // signed QR token (base64url.base64url, which contains a dot). Route by shape.
  function submitManual(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (value.includes('.')) void submit(value);
    else void submitByCode(value);
  }

  async function submitByCode(code: string) {
    if (!orgId || !eventId) return;
    setBusy(true);
    setOutcome(null);
    try {
      const result = await apiFetch<CheckinResult>(
        `/v1/organizations/${orgId}/events/${eventId}/checkin/by-code`,
        { method: 'POST', json: { code } },
      );
      setOutcome({
        kind: result.alreadyCheckedIn ? 'duplicate' : 'success',
        result,
      });
      // Instant count update so staff see progress without waiting for the poll.
      void refreshStats();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? prettify(err)
          : (err as Error).message ?? 'Check-in failed.';
      setOutcome({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  async function undoLast(ticketId: string) {
    if (!orgId || !eventId) return;
    setBusy(true);
    try {
      const result = await apiFetch<CheckinResult>(
        `/v1/organizations/${orgId}/events/${eventId}/checkin/undo`,
        { method: 'POST', json: { ticketId } },
      );
      setOutcome({ kind: 'undone', result });
      void refreshStats();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? prettify(err)
          : (err as Error).message ?? 'Could not undo.';
      setOutcome({ kind: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  function prettify(err: ApiError): string {
    try {
      const parsed = JSON.parse(err.message) as { detail?: string };
      if (parsed.detail) return parsed.detail;
    } catch {
      // not json
    }
    if (err.status === 400) return 'Invalid or wrong-event ticket.';
    if (err.status === 404) return 'Ticket not found.';
    return err.message || 'Check-in failed.';
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/events/${eventId}`}
        className="inline-flex items-center gap-2 text-sm text-ink-secondary transition hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-300">Check-in</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Scan tickets at the door</h1>
        </div>
        <CheckinStatsCard stats={stats} />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
          <div className="aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            {scanning ? (
              <button
                type="button"
                onClick={stopScanner}
                className="inline-flex items-center gap-2 rounded-full border border-surface-border px-5 py-2 text-sm font-semibold text-ink-primary transition hover:bg-white/5"
              >
                <CameraOff className="h-4 w-4" /> Stop scanner
              </button>
            ) : (
              <button
                type="button"
                onClick={startScanner}
                className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
              >
                <Camera className="h-4 w-4" /> Start scanner
              </button>
            )}
            {scannerError ? (
              <p className="text-xs text-[#FF9090]">{scannerError}</p>
            ) : (
              <p className="text-xs text-ink-muted">
                Allow camera permission, point at the attendee&apos;s ticket QR.
              </p>
            )}
          </div>

          <details className="mt-6 rounded-xl border border-surface-border bg-surface-deep/40 p-4" open>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Or enter a ticket code
            </summary>
            <p className="mt-2 text-xs text-ink-muted">
              Type the short code printed on the ticket (for example AB12CD). No camera needed.
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitManual(manualToken);
                setManualToken('');
              }}
            >
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Ticket code"
                autoCapitalize="characters"
                autoComplete="off"
                className="flex-1 rounded-lg border border-surface-border bg-surface-deep/60 px-3 py-2 text-sm uppercase tracking-wider text-ink-primary placeholder-ink-muted outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!manualToken || busy}
                className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Check in
              </button>
            </form>
          </details>
        </div>

        <aside className="rounded-2xl border border-surface-border bg-surface/40 p-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Last scan
          </h3>
          <div className="mt-4 min-h-[160px]">
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
              </div>
            ) : !outcome ? (
              <p className="text-sm text-ink-muted">Waiting for a scan.</p>
            ) : outcome.kind === 'success' ? (
              <>
                <ScanResult tone="success" result={outcome.result} title="Checked in" />
                <UndoButton
                  disabled={busy}
                  onUndo={() => void undoLast(outcome.result.id)}
                />
              </>
            ) : outcome.kind === 'duplicate' ? (
              <>
                <ScanResult tone="warm" result={outcome.result} title="Already checked in" />
                <UndoButton
                  disabled={busy}
                  onUndo={() => void undoLast(outcome.result.id)}
                />
              </>
            ) : outcome.kind === 'undone' ? (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-border text-ink-secondary">
                  <ArrowLeft className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink-primary">Check-in undone</div>
                  <div className="mt-1 text-sm text-ink-secondary">
                    {outcome.result.holderName} is no longer checked in.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#FF7675]/15 text-[#FF9090]">
                  <XCircle className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink-primary">Check-in failed</div>
                  <div className="mt-1 text-sm text-ink-secondary">{outcome.message}</div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function CheckinStatsCard({ stats }: { stats: CheckinStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface/40 px-4 py-2 text-xs text-ink-muted">
        Loading...
      </div>
    );
  }
  const pct = stats.issued ? Math.round((stats.checkedIn / stats.issued) * 100) : 0;
  const remaining = Math.max(0, stats.issued - stats.checkedIn);
  return (
    <div className="rounded-xl border border-surface-border bg-surface/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
          <Users className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">Checked in</div>
          <div className="text-lg font-semibold leading-tight text-ink-primary">
            {stats.checkedIn}{' '}
            <span className="text-sm font-normal text-ink-muted">
              of {stats.issued} ({pct}%)
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-border">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-ink-muted">
        {remaining === 0 ? 'Everyone is in' : `${remaining} still to arrive`}
      </div>

      {stats.tiers.length > 1 && (
        <div className="mt-3 space-y-2 border-t border-surface-border pt-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-muted">By tier</div>
          {stats.tiers.map((t) => {
            const tpct = t.issued ? Math.round((t.checkedIn / t.issued) * 100) : 0;
            return (
              <div key={t.tierId}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-ink-secondary">{t.name}</span>
                  <span className="flex-none font-semibold text-ink-primary">
                    {t.checkedIn}/{t.issued}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-border">
                  <div
                    className="h-full rounded-full bg-brand-400 transition-all duration-500"
                    style={{ width: `${tpct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UndoButton({ disabled, onUndo }: { disabled: boolean; onUndo: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onUndo}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-deep/40 px-3 py-1.5 text-xs font-semibold text-ink-secondary transition hover:border-[#FF7675]/40 hover:text-[#FF9090] disabled:opacity-50"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Undo check-in
    </button>
  );
}

function ScanResult({
  tone,
  result,
  title,
}: {
  tone: 'success' | 'warm';
  result: CheckinResult;
  title: string;
}) {
  const t =
    tone === 'success'
      ? 'bg-[#00C896]/15 text-[#00C896]'
      : 'bg-[#FF7675]/15 text-[#FF9090]';
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full ${t}`}>
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-semibold text-ink-primary">{title}</div>
        <div className="mt-1 text-base text-ink-primary">{result.holderName}</div>
        <div className="text-xs text-ink-secondary">
          {result.tier} <span className="text-ink-muted"> &middot; {result.code}</span>
        </div>
        {result.checkedInAt ? (
          <div className="mt-1 text-xs text-ink-muted">
            {new Date(result.checkedInAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
