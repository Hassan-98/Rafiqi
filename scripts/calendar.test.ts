/**
 * Executable check for the calendar: Umm al-Qura month grids (Hijri ↔
 * Gregorian) and event placement.
 *
 * Run: npx esbuild scripts/calendar.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/calendar.test.mjs
 *      node .tmp-test/calendar.test.mjs
 */
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

const {
  toHijri, fromHijri, hijriMonthGrid, gregorianMonthGrid, eventsForDate, upcomingEvents, dayKey, countdownAr,
} = await import('../src/services/calendarEvents');

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
const d = (s: string) => new Date(`${s}T12:00:00`);
const ids = (s: string, off = 0) => eventsForDate(d(s), off).map((e) => e.id);

// Conversion (Umm al-Qura reference dates).
const h = toHijri(d('2026-09-27'));
check('2026-09-27 = 16 Rabi al-Akhir 1448', h.year === 1448 && h.month === 4 && h.day === 16, JSON.stringify(h));
check('1 Ramadan 1447 = 2026-02-18', dayKey(fromHijri({ year: 1447, month: 9, day: 1 })) === '2026-02-18');
check('1 Shawwal 1448 = 2027-03-09', dayKey(fromHijri({ year: 1448, month: 10, day: 1 })) === '2027-03-09');
check('offset +1 shifts the Hijri day', toHijri(d('2026-09-27'), 1).day === 17);
check('offset −1 moves 1 Ramadan 1447 a day later', dayKey(fromHijri({ year: 1447, month: 9, day: 1 }, -1)) === '2026-02-19');

// Round-trip across ~3 years.
let rt = true;
for (let i = 0; i < 1100; i += 7) {
  const g = new Date(2025, 0, 1 + i, 12);
  if (dayKey(fromHijri(toHijri(g))) !== dayKey(g)) rt = false;
}
check('Hijri → Gregorian round-trips', rt);

// Hijri month grid: Ramadan 1447.
const ram = hijriMonthGrid(1447, 9, 0);
check('Ramadan 1447 grid has 29 or 30 days', ram.days.length === 29 || ram.days.length === 30, String(ram.days.length));
check('Ramadan 1447 grid starts on 2026-02-18', ram.days[0].key === '2026-02-18');
check('2026-02-18 (Wednesday) sits in column 4 (Sat-first)', ram.leading === 4, String(ram.leading));
check('every grid day is in Ramadan', ram.days.every((x, i) => x.hijri.month === 9 && x.hijri.day === i + 1));

// Gregorian month grid: September 2026 (1st = Tuesday).
const sep = gregorianMonthGrid(2026, 9, 0);
check('Sep 2026 has 30 days, Tue → column 3', sep.days.length === 30 && sep.leading === 3);
check('Sep 2026 grid carries Hijri days', sep.days[26].hijri.day === 16);

// Event placement.
check('Arafah 1447 on 2026-05-26 (with fasting)', ids('2026-05-26').includes('arafah') && eventsForDate(d('2026-05-26'), 0)[0].fast === true);
check('Eid al-Adha 2026-05-27, no sunnah fast suggested', ids('2026-05-27').includes('eid_adha') && !eventsForDate(d('2026-05-27'), 0).some((e) => e.type === 'fasting'));
check('white days on 13–15 of a month', ['2026-09-24', '2026-09-25', '2026-09-26'].every((k) => ids(k).includes('white_days')));
check('no white day on the 16th', !ids('2026-09-27').includes('white_days'));
check('no white day on 13 Dhul-Hijjah (Tashreeq)', !ids(dayKey(fromHijri({ year: 1447, month: 12, day: 13 }))).includes('white_days'));
check('Monday 2026-09-28 → Monday fast', ids('2026-09-28').includes('monday'));
check('Thursday 2026-10-01 → Thursday fast', ids('2026-10-01').includes('thursday'));
check('Friday 2026-10-02 → Friday with Kahf action', eventsForDate(d('2026-10-02'), 0).find((e) => e.id === 'friday')?.actions?.[0].to === '/quran/read/18');
check('Monday in Ramadan → Ramadan, not a sunnah fast', ids('2026-02-23').includes('ramadan') && !ids('2026-02-23').includes('monday'));
const qadr = dayKey(fromHijri({ year: 1447, month: 9, day: 26 }));
check('ليلة ٢٧ shows on the evening of 26 Ramadan', eventsForDate(d(qadr), 0).some((e) => e.id === 'laylat_qadr_27' && e.night));
check('Ashura 1448 on 2026-06-25', ids('2026-06-25').includes('ashura'));

// Upcoming.
const up = upcomingEvents(d('2026-09-27'), 6, 400, 0);
check('upcoming starts with the next white days', up[0]?.event.id === 'white_days' && up[0].daysUntil > 0, JSON.stringify(up[0]?.event.id));
check('upcoming includes Ramadan start', upcomingEvents(d('2026-09-27'), 30, 400, 0).some((u) => u.event.id === 'ramadan_start'));
const tash = upcomingEvents(d('2027-05-10'), 30, 60, 0).filter((u) => u.event.title === 'أيام التشريق');
check('Tashreeq collapses to one upcoming row', tash.length === 1, String(tash.length));
check('countdown copy', countdownAr(12) === 'بعد ١٢ يوماً' && countdownAr(5) === 'بعد ٥ أيام' && countdownAr(1) === 'غداً');

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall calendar checks passed');
