// sh: npx esbuild scripts/learning.test.ts --bundle --format=esm --platform=node --alias:@=./src '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}' --loader:.woff=empty --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/learning.mjs && node .tmp-test/learning.mjs
import assert from 'node:assert/strict';
import { addDays, format } from 'date-fns';
import { expectedMinute, usualMinute, weakWeekdays } from '@/services/attention/learning';

const NOW = new Date(2026, 10, 8, 14, 0); // Sunday
const key = (d: Date) => format(d, 'yyyy-MM-dd');
const ago = (n: number) => addDays(NOW, -n);
const ev = (d: Date, h: number, m: number, refId = 'morning') => {
  const k = key(d);
  return { ts: new Date(`${k}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime(), dateKey: k, domain: 'dhikr', refId, title: '', amount: 1 };
};
const morning = (e: { refId?: string }) => e.refId === 'morning';
const FRIDAY = new Date(2026, 10, 13, 12);
const MONDAY = new Date(2026, 10, 9, 12);

// usualMinute: unchanged — median of each day's FIRST event, ≥3 days; night folds past midnight.
{
  const events = [ev(ago(1), 6, 10), ev(ago(2), 6, 20), ev(ago(3), 6, 5), ev(ago(3), 9, 0)];
  assert.equal(usualMinute(events, morning, NOW), 6 * 60 + 10);
  assert.equal(usualMinute(events.slice(0, 2), morning, NOW), null);
  const night = [ev(ago(1), 23, 30, 'sleep'), ev(ago(2), 0, 30, 'sleep'), ev(ago(3), 23, 50, 'sleep')];
  assert.equal(usualMinute(night, () => true, NOW, true), 23 * 60 + 50);
}
// A weekday with its own rhythm: Friday mornings at 9:00, the rest at 6:10.
{
  const events = Array.from({ length: 56 }, (_, i) => ago(i + 1)).map((d) => (d.getDay() === 5 ? ev(d, 9, 0) : ev(d, 6, 10)));
  assert.deepEqual(expectedMinute(events, morning, NOW, FRIDAY), { minute: 9 * 60, basis: 'weekday' });
  assert.deepEqual(expectedMinute(events, morning, NOW, MONDAY), { minute: 6 * 60 + 10, basis: 'usual' });
  // Two Fridays aren't a rhythm yet.
  const few = events.filter((e) => new Date(e.ts).getDay() !== 5 || e.dateKey >= key(ago(14)));
  assert.equal(expectedMinute(few, morning, NOW, FRIDAY)?.basis, 'usual');
}
// Drift: the last week moved an hour later than the two before it.
{
  const events = Array.from({ length: 21 }, (_, i) => (i < 7 ? ev(ago(i + 1), 7, 0) : ev(ago(i + 1), 6, 0)));
  assert.deepEqual(expectedMinute(events, morning, NOW, MONDAY), { minute: 7 * 60, basis: 'drift' });
  // Ten minutes is noise, not drift.
  const small = Array.from({ length: 21 }, (_, i) => (i < 7 ? ev(ago(i + 1), 6, 10) : ev(ago(i + 1), 6, 0)));
  assert.equal(expectedMinute(small, morning, NOW, MONDAY)?.basis, 'usual');
  assert.equal(expectedMinute(events.slice(0, 2), morning, NOW, MONDAY), null, 'too little to learn');
}
// Weak weekdays: Asr missed on Tuesdays only → {2}; missed everywhere → none; a day off the app doesn't count.
{
  const all5 = { fajr: { fard: true }, dhuhr: { fard: true }, asr: { fard: true }, maghrib: { fard: true }, isha: { fard: true } };
  const log: Record<string, Record<string, { fard: boolean }>> = {};
  for (let i = 1; i <= 56; i++) {
    const d = ago(i);
    log[key(d)] = d.getDay() === 2 ? { ...all5, asr: { fard: false } } : { ...all5 };
  }
  assert.deepEqual([...weakWeekdays(log, {}, NOW, 'asr')], [2]);
  assert.deepEqual([...weakWeekdays(log, {}, NOW, 'dhuhr')], []);
  const everywhere = Object.fromEntries(Object.keys(log).map((k) => [k, { ...all5, asr: { fard: false } }]));
  assert.deepEqual([...weakWeekdays(everywhere, {}, NOW, 'asr')], [], 'a general lapse is not a weekday');
  const offApp = Object.fromEntries(Object.entries(log).filter(([k]) => new Date(`${k}T12:00:00`).getDay() !== 3).map(([k, v]) => [k, { ...v, asr: { fard: true } }]));
  assert.deepEqual([...weakWeekdays(offApp, {}, NOW, 'asr')], [], 'Wednesdays unlogged entirely are not "missed"');
  const excused = Object.fromEntries(Object.keys(log).filter((k) => new Date(`${k}T12:00:00`).getDay() === 2).map((k) => [k, true as const]));
  assert.deepEqual([...weakWeekdays(log, excused, NOW, 'asr')], [], 'excused days are out');
}

console.log('learning: ok');
