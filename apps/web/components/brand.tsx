/**
 * Canonical Orkora brand renderer.
 *
 * Every place the brand appears in the web app goes through this file.
 * Three variants:
 *
 *   - `lockup`  rounded-square mark + "Orkora" wordmark, composed via
 *               inline-flex. Used everywhere the brand reads as a
 *               combined identity (landing header, auth pages, OG, etc).
 *   - `mark`    rounded-square mark only. Used where space is tight
 *               (dashboard sidebar, compact footer, browser tab).
 *   - `wordmark` "Orkora" text only. Used when the mark sits adjacent
 *               in another element.
 *
 * Architectural change from the previous version: the mark is a vector
 * SVG at `apps/web/public/brand/orkora-mark.svg` and the wordmark is
 * LIVE TEXT in Inter. No more PNG crops. The mark scales perfectly to
 * every size from 16px favicon to 2048px splash screen, and the
 * wordmark inherits the page's font weight settings, can be selected
 * + copied by users, and can be recoloured per surface via CSS.
 *
 * Backwards compat: the `BrandProps` API stays the same so existing
 * callsites (className="h-20 w-auto", width={320}, priority) keep
 * working without changes. The lockup parses the height tailwind class
 * (h-N) out of className so the wordmark's font-size tracks the mark
 * height instead of the inherited body font.
 */

import Image from 'next/image';

type BrandVariant = 'lockup' | 'mark' | 'wordmark';

interface BrandProps {
  variant?: BrandVariant;
  /** Display width hint in CSS pixels. Used for next/image layout
   *  reservation only; final display size comes from the className
   *  height (e.g. h-20). */
  width?: number;
  /** Override the alt / aria-label. Defaults to "Orkora". */
  alt?: string;
  className?: string;
  /** Next/Image priority hint: true for above-the-fold renders. */
  priority?: boolean;
  /** Override the wordmark colour. Defaults to currentColor so the
   *  brand inherits the surrounding text colour - works on dark
   *  marketing pages AND the white dashboard with no per-surface
   *  variants. Pass an explicit color (e.g. '#0F172A') if you need
   *  to override the inherited value. */
  wordmarkColor?: string;
}

const MARK_SRC = '/brand/orkora-mark.svg';
const MARK_INTRINSIC = 100;

/**
 * Pull the height in CSS pixels out of a tailwind className. Tailwind
 * `h-N` is `0.25rem * N` = `4 * N px` at the default root font size,
 * which is what the marketing app uses. Falls back to undefined if no
 * `h-N` class is present so callers can specify a numeric `width` hint
 * instead.
 */
function parseHeightPx(className: string | undefined): number | undefined {
  if (!className) return undefined;
  const m = /\bh-(\d+)\b/.exec(className);
  if (!m) return undefined;
  return parseInt(m[1] ?? '0', 10) * 4;
}

export function Brand({
  variant = 'lockup',
  width,
  alt,
  className,
  priority = false,
  wordmarkColor,
}: BrandProps) {
  if (variant === 'mark') {
    const w = width ?? 32;
    return (
      <Image
        src={MARK_SRC}
        alt={alt ?? 'Orkora'}
        width={w}
        height={w}
        className={className}
        priority={priority}
      />
    );
  }

  if (variant === 'wordmark') {
    return (
      <span
        className={`inline-block font-semibold tracking-tight ${className ?? ''}`}
        style={{
          color: wordmarkColor ?? 'currentColor',
          letterSpacing: '-0.02em',
        }}
        aria-label={alt ?? 'Orkora'}
      >
        Orkora
      </span>
    );
  }

  /*
   * Lockup. The wordmark's font-size has to track the container height,
   * not the inherited body font size, otherwise `h-20` (80 px mark)
   * sits beside 16 px text. Derive a px font-size from the tailwind
   * `h-N` class on the parent (which the caller almost always passes).
   * Inter at 62% of the mark height feels balanced - cap height lines
   * up with the upper third of the mark's orchestration arcs.
   */
  const heightPx = parseHeightPx(className) ?? width ?? 32;
  const wordmarkPx = Math.round(heightPx * 0.62);

  return (
    <span
      role="img"
      aria-label={alt ?? 'Orkora'}
      className={`inline-flex items-center gap-3 ${className ?? ''}`}
    >
      <Image
        src={MARK_SRC}
        alt=""
        width={MARK_INTRINSIC}
        height={MARK_INTRINSIC}
        className="h-full w-auto"
        priority={priority}
        aria-hidden
      />
      <span
        className="font-semibold leading-none"
        style={{
          color: wordmarkColor ?? 'currentColor',
          fontSize: `${wordmarkPx}px`,
          letterSpacing: '-0.02em',
        }}
      >
        Orkora
      </span>
    </span>
  );
}

export default Brand;
