/**
 * Canonical Orkora brand renderer.
 *
 * Every place the brand appears in the web app goes through this file so the
 * proportions, alt text, and asset choice stay aligned. Three variants:
 *
 *   - `lockup`  symbol + wordmark composed side-by-side. Both pieces are
 *               transparent PNGs, so the lockup lays on any background
 *               (dark marketing, white dashboard, white email body) without
 *               a baked-in plate.
 *   - `mark`    symbol only, no wordmark. Use in tight spaces (dashboard nav,
 *               compact footers, mobile chrome, browser tab).
 *   - `wordmark` "Orkora" wordmark only. Use when the symbol sits next to it
 *               in another element and you need just the typography (legal
 *               layout header, footer link rows).
 *
 * Asset files live in apps/web/public/brand/. The symbol PNG and wordmark PNG
 * are transparent crops of the master lockup so they lay cleanly on white
 * dashboard surfaces AND the dark marketing background without a second
 * variant per surface. The lockup variant composes those two transparent
 * assets at render time so the navy plate that ships with the original
 * master file never appears.
 */

import Image from 'next/image';

type BrandVariant = 'lockup' | 'mark' | 'wordmark';

interface BrandProps {
  variant?: BrandVariant;
  /** Display width in CSS pixels. The component sets the height per the
   *  variant's natural aspect ratio so consumers do not have to know it.
   *  For the `lockup` variant this hint is used only for SSR layout
   *  reservation; final display size is driven by the `className` height
   *  (e.g. `h-20 w-auto`), so the two pieces always scale together. */
  width?: number;
  /** Override the alt text. Defaults to "Orkora" for `mark` and
   *  "Orkora - Professional Event Platform" for the full lockup. */
  alt?: string;
  className?: string;
  /** Next/Image priority hint: pass true for above-the-fold renders. */
  priority?: boolean;
}

/**
 * Source intrinsic dimensions for the single-asset variants. The lockup
 * variant does its own thing (it composes two assets) so it does not need
 * an entry here. Update these if the master files ship with new pixel
 * dimensions; the render layer scales by aspect ratio.
 */
const SYMBOL = { src: '/brand/orkora-symbol.png', w: 486, h: 486 };
const WORDMARK = { src: '/brand/orkora-wordmark.png', w: 720, h: 220 };

export function Brand({
  variant = 'lockup',
  width,
  alt,
  className,
  priority = false,
}: BrandProps) {
  /*
   * Lockup = symbol + wordmark composed at render time. Both pieces are
   * transparent crops, so this version renders the lockup over whatever the
   * surrounding background is. The two `<Image>` children take their height
   * from the flex container (`h-full w-auto`) so consumers control the
   * lockup's display size by setting `className="h-XX w-auto"` on the
   * Brand component itself; the children scale together and the wordmark's
   * baseline tracks the symbol's vertical center via `items-center`.
   */
  if (variant === 'lockup') {
    const composedAlt = alt ?? 'Orkora';
    return (
      <span
        role="img"
        aria-label={composedAlt}
        className={`inline-flex items-center gap-2 ${className ?? ''}`}
      >
        <Image
          src={SYMBOL.src}
          alt=""
          width={SYMBOL.w}
          height={SYMBOL.h}
          className="h-full w-auto"
          priority={priority}
          aria-hidden
        />
        <Image
          src={WORDMARK.src}
          alt=""
          width={WORDMARK.w}
          height={WORDMARK.h}
          className="h-auto w-auto max-h-full"
          style={{ maxHeight: '70%' }}
          priority={priority}
          aria-hidden
        />
      </span>
    );
  }

  if (variant === 'mark') {
    const w = width ?? 32;
    return (
      <Image
        src={SYMBOL.src}
        alt={alt ?? 'Orkora'}
        width={w}
        height={w}
        className={className}
        priority={priority}
      />
    );
  }

  // wordmark
  const w = width ?? 120;
  const h = Math.round(w / (WORDMARK.w / WORDMARK.h));
  return (
    <Image
      src={WORDMARK.src}
      alt={alt ?? 'Orkora'}
      width={w}
      height={h}
      className={className}
      priority={priority}
    />
  );
}

export default Brand;
