// Tests for lib/scanner.ts (check-in camera choice and scan region).
// apps/web has no test runner, so this transpiles the real file and runs it
// under plain Node, like test-safe-redirect.mjs.
//
// Run: pnpm --filter @orkora/web test:scanner   (or: node scripts/test-scanner.mjs)
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const self = fileURLToPath(import.meta.url);
const src = readFileSync(join(dirname(self), '..', 'lib', 'scanner.ts'), 'utf8');
let js;
if (typeof nodeModule.stripTypeScriptTypes === 'function') {
  js = nodeModule.stripTypeScriptTypes(src);
} else {
  const ts = nodeModule.createRequire(import.meta.url)('typescript');
  js = ts.transpileModule(src, { compilerOptions: { target: 99 } }).outputText;
}
js = js.replace(/^export /gm, '');
const { pickBestCamera, isFrontCamera, scanRegion } = new Function(
  `${js}; return { pickBestCamera, isFrontCamera, scanRegion };`,
)();

let failures = 0;
const same = (actual, expected, msg) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL ${msg}: expected ${e}, got ${a}`);
  }
};
const cams = (...labels) => labels.map((label, i) => ({ id: `d${i}`, label }));

// Android Chrome: the main rear lens is the lowest-numbered "facing back".
same(
  pickBestCamera(cams('camera2 1, facing front', 'camera2 2, facing back', 'camera2 0, facing back'))?.label,
  'camera2 0, facing back',
  'Android picks camera2 0 facing back',
);
// iPhone Safari labels.
same(
  pickBestCamera(cams('Front Camera', 'Back Ultra Wide Camera', 'Back Camera', 'Back Telephoto Camera'))?.label,
  'Back Camera',
  'iPhone picks the main Back Camera over ultra wide and telephoto',
);
// Samsung-style labels with a depth sensor.
same(
  pickBestCamera(cams('Rear depth camera', 'Rear camera', 'Front camera'))?.label,
  'Rear camera',
  'skips the depth sensor',
);
// Laptop with one webcam: still returns it.
same(pickBestCamera(cams('Integrated Webcam'))?.label, 'Integrated Webcam', 'single webcam');
// Unlabelled list (no permission yet): first camera, no crash.
same(pickBestCamera(cams('', ''))?.id, 'd0', 'unlabelled cameras fall back to the first');
same(pickBestCamera([]), null, 'empty list');

same(isFrontCamera('Front Camera'), true, 'front detected');
same(isFrontCamera('Back Camera'), false, 'back is not front');

// Scan region: 85% of the short side, centred, decoded at up to 1000 px.
same(scanRegion(1920, 1080), { x: 501, y: 81, width: 918, height: 918, downScaledWidth: 918, downScaledHeight: 918 }, '1080p');
same(scanRegion(3840, 2160).downScaledWidth, 1000, '4K is capped at 1000 px');
same(scanRegion(640, 480).width, 408, 'small frames still work');

if (failures) {
  console.error(`scanner: ${failures} FAILED`);
  process.exit(1);
}
console.log('scanner: all checks passed');
