// Rasterize the source SVGs into the PNGs that @capacitor/assets consumes.
// Run from repo root:  node scripts/rasterize-assets.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = (p) => join(root, 'assets', p);

const jobs = [
  { svg: 'icon-only.svg', png: 'icon-only.png', size: 1024 },
  { svg: 'icon-foreground.svg', png: 'icon-foreground.png', size: 1024 },
  { svg: 'icon-background.svg', png: 'icon-background.png', size: 1024 },
  { svg: 'splash.svg', png: 'splash.png', size: 2732 },
  { svg: 'splash-dark.svg', png: 'splash-dark.png', size: 2732 },
];

for (const j of jobs) {
  const buf = readFileSync(A(j.svg));
  await sharp(buf, { density: 384 })
    .resize(j.size, j.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(A(j.png));
  console.log('wrote', j.png, `${j.size}x${j.size}`);
}
console.log('done');
