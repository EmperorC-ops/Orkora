/**
 * Canonical Orkora brand renderer.
 *
 * Every place the brand appears in the web app goes through this file so the
 * proportions, alt text, and asset choice stay aligned. Three variants:
 *
 *   - `lockup`  the full symbol + wordmark + tagline horizontal lockup. Use on
 *               wide marketing surfaces (landing header, auth pages, OG cards,
 *               splash screens).
 *   - `mark`    symbol only, no wordmark. Use in tight spaces (dashboard nav,
 *               compact footers, mobile chrome, browser tab).
 *   - `wordmark` "Orkora" wordmark only. Use when you have the symbol nearby
 *               in another element and need just the typography (legal layout
 *               header, footer link rows).
 *
 * Asset files live in apps/web/public/brand/. The symbol PNG is a transparent
 * crop of the master lockup so it lays cleanly on white dashboard surfaces
 * AND the dark marketing background without a second variant per surface.
 */

import Image from 'next/image';

type BrandVariant = 'lockup' | 'mark' | 'wordmark';

interface BrandProps {
  variant?: BrandVariant;
  /** Display width in CSS pixels. The component sets the height per the
   *  variant's natural aspect ratio so consumers do not have to know it. */
  width?: number;
  /** Override the alt text. Defaults to "Orkora" for `mark` and
   *  "Orkora - Professional Event Platform" for the full lockup. */
  alt?: string;
  className?: string;
  /** Next/Image priority hint: pass true for above-the-fold renders. */
  priority?: boolean;
}

/**
 * Intrinsic source aspect ratios. The lockup is roughly the chat-shared
 * 1280x720; the symbol is the square crop produced by the build script
 * (apps/web/public/brand/orkora-symbol.png). Update these constants if a
 * new master file ships with different proportions.
 */
const ASPECTS: Record<BrandVariant, { ratio: number; src: string; defaultAlt: string }> = {
  lockup: {
    ratio: 1280 / 720,
    src: '/brand/orkora-lockup.png',
    defaultAlt: 'Orkora - Professional Event Platform',
  },
  mark: {
    ratio: 1,
    src: '/brand/orkora-symbol.png',
    defaultAlt: 'Orkora',
  },
  wordmark: {
    ratio: 720 / 220,
    src: '/brand/orkora-wordmark.png',
    defaultAlt: 'Orkora',
  },
};

export function Brand({
  variant = 'lockup',
  width,
  alt,
  className,
  priority = false,
}: BrandProps) {
  const meta = ASPECTS[variant];
  const w = width ?? (variant === 'mark' ? 32 : variant === 'wordmark' ? 120 : 200);
  const h = Math.round(w / meta.ratio);

  return (
    <Image
      src={meta.src}
      alt={alt ?? meta.defaultAlt}
      width={w}
      height={h}
      className={className}
      priority={priority}
    />
  );
}

export default Brand;
