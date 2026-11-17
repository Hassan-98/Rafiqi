// Generate the Android notification small-icon (ic_stat_myzikr) — a pure-white
// silhouette on transparent — into every density bucket. @capacitor/assets does
// not produce status-bar icons, so we do it here.
// Run:  node scripts/gen-notification-icon.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'assets', 'ic_stat_myzikr.svg'));
const resBase = join(root, 'android', 'app', 'src', 'main', 'res');

// 24dp base scaled per density.
const buckets = [
  { dir: 'drawable-mdpi', size: 24 },
  { dir: 'drawable-hdpi', size: 36 },
  { dir: 'drawable-xhdpi', size: 48 },
  { dir: 'drawable-xxhdpi', size: 72 },
  { dir: 'drawable-xxxhdpi', size: 96 },
];

for (const b of buckets) {
  const dir = join(resBase, b.dir);
  mkdirSync(dir, { recursive: true });
  await sharp(src, { density: 384 })
    .resize(b.size, b.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(dir, 'ic_stat_myzikr.png'));
  console.log('wrote', b.dir, `${b.size}x${b.size}`);
}
console.log('done');
