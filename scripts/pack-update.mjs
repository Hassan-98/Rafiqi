/**
 * Packs dist/ as an OTA update (src/services/appUpdate.ts) into release/updates/:
 *   bundle-<version>.zip, update.json, vercel.json (CORS + no-cache manifest)
 *
 *   npm run update:pack -- [patch|minor|major] --notes "إصلاحات" [--min-native 1.1] [--silent]
 *   npm run update:deploy        (Vercel project rafiqi-updates, linked in release/updates/.vercel)
 *
 * Bumps package.json "version" first (default: patch) — clients only take a
 * higher version. A failed run puts the old version back.
 * Pass --min-native when the bundle needs native code newer than some shells
 * have (a new plugin, permission…): APK versionName / desktop app version.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { crc32, deflateRawSync } from 'node:zlib';

const { unzip } = createRequire(import.meta.url)('./unzip.cjs');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { notes: { type: 'string' }, 'min-native': { type: 'string' }, silent: { type: 'boolean' } },
});
const bump = positionals[0] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) throw new Error(`bump must be patch, minor or major, got "${bump}"`);

const readVersion = () => JSON.parse(readFileSync('package.json', 'utf8')).version;
const previous = readVersion();
// npm version rewrites package.json + package-lock.json (no git tag/commit).
execSync(`npm version ${bump} --no-git-tag-version`, { stdio: 'ignore' });
const version = readVersion();
// «سجل التحديثات» (Settings): the release's notes, one line per «؛», go into the
// bundle itself — written before the build, undone with the version on failure.
const CHANGELOG = 'src/data/changelog.json';
const changelogBefore = readFileSync(CHANGELOG, 'utf8');
if (values.notes) {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const notes = values.notes.split('؛').map((x) => x.trim()).filter(Boolean);
  const log = JSON.parse(changelogBefore).filter((e) => e.version !== version);
  writeFileSync(CHANGELOG, `${JSON.stringify([{ version, date, notes }, ...log], null, 2)}\n`);
}
let packed = false;
process.on('exit', () => {
  if (packed) return;
  execSync(`npm version ${previous} --no-git-tag-version --allow-same-version`, { stdio: 'ignore' });
  writeFileSync(CHANGELOG, changelogBefore);
});
console.log(`version ${previous} → ${version}`);
// Build here, not `npm run build && node …` in package.json: a leading nested
// npm makes npm double-escape the args on Windows (--notes arrives as ^…^).
execSync('npm run build', { stdio: 'inherit' });
const DIST = resolve('dist');
const OUT = resolve('release/updates');

const listFiles = (root) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(root, join(d.parentPath, d.name)).split(sep).join('/'))
    .sort();

/** Plain deflate zip with UTF-8 names (Java ZipFile, the Tauri shell's zip crate and scripts/unzip.cjs read it).
 *  Not tar.exe: it segfaults on the Arabic names in dist/sounds. */
function zipDir(root) {
  const parts = [];
  const central = [];
  let offset = 0;
  const names = listFiles(root);
  for (const rel of names) {
    const name = Buffer.from(rel, 'utf8');
    const raw = readFileSync(join(root, rel));
    const data = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(33, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(33, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const zip = zipDir(DIST);

// Round-trip check: the desktop extractor must reproduce dist/ byte for byte.
const check = mkdtempSync(join(tmpdir(), 'pack-update-'));
try {
  unzip(zip, check);
  const want = listFiles(DIST);
  const got = listFiles(check);
  if (want.join('\n') !== got.join('\n')) throw new Error('zip round-trip: file list differs');
  for (const f of want) {
    if (!readFileSync(join(DIST, f)).equals(readFileSync(join(check, f)))) throw new Error(`zip round-trip: ${f} differs`);
  }
} finally {
  rmSync(check, { recursive: true, force: true });
}

mkdirSync(OUT, { recursive: true });
// Keep the folder itself (the vercel link lives in .vercel/), drop older bundles.
for (const f of readdirSync(OUT)) if (/^bundle-.*\.zip$/.test(f)) rmSync(join(OUT, f));

const zipName = `bundle-${version}.zip`;
writeFileSync(join(OUT, zipName), zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
// --silent: no prompt on the device — fetched quietly, switched when the app is next hidden.
const manifest = { version, url: zipName, sha256, size: zip.length, minNative: values['min-native'], notes: values.notes, silent: values.silent || undefined };
writeFileSync(join(OUT, 'update.json'), JSON.stringify(manifest, null, 2));
writeFileSync(
  join(OUT, 'vercel.json'),
  JSON.stringify(
    {
      headers: [
        { source: '/(.*)', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
        { source: '/update.json', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      ],
    },
    null,
    2,
  ),
);
packed = true;
console.log(`packed ${zipName} (${(zip.length / 1e6).toFixed(1)} MB, ${sha256.slice(0, 12)}…) → ${OUT}`);
