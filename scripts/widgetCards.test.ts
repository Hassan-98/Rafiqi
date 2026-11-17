/**
 * Executable check for the Home-card widgets' snapshot fields (calendar card, prayer card)
 * and the «prayer.toggle» widget action — src/services/widgetBridge.ts.
 *
 * Run: npx esbuild scripts/widgetCards.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --loader:.woff2=empty --loader:.svg=empty --loader:.css=empty
 *        --outfile=.tmp-test/widgetCards.test.mjs
 *      node .tmp-test/widgetCards.test.mjs
 */
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

const { applyWidgetAction, buildSnapshot } = await import('../src/services/widgetBridge');
const { usePrayerLogStore } = await import('../src/store/prayerLogStore');
const { useProgressStore } = await import('../src/store/progressStore');
const { useSettingsStore } = await import('../src/store/settingsStore');
const { dayKey } = await import('../src/store/studyModel');

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const today = dayKey(Date.now());
let s = buildSnapshot();
const d0 = s.calendar.days[0];
check('no location → no prayer days', s.prayerDays.length === 0);
check('calendar: a week from today', s.calendar.days.length === 7 && d0.key === today, JSON.stringify(s.calendar.days.map((d) => d.key)));
check('calendar: card labels', d0.weekday.length > 0 && d0.greg.endsWith(' م'), `${d0.weekday} ${d0.greg}`);
check('calendar: ≤ 3 chips with a type', d0.chips.length <= 3 && d0.chips.every((c) => c.title && c.type));
check('calendar: upcoming after today', s.calendar.upcoming.length > 0 && s.calendar.upcoming.every((u) => u.key > today));
check('calendar: next = upcoming[0]', JSON.stringify(s.calendar.next) === JSON.stringify(s.calendar.upcoming[0]));

useSettingsStore.setState({ coords: { latitude: 30.0444, longitude: 31.2357 } });
s = buildSnapshot();
check('prayer days: a week from today', s.prayerDays.length === 7 && s.prayerDays[0].key === today);
check('prayer days: five ascending times', s.prayerDays.every((d) => d.times.length === 5 && d.times.every((t, i) => i === 0 || t > d.times[i - 1])));

// «prayer.toggle» = tapping a prayer on Home's card.
applyWidgetAction({ type: 'prayer.toggle', id: 'fajr', done: true, date: today, at: Date.now() });
check('logs the fard', !!usePrayerLogStore.getState().log[today]?.fajr?.fard);
check('snapshot prayerLog', JSON.stringify(buildSnapshot().prayerLog) === JSON.stringify({ key: today, fard: ['fajr'], adhkar: [], excused: false, male: false }));
applyWidgetAction({ type: 'prayer.toggle', id: 'fajr', done: true, date: today });
check('idempotent', usePrayerLogStore.getState().getFardCount(today) === 1);
for (const p of ['dhuhr', 'asr', 'maghrib', 'isha']) applyWidgetAction({ type: 'prayer.toggle', id: p, done: true, date: today });
const prayers = () => useProgressStore.getState().getTodayProgress()?.modules.find((m) => m.moduleId === 'prayers');
check('five fard → prayers complete', !!prayers()?.completed);
applyWidgetAction({ type: 'prayer.toggle', id: 'fajr', done: false, date: today });
check('unlog', !usePrayerLogStore.getState().log[today]?.fajr?.fard && !prayers()?.completed);
applyWidgetAction({ type: 'prayer.toggle', id: 'fajr', date: today }); // no `done` → ignored
applyWidgetAction({ type: 'prayer.toggle', id: 'witr', done: true, date: today }); // not a fard → ignored
check('malformed ignored', usePrayerLogStore.getState().getFardCount(today) === 4);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall widget card checks passed');
