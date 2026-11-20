import assert from 'node:assert/strict';
import { DEFAULT_PRAYER_MODE, dayWindows, mergeWindows, planWindows, type DayTimes, type PrayerModeConfig } from '../src/services/prayerModePlan';
import type { PrayerName } from '../src/types';

const MIN = 60_000;
const at = (key: string, hm: string) => new Date(`${key}T${hm}:00`).getTime();
const day = (key: string, friday = false): DayTimes => ({
  dateKey: key,
  friday,
  times: {
    fajr: at(key, '04:50'),
    dhuhr: at(key, '11:40'),
    asr: at(key, '14:40'),
    maghrib: at(key, '17:00'),
    isha: at(key, '18:20'),
  },
});
const cfg = (patch: Partial<PrayerModeConfig> = {}): PrayerModeConfig => ({ ...DEFAULT_PRAYER_MODE, enabled: true, ...patch });
const iqama: Record<PrayerName, number> = { fajr: 25, dhuhr: 15, asr: 15, maghrib: 5, isha: 15 };
const iq = (p: PrayerName) => iqama[p];

// Iqama start (default): adhan + per-prayer iqama minutes, per-prayer durations.
{
  const ws = dayWindows(day('2026-11-17'), cfg(), iq, true);
  assert.equal(ws.length, 5);
  assert.equal(ws[0].start, at('2026-11-17', '05:15'));
  assert.equal(ws[0].end, at('2026-11-17', '05:35'));
  assert.equal(ws[3].label, 'المغرب');
  assert.equal(ws[3].start, at('2026-11-17', '17:05'));
  assert.equal(ws[3].end - ws[3].start, 15 * MIN);
}

// Adhan / after-adhan starts.
{
  assert.equal(dayWindows(day('2026-11-17'), cfg({ start: 'adhan' }), iq, true)[1].start, at('2026-11-17', '11:40'));
  assert.equal(dayWindows(day('2026-11-17'), cfg({ start: 'after', afterMinutes: 7 }), iq, true)[1].start, at('2026-11-17', '11:47'));
}

// Per-prayer off + zero duration skipped.
{
  const c = cfg({ prayers: { ...DEFAULT_PRAYER_MODE.prayers, asr: { on: false, minutes: 20 }, isha: { on: true, minutes: 0 } } });
  assert.deepEqual(dayWindows(day('2026-11-17'), c, iq, true).map((w) => w.prayers[0].prayer), ['fajr', 'dhuhr', 'maghrib']);
}

// Jumu'ah: men on Friday — earlier start, longer; women keep Dhuhr; off → no noon window for men.
{
  const fri = day('2026-11-20', true);
  const men = dayWindows(fri, cfg(), iq, true);
  assert.equal(men[1].label, 'الجمعة');
  assert.equal(men[1].start, at('2026-11-20', '11:30'));
  assert.equal(men[1].end, at('2026-11-20', '12:30'));
  assert.equal(men[1].prayers[0].prayer, 'dhuhr');
  assert.equal(dayWindows(fri, cfg(), iq, false)[1].label, 'الظهر');
  const off = dayWindows(fri, cfg({ jumuah: { on: false, before: 10, minutes: 60 } }), iq, true);
  assert.ok(!off.some((w) => w.prayers[0].prayer === 'dhuhr'));
}

// Overlap merging: Maghrib runs into Isha → one window carrying both prayers.
{
  const long = cfg({ prayers: { ...DEFAULT_PRAYER_MODE.prayers, maghrib: { on: true, minutes: 90 } } });
  const merged = mergeWindows(dayWindows(day('2026-11-17'), long, iq, true));
  assert.equal(merged.length, 4);
  const m = merged[3];
  assert.equal(m.label, 'المغرب والعشاء');
  assert.deepEqual(m.prayers.map((x) => x.prayer), ['maghrib', 'isha']);
  assert.equal(m.start, at('2026-11-17', '17:05'));
  assert.equal(m.end, at('2026-11-17', '18:55'));
  // Touching windows merge too; disjoint ones don't; input order doesn't matter.
  const a = { start: 0, end: 10, label: 'أ', prayers: [] };
  const b = { start: 10, end: 20, label: 'ب', prayers: [] };
  const c = { start: 30, end: 40, label: 'ج', prayers: [] };
  assert.deepEqual(mergeWindows([c, b, a]).map((w) => [w.start, w.end]), [[0, 20], [30, 40]]);
  // The input isn't mutated.
  assert.equal(a.end, 10);
}

// Plan: several days, finished windows dropped, the running one kept; disabled → empty.
{
  const days = [day('2026-11-17'), day('2026-11-18')];
  const now = at('2026-11-17', '11:58'); // inside Dhuhr (11:55–12:15)
  const plan = planWindows(days, cfg(), iq, true, now);
  assert.equal(plan.length, 9);
  assert.equal(plan[0].label, 'الظهر');
  assert.equal(plan[8].prayers[0].dateKey, '2026-11-18');
  assert.ok(plan.every((w, i) => i === 0 || w.start > plan[i - 1].end));
  assert.deepEqual(planWindows(days, cfg({ enabled: false }), iq, true, now), []);
}

console.log('prayerMode: ok');
