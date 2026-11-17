/**
 * Minimal zip extractor — scripts/pack-update.mjs round-trips every zip it writes
 * through it. Handles what
 * pack-update writes: stored/deflated entries, UTF-8 names. Windows' tar.exe
 * crashes on the Arabic file names in dist/sounds, hence no system tool.
 * ponytail: no zip64 — fine below 4 GB / 65k files.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function unzip(buf, dir) {
  dir = path.resolve(dir);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip directory');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);

    const file = path.resolve(dir, name);
    if (!file.startsWith(dir + path.sep)) throw new Error(`bad zip entry ${name}`);
    if (name.endsWith('/')) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, method === 8 ? zlib.inflateRawSync(data) : data);
  }
}

module.exports = { unzip };
