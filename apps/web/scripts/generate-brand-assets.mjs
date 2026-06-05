#!/usr/bin/env node
/**
 * Brand-asset generator. Run from apps/web with `node scripts/generate-brand-assets.mjs`.
 *
 * Source of truth: apps/web/public/brand/orkora-lockup.png (the wide horizontal
 * lockup with symbol + wordmark + tagline on the brand navy background).
 *
 * Output (idempotent - safe to re-run after editing the source):
 *   public/brand/orkora-symbol.png             transparent square of just the symbol
 *   public/brand/orkora-wordmark.png           transparent wordmark crop
 *   public/brand/orkora-wordmark-on-dark.png   wordmark + navy plate, for emails
 *   public/icons/icon-32.png                   favicon raster
 *   public/icons/icon-180.png                  iOS apple-touch-icon
 *   public/icons/icon-192.png                  PWA manifest icon
 *   public/icons/icon-512.png                  PWA maskable + splash source
 *   public/og-image.png                        1200x630 OG / Twitter card
 *
 * Why a script rather than committing all the crops by hand: the lockup is
 * the only thing the designer hands over, every other surface should derive
 * from it deterministically so a redesign is one file swap + one re-run.
 *
 * Sharp is the only dep; it ships as a transitive of next/image so we can
 * import it without adding to package.json. If a future Node-version bump
 * makes that unreliable, `pnpm add -D sharp` in apps/web.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, access } from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC = path.join(WEB, 'public/brand/orkora-lockup.png');
const BRAND_DIR = path.join(WEB, 'public/brand');
const ICON_DIR = path.join(WEB, 'public/icons');
// Mobile app receives icon / splash / adaptive-icon for Expo. Outputs are
// written even when the mobile workspace is checked out separately - the
// directory is recreated if missing.
const MOBILE_ASSETS = path.resolve(WEB, '../mobile/assets');

const BRAND_NAVY = { r: 13, g: 16, b: 41, alpha: 1 }; // approx #0D1029 from the lockup
// Wider fuzz so the slightly-lighter pixels at the navy/decoration boundary
// also alpha-zero out. Set 22 was leaving a faint navy halo at the edges of
// the symbol + wordmark crops when they composited on a light background.
const BG_FUZZ = 38;

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const sharpMod = await import('sharp').catch(() => null);
  if (!sharpMod) {
    console.error(
      'sharp not available. Install via: pnpm --filter @orkora/web add -D sharp\n' +
        'Then re-run this script.',
    );
    process.exit(1);
  }
  const sharp = sharpMod.default;

  if (!(await exists(SRC))) {
    console.error(`Master lockup missing at ${SRC}.`);
    console.error('Save the chat-uploaded image to that path and re-run.');
    process.exit(1);
  }

  await ensureDir(BRAND_DIR);
  await ensureDir(ICON_DIR);
  await ensureDir(MOBILE_ASSETS);

  const src = sharp(SRC).ensureAlpha();
  const { width, height } = await src.metadata();
  if (!width || !height) throw new Error('Could not read source dimensions');
  console.log(`Source: ${width}x${height}`);

  // Heuristic crops. The chat-shared lockup is roughly 1280x720 with the
  // symbol occupying the left ~35% horizontally, vertically centered.
  // These ratios are tuned for that file and work for any source that
  // matches the same composition.
  // Crop boxes are ratios of the source image dimensions. Tune these per
  // master file - the defaults below are calibrated for the chat-uploaded
  // lockup (~1280x714 with: symbol left-center, wordmark middle, tagline
  // beneath wordmark, decorative shapes bleeding in from the right edge).
  //
  // If a future master file has different proportions, change these
  // numbers and re-run. To dial in new ratios, save a one-off PNG via the
  // sharp `extract().toFile()` calls below and pixel-peep.
  //
  //   - symbolBox     covers ONLY the colorful symbol illustration. Skip
  //                   the navy padding around it; the keyOutBackground
  //                   pass alpha-zeros the navy that creeps in.
  //   - wordmarkBox   covers the "Orkora" wordmark AND the
  //                   "PROFESSIONAL EVENT PLATFORM" tagline beneath it
  //                   (the tagline reads as part of the lockup identity).
  //                   The right edge must stop before the decorative
  //                   shapes on the far-right side of the lockup,
  //                   otherwise the composite shows a ghost symbol.
  const symbolBox = {
    left: Math.round(width * 0.15),
    top: Math.round(height * 0.18),
    width: Math.round(width * 0.27),
    height: Math.round(height * 0.64),
  };
  const wordmarkBox = {
    left: Math.round(width * 0.42),
    top: Math.round(height * 0.28),
    width: Math.round(width * 0.40),
    height: Math.round(height * 0.42),
  };

  // ---- Symbol on transparent ----
  await keyOutBackground(sharp, SRC, symbolBox, path.join(BRAND_DIR, 'orkora-symbol.png'));
  console.log('Wrote brand/orkora-symbol.png');

  // ---- Wordmark on transparent ----
  await keyOutBackground(
    sharp,
    SRC,
    wordmarkBox,
    path.join(BRAND_DIR, 'orkora-wordmark.png'),
  );
  console.log('Wrote brand/orkora-wordmark.png');

  // ---- Wordmark on the brand navy plate (for emails that lay it on white) ----
  await sharp(SRC)
    .extract(wordmarkBox)
    .toFile(path.join(BRAND_DIR, 'orkora-wordmark-on-dark.png'));
  console.log('Wrote brand/orkora-wordmark-on-dark.png');

  // ---- Square symbol PNG ladder (favicon, apple-touch, PWA) ----
  for (const size of [32, 180, 192, 512]) {
    await sharp(path.join(BRAND_DIR, 'orkora-symbol.png'))
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(ICON_DIR, `icon-${size}.png`));
    console.log(`Wrote icons/icon-${size}.png`);
  }

  // ---- Maskable: symbol centred inside the full 512 frame with extra padding ----
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 13, g: 16, b: 41, alpha: 1 },
    },
  })
    .composite([
      {
        input: await sharp(path.join(BRAND_DIR, 'orkora-symbol.png'))
          .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        left: 76,
        top: 76,
      },
    ])
    .png()
    .toFile(path.join(ICON_DIR, 'icon-maskable-512.png'));
  console.log('Wrote icons/icon-maskable-512.png');

  // ---- OG image: 1200x630 with the lockup centred on brand navy ----
  const ogLockup = await sharp(SRC)
    .resize(960, null, { fit: 'inside' })
    .toBuffer();
  const ogMeta = await sharp(ogLockup).metadata();
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 13, g: 16, b: 41, alpha: 1 },
    },
  })
    .composite([
      {
        input: ogLockup,
        left: Math.round((1200 - (ogMeta.width ?? 960)) / 2),
        top: Math.round((630 - (ogMeta.height ?? 540)) / 2),
      },
    ])
    .png()
    .toFile(path.join(WEB, 'public/og-image.png'));
  console.log('Wrote public/og-image.png');

  // ---- Mobile (Expo): icon 1024x1024, adaptive-icon 1024x1024 (foreground
  //      on transparent background, Android composes its own bg), splash
  //      2048x2048 lockup on brand navy.
  await sharp(path.join(BRAND_DIR, 'orkora-symbol.png'))
    .resize(1024, 1024, { fit: 'contain', background: { r: 13, g: 16, b: 41, alpha: 1 } })
    .png()
    .toFile(path.join(MOBILE_ASSETS, 'icon.png'));
  console.log('Wrote mobile/assets/icon.png');

  await sharp(path.join(BRAND_DIR, 'orkora-symbol.png'))
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(MOBILE_ASSETS, 'adaptive-icon.png'));
  console.log('Wrote mobile/assets/adaptive-icon.png');

  const splashLockup = await sharp(SRC)
    .resize(1400, null, { fit: 'inside' })
    .toBuffer();
  const splashMeta = await sharp(splashLockup).metadata();
  await sharp({
    create: {
      width: 2048,
      height: 2048,
      channels: 4,
      background: { r: 13, g: 16, b: 41, alpha: 1 },
    },
  })
    .composite([
      {
        input: splashLockup,
        left: Math.round((2048 - (splashMeta.width ?? 1400)) / 2),
        top: Math.round((2048 - (splashMeta.height ?? 800)) / 2),
      },
    ])
    .png()
    .toFile(path.join(MOBILE_ASSETS, 'splash.png'));
  console.log('Wrote mobile/assets/splash.png');

  // Expo also reads `favicon.png` at the project root for web previews.
  await sharp(path.join(ICON_DIR, 'icon-32.png')).toFile(
    path.join(MOBILE_ASSETS, 'favicon.png'),
  );
  console.log('Wrote mobile/assets/favicon.png');

  console.log('\nBrand assets generated. Commit the changes under');
  console.log('apps/web/public/ AND apps/mobile/assets/.');
}

/**
 * Extract a rectangular region of the source PNG, then make pixels near the
 * brand-navy background transparent. Uses a hard threshold (no blur, no
 * antialiased edge) because the lockup background is a flat colour. If a
 * future lockup uses a gradient background, this needs to switch to a
 * proper matting algorithm.
 */
async function keyOutBackground(sharp, srcPath, box, outPath) {
  const buf = await sharp(srcPath).extract(box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = buf;
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += info.channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const dr = r - BRAND_NAVY.r;
    const dg = g - BRAND_NAVY.g;
    const db = b - BRAND_NAVY.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < BG_FUZZ) {
      out[i + 3] = 0; // fully transparent
    }
  }
  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toFile(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
