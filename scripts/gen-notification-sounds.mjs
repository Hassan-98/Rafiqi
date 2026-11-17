// Generate distinct PLACEHOLDER notification tones, one per notification type,
// into BOTH:
//   - android/app/src/main/res/raw/   → the real on-device ringtone (each file
//     is frozen into its own notification channel by CapacitorNotificationService)
//   - public/sounds/                  → a web copy used only for the in-app
//     preview button in Settings (the WebView can't read android raw resources).
//
// These are SYNTHESIZED placeholders so the feature works end-to-end today.
// To use real recordings (e.g. a genuine Makkah adhan), drop a file with the
// SAME name into android/app/src/main/res/raw/ (and, for preview, public/sounds/)
// then rebuild. Keep the filename + .wav extension, or update the matching
// `file:` entry in src/services/notifications/sounds.ts (e.g. to .mp3).
//
// Run:  node scripts/gen-notification-sounds.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'android', 'app', 'src', 'main', 'res', 'raw');
const webDir = join(root, 'public', 'sounds');
mkdirSync(rawDir, { recursive: true });
mkdirSync(webDir, { recursive: true });

const SR = 22050; // 22.05 kHz mono is ample for alert tones and keeps files small
const TAU = Math.PI * 2;

// ── tiny synth toolkit ──────────────────────────────────────────────────────
/** Attack/release gate envelope in [0,1]. */
function gate(t, dur, atk = 0.01, rel = 0.25) {
  return Math.max(0, Math.min(t / atk, 1, (dur - t) / rel));
}
/** Inharmonic bell: fundamental + struck partials, exponential decay. */
function bell(t, f, decay = 3.5) {
  if (t < 0) return 0;
  const e = Math.exp(-t * decay);
  return e * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * 2.01 * f * t) + 0.25 * Math.sin(TAU * 2.99 * f * t));
}
/** Voice-like tone: vibrato + a stack of harmonics (reads as a sustained call). */
function voice(t, f, vib = 5.2, depth = 0.007) {
  const fm = f * (1 + depth * Math.sin(TAU * vib * t));
  return (
    Math.sin(TAU * fm * t) +
    0.5 * Math.sin(TAU * 2 * fm * t) +
    0.32 * Math.sin(TAU * 3 * fm * t) +
    0.18 * Math.sin(TAU * 4 * fm * t)
  );
}
/** Pure-ish sine with a slight 2nd harmonic — calm/soft sources. */
function soft(t, f) {
  return Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t);
}

