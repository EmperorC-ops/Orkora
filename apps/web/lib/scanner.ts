/**
 * Pure helpers for the check-in QR scanner. Kept free of browser APIs so they
 * are unit tested under plain Node (scripts/test-scanner.mjs).
 *
 * Why these exist (from the WMXKED event, 24 Oct 2026): several phones scanned
 * badly while others were fine. Two causes:
 *   1. Phones with several rear cameras often hand the browser the ultra-wide
 *      or a depth/macro lens for "environment", which focuses poorly at ticket
 *      distance. pickBestCamera prefers the main rear lens.
 *   2. The scanner downscaled the frame to 400 px before decoding, too coarse
 *      for our dense signed-token QR codes, especially on screens. scanRegion
 *      decodes a larger area at higher resolution.
 */

export interface CameraInfo {
  id: string;
  label: string;
}

const REAR = /\b(back|rear|environment|world)\b/i;
const FRONT = /\b(front|user|face|selfie|facetime)\b/i;
// Secondary lenses that focus badly at ticket distance.
const SECONDARY = /(ultra|wide|tele|zoom|depth|macro|infrared|\bir\b|tof|0\.5x|2x|3x|dual|triple)/i;

function rank(c: CameraInfo): number {
  const l = c.label || '';
  let score = 0;
  if (REAR.test(l)) score += 100;
  if (FRONT.test(l)) score -= 100;
  if (SECONDARY.test(l)) score -= 40;
  // Android Chrome labels rear cameras "camera2 0, facing back",
  // "camera2 2, facing back"; the lowest index is the main lens.
  const idx = /camera2?\s*(\d+)/i.exec(l);
  if (idx) score -= Number(idx[1]);
  return score;
}

/**
 * The camera most likely to be the main rear lens, or null when the list is
 * empty. Unlabelled cameras (permission not yet granted) rank neutral, so the
 * caller should list cameras after the stream has started.
 */
export function pickBestCamera(cameras: CameraInfo[]): CameraInfo | null {
  if (!cameras.length) return null;
  let best = cameras[0]!;
  let bestScore = rank(best);
  for (const c of cameras.slice(1)) {
    const s = rank(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/** True when a camera label looks like a front (selfie) camera. */
export function isFrontCamera(label: string): boolean {
  return FRONT.test(label) && !REAR.test(label);
}

export interface ScanRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  downScaledWidth: number;
  downScaledHeight: number;
}

/**
 * Centre square covering 85% of the shorter side, decoded at up to 1000 px.
 * The library default was 2/3 of the side at 400 px.
 */
export function scanRegion(videoWidth: number, videoHeight: number): ScanRegion {
  const side = Math.max(1, Math.round(0.85 * Math.min(videoWidth, videoHeight)));
  const down = Math.min(side, 1000);
  return {
    x: Math.round((videoWidth - side) / 2),
    y: Math.round((videoHeight - side) / 2),
    width: side,
    height: side,
    downScaledWidth: down,
    downScaledHeight: down,
  };
}
