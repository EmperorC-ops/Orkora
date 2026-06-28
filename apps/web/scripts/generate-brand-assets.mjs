#!/usr/bin/env node
/**
 * Brand-asset generator.
 *
 * Source of truth: apps/web/public/brand/orkora-mark.svg (vector). This
 * script rasterises that SVG to every raster size the web manifest,
 * iOS apple-touch icon, Android adaptive icon, Expo splash, and OG
 * image need. The wordmark is rendered as live HTML text by the Brand
 * component (apps/web/components/brand.tsx) so it does not need a
 * raster output here.
 *
 * Run from the apps/web workspace: `pnpm brand:generate`.
 *
 * Idempotent. Safe to re-run after editing orkora-mark.svg.
 *
 * Why sharp:
 *   - It can render SVGs at any size with crisp edges.
 *   - Already a transitive dep of next/image, so usually present in
 *     node_modules without a separate install. If not, the script
 *     prints a one-liner to add it.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, access, readFile } from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const REPO = path.resolve(WEB, '..', '..');

const SRC_MARK = path.join(WEB, 'public/brand/orkora-mark.svg');
const SRC_MASKABLE = path.join(WEB, 'public/brand/orkora-mark-maskable.svg');

const BRAND_DIR = path.join(WEB, 'public/brand');
const ICON_DIR = path.join(WEB, 'public/icons');
const MOBILE_ASSETS = path.resolve(REPO, 'apps/mobile/assets');

const BRAND_NAVY = { r: 13, g: 16, b: 41, alpha: 1 }; // #0D1029 splash background

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

  if (!(await exists(SRC_MARK))) {
    console.error(`Source SVG missing at ${SRC_MARK}.`);
    process.exit(1);
  }

  await ensureDir(BRAND_DIR);
  await ensureDir(ICON_DIR);
  await ensureDir(MOBILE_ASSETS);

  const markSvg = await readFile(SRC_MARK);
  const maskableSvg = (await exists(SRC_MASKABLE))
    ? await readFile(SRC_MASKABLE)
    : markSvg;

  // ---- Favicon ladder: sharp renders SVG directly at any density. ----
  // Density tuning: rendering at 4x the target then resizing yields
  // pixel-perfect anti-aliasing at the small end (32px especially).
  for (const size of [32, 180, 192, 512]) {
    await sharp(markSvg, { density: Math.max(72, size * 4) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ICON_DIR, `icon-${size}.png`));
    console.log(`Wrote icons/icon-${size}.png`);
  }

  // Maskable: PWA icon shape clipping. Use the maskable variant which
  // bleeds the brand colour to the full viewBox.
  await sharp(maskableSvg, { density: 2048 })
    .resize(512, 512, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ICON_DIR, 'icon-maskable-512.png'));
  console.log('Wrote icons/icon-maskable-512.png');

  // ---- OG image: 1200x630 with the mark centred on brand navy. ----
  // We centre a 360px raster of the mark; the rest of the card is plain
  // navy so the lockup reads cleanly when LinkedIn/Twitter crops it.
  const ogMark = await sharp(markSvg, { density: 1440 })
    .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: BRAND_NAVY,
    },
  })
    .composite([{ input: ogMark, left: Math.round((1200 - 360) / 2), top: Math.round((630 - 360) / 2) }])
    .png()
    .toFile(path.join(WEB, 'public/og-image.png'));
  console.log('Wrote public/og-image.png');

  // ---- Mobile (Expo): icon 1024, adaptive-icon 1024, splash 2048,
  //      favicon 32. iOS icon = full mark on navy plate (square),
  //      adaptive icon = transparent mark for Android's foreground
  //      layer, splash = mark centred on navy.
  await sharp(markSvg, { density: 4096 })
    .resize(1024, 1024, { fit: 'contain', background: BRAND_NAVY })
    .png({ compressionLevel: 9 })
    .toFile(path.join(MOBILE_ASSETS, 'icon.png'));
  console.log('Wrote mobile/assets/icon.png');

  await sharp(markSvg, { density: 4096 })
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(MOBILE_ASSETS, 'adaptive-icon.png'));
  console.log('Wrote mobile/assets/adaptive-icon.png');

  const splashMark = await sharp(markSvg, { density: 4096 })
    .resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 2048,
      height: 2048,
      channels: 4,
      background: BRAND_NAVY,
    },
  })
    .composite([{ input: splashMark, left: (2048 - 800) / 2, top: (2048 - 800) / 2 }])
    .png()
    .toFile(path.join(MOBILE_ASSETS, 'splash.png'));
  console.log('Wrote mobile/assets/splash.png');

  // Expo also reads favicon.png at the project root for web previews.
  await sharp(path.join(ICON_DIR, 'icon-32.png')).toFile(
    path.join(MOBILE_ASSETS, 'favicon.png'),
  );
  console.log('Wrote mobile/assets/favicon.png');

  console.log('\nBrand assets generated. Commit:');
  console.log('  apps/web/public/icons/');
  console.log('  apps/web/public/og-image.png');
  console.log('  apps/mobile/assets/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
