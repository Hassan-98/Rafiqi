// Generate android/.../res/raw/adhan.wav — an audible alarm tone so the alarm
// notification channel actually rings. This is a PLACEHOLDER chime; the user
// can replace this file with a real adhan recording (same filename) + rebuild.
// Run:  node scripts/gen-alarm-sound.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'android', 'app', 'src', 'main', 'res', 'raw');
mkdirSync(outDir, { recursive: true });

const SR = 44100;
const DURATION = 25; // seconds
const N = SR * DURATION;
const data = new Int16Array(N);

// A loud, attention-grabbing 3-note ascending bell motif (D5, F#5, A5)
// repeating densely so it reads as an alarm, not a one-shot chime.
const motif = [587.33, 739.99, 880.0];
const noteGap = 0.34; // s between notes
const period = 1.5; // s between motif repeats (denser = more "ringing")

function bell(t, freq) {
  // bell = fundamental + inharmonic partials, slower decay so it sustains.
  const env = Math.exp(-t * 3.0);
  const s =
    Math.sin(2 * Math.PI * freq * t) +
    0.5 * Math.sin(2 * Math.PI * freq * 2.01 * t) +
    0.25 * Math.sin(2 * Math.PI * freq * 2.99 * t);
  return env * s;
}

for (let i = 0; i < N; i++) {
  const t = i / SR;
  const inPeriod = t % period;
  let sample = 0;
  for (let n = 0; n < motif.length; n++) {
    const start = n * noteGap;
    if (inPeriod >= start) {
      sample += bell(inPeriod - start, motif[n]);
    }
  }
  // global fade-in over first 0.08s, then loud; soft-clip to avoid harsh peaks.
  const fade = Math.min(1, t / 0.08);
  let v = (sample / 1.75) * 0.92 * fade;
  v = Math.tanh(v * 1.4); // soft clip → louder perceived level without clicks
  data[i] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
}

// WAV (PCM 16-bit mono) container.
const bytesPerSample = 2;
const dataBytes = N * bytesPerSample;
const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); // fmt chunk size
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(1, 22); // mono
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * bytesPerSample, 28); // byte rate
buf.writeUInt16LE(bytesPerSample, 32); // block align
buf.writeUInt16LE(16, 34); // bits per sample
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(data[i], 44 + i * 2);

const out = join(outDir, 'adhan.wav');
writeFileSync(out, buf);
console.log('wrote', out, `${(buf.length / 1024).toFixed(0)} KB, ${DURATION}s`);