/** Render a duration with a per-sample function, normalise, soft-clip → Int16. */
function render(durationSec, fn) {
  const N = Math.floor(SR * durationSec);
  const buf = new Float32Array(N);
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const v = fn(i / SR) || 0;
    buf[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  const norm = peak > 0 ? 0.95 / peak : 1;
  const out = new Int16Array(N);
  for (let i = 0; i < N; i++) {
    let v = Math.tanh(buf[i] * norm * 1.1); // soft clip → louder perceived level
    out[i] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  }
  return out;
}

/** PCM 16-bit mono WAV container. */
function wav(int16) {
  const N = int16.length;
  const bytes = N * 2;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + bytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(bytes, 40);
  for (let i = 0; i < N; i++) buf.writeInt16LE(int16[i], 44 + i * 2);
  return buf;
}

// These four are REAL recordings committed to the repo (full Makkah adhan +
// trimmed takbeer clips) — never overwrite them with synthesized placeholders.
const REAL_AUDIO = new Set(['adhan_makkah.wav', 'adhan_short.wav', 'tone_fasting.wav', 'tone_special.wav']);

function emit(name, durationSec, fn) {
  if (REAL_AUDIO.has(name)) {
    console.log('skip', name.padEnd(20), '(real recording in repo — see *.mp3)');
    return;
  }
  const buf = wav(render(durationSec, fn));
  writeFileSync(join(rawDir, name), buf);
  writeFileSync(join(webDir, name), buf);
  console.log('wrote', name.padEnd(20), `${(buf.length / 1024).toFixed(0)} KB`, `${durationSec}s`);
}

/** Sum a list of {start,dur,freq,gain?,src?} notes at time t. */
function melody(notes, t, defaultSrc = voice) {
  let s = 0;
  for (const n of notes) {
    const lt = t - n.start;
    if (lt < 0 || lt > n.dur) continue;
    const src = n.src ?? defaultSrc;
    s += (n.gain ?? 1) * gate(lt, n.dur, n.atk ?? 0.04, n.rel ?? 0.3) * src(lt, n.freq);
  }
  return s;
}

/**
 * NON-MUSICAL soft alert: ONE gentle tone with a short percussive tap at the
 * onset. No note sequences, no chords, no melody — reads as a plain notification
 * "ping", which is the appropriate cue for the Islamic reminders (azkar, qiyam,
 * du'a, …) where a musical chime is unwanted.
 */
function alert(freq, dur) {
  return (t) => {
    const tap = t < 0.035 ? (Math.random() * 2 - 1) * Math.exp(-t * 140) * 0.5 : 0;
    const env = Math.min(1, t / 0.012) * Math.exp(-t * (2.6 / dur));
    const tone = env * (Math.sin(TAU * freq * t) + 0.28 * Math.sin(TAU * 2 * freq * t));
    return 0.82 * tone + tap;
  };
}

// ── per-type placeholder tones ──────────────────────────────────────────────

// PRAYERS — long, sustained, maqam-flavoured "call". Placeholder for a real
// Makkah adhan recording (drop in adhan_makkah.wav to replace).
const adhan = [
  { start: 0.0, dur: 1.7, freq: 294 }, // D4
  { start: 1.4, dur: 1.5, freq: 330 }, // E4
  { start: 2.7, dur: 1.3, freq: 311 }, // Eb4 (quartertone-ish colour)
  { start: 3.8, dur: 1.9, freq: 294 },
  { start: 5.4, dur: 1.5, freq: 392 }, // G4
  { start: 6.6, dur: 1.7, freq: 440 }, // A4 (climax)
  { start: 8.0, dur: 1.2, freq: 392 },
  { start: 9.0, dur: 1.2, freq: 349 }, // F4
  { start: 9.9, dur: 1.1, freq: 330 },
  { start: 10.7, dur: 2.0, freq: 294 }, // long settle
];
emit('adhan_makkah.wav', 13, (t) => 0.5 * melody(adhan, t) + 0.12 * soft(t, 147) * gate(t, 13, 1.5, 2));

// PRAYERS pre/iqama — short takbeer-like rising call.
const takbeer = [
  { start: 0.0, dur: 0.28, freq: 294 },
  { start: 0.3, dur: 0.28, freq: 330 },
  { start: 0.62, dur: 0.5, freq: 392 },
  { start: 1.3, dur: 0.28, freq: 330 },
  { start: 1.6, dur: 0.28, freq: 392 },
  { start: 1.92, dur: 0.7, freq: 440 },
];
emit('adhan_short.wav', 3, (t) => 0.6 * melody(takbeer, t));

// NON-MUSICAL single-tone alerts for the Islamic reminders (no melodies).
// Distinct only by pitch + length so each type is recognisable.
// AZKAR — soft mid tone.
emit('chime_azkar.wav', 1.2, alert(294, 0.9));

// QURAN wird — slightly lower, gentle.
emit('tone_quran.wav', 1.4, alert(247, 1.1));

// QIYAM — low + calm for the night.
emit('tone_qiyam.wav', 1.6, alert(196, 1.3));

// FASTING — warm bell + a small rising motif (suhoor / iftar).
const fasting = [
  { start: 0.0, dur: 2.0, freq: 349, src: bell, gain: 1.0 }, // F4 warm bell
  { start: 0.5, dur: 0.5, freq: 262, src: voice, gain: 0.5 },
  { start: 1.0, dur: 0.5, freq: 330, src: voice, gain: 0.5 },
  { start: 1.5, dur: 0.9, freq: 392, src: voice, gain: 0.55 },
];
emit('tone_fasting.wav', 3, (t) => 0.6 * melody(fasting, t) + 0.12 * soft(t, 175) * gate(t, 3, 0.4, 1.0));

// DUAA — soft mid tone.
emit('chime_duaa.wav', 1.2, alert(277, 0.9));

// HABITS — short, lighter tone.
emit('chime_habits.wav', 1.0, alert(330, 0.7));

// SPECIAL (Islamic calendar) — celebratory sparkle arpeggio + held chord.
const sparkle = [523, 659, 784, 1047, 1319].map((f, i) => ({ start: i * 0.16, dur: 1.4, freq: f, src: bell, gain: 0.8 }));
emit('tone_special.wav', 3.4, (t) => {
  const arp = 0.55 * melody(sparkle, t, bell);
  const chord = t > 1.0 ? 0.22 * (bell(t - 1.0, 523, 1.4) + bell(t - 1.0, 659, 1.4) + bell(t - 1.0, 784, 1.4)) : 0;
  return arp + chord;
});

console.log('\nDone. Replace any file in android/app/src/main/res/raw/ with a real');
console.log('recording (same name) to use authentic audio — e.g. adhan_makkah.wav.');
