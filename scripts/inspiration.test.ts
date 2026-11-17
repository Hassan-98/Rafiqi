/**
 * Executable check for the «آية وحديث» engine: day-appropriate picking,
 * deterministic "of the day", slot planning (stable dateless ids, quiet hours,
 * horizon cap, no repeats) and the hadith-favourite id migration.
 *
 * Run: npx esbuild scripts/inspiration.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/inspiration.test.mjs
 *        --loader:.css=empty --loader:.woff2=empty --loader:.woff=empty --loader:.mp3=empty
 *      node .tmp-test/inspiration.test.mjs
 */
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  get length() { return mem.size; },
  key: (i: number) => [...mem.keys()][i] ?? null,
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
g.window = g;

// Old-format favourite persisted by the remote-Bukhari build (store v1).
mem.set('myzikr:hadith', JSON.stringify({
  state: { cache: {}, favorites: [
    { id: 'bukhari_13', arabic: 'x', book: 'صحيح البخاري', number: 13, grade: 'sahih' },
    { id: 'bukhari_tabc', arabic: 'y', book: 'صحيح البخاري' },
  ] },
  version: 1,
}));

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const svc = await import('@/services/inspirationService');
  const rem = await import('@/services/inspirationReminders');
  const { INSPIRATION_DEFAULTS } = await import('@/store/inspirationStore');
  const hadith = (await import('@/data/inspiration/hadith.json')).default;
  const ayat = (await import('@/data/inspiration/ayat.json')).default;
  const items = svc.buildCorpus(hadith as never, ayat as never);

  console.log('corpus');
  const nH = items.filter((i) => i.kind === 'hadith').length;
  const nA = items.filter((i) => i.kind === 'ayah').length;
  check(`hundreds of hadith (${nH}) and ayat (${nA})`, nH >= 600 && nA >= 300);
  check('ids unique', new Set(items.map((i) => i.id)).size === items.length);
  check('no empty text', items.every((i) => i.text.trim().length >= 10));

  // Find real dates by the Umm al-Qura calendar instead of hard-coding them.
  const findDate = (pred: (h: { day: number; month: number }, d: Date) => boolean): Date => {
    const d = new Date(2026, 8, 27, 12);
    for (let i = 0; i < 400; i++, d.setDate(d.getDate() + 1)) {
      const h = svc.hijriOf(d);
      if (h && pred(h, d)) return new Date(d);
    }
    throw new Error('date not found');
  };

  console.log('day context');
  const ramadan = findDate((h) => h.month === 9 && h.day === 5);
  const arafah = findDate((h) => h.month === 12 && h.day === 9);
  const ashura = findDate((h) => h.month === 1 && h.day === 10);
  const friday = findDate((h, d) => d.getDay() === 5 && h.month !== 9 && h.month !== 12 && h.month !== 1);
  const plain = findDate((h, d) => ![1, 4, 5].includes(d.getDay()) && ![1, 8, 9, 12].includes(h.month) && (h.day < 13 || h.day > 15) && !(h.month === 10 && h.day === 1));
  check('Ramadan → رمضان/صيام', svc.dayContext(ramadan).tags.slice(0, 2).join() === 'رمضان,صيام');
  check('Arafah labelled يوم عرفة', svc.dayContext(arafah).label === 'يوم عرفة');
  check('Ashura → عاشوراء', svc.dayContext(ashura).tags[0] === 'عاشوراء');
  check('Friday → جمعة + label', svc.dayContext(friday).tags.includes('جمعة') && svc.dayContext(friday).label === 'يوم الجمعة');
  check('ordinary day has no context', svc.dayContext(plain).strength === 0, JSON.stringify(svc.dayContext(plain)));

  const matchShare = (date: Date) => {
    const ctx = svc.dayContext(date);
    let hit = 0;
    for (let s = 0; s < 400; s++) {
      const p = svc.pickSeeded(items, ctx, svc.seededRandom(s), {});
      if (p && p.tags.some((t) => ctx.tags.includes(t))) hit += 1;
    }
    return hit / 400;
  };
  const rShare = matchShare(ramadan);
  check(`Ramadan picks mostly on-theme (${(rShare * 100).toFixed(0)}%)`, rShare > 0.7);

  console.log('of the day');
  const a1 = svc.pickForDay(items, arafah, 'hadith');
  const a2 = svc.pickForDay(items, new Date(arafah.getTime() + 3600_000), 'hadith');
  check('same day → same hadith', !!a1 && a1.id === a2?.id);
  check('ayah of the day is an ayah', svc.pickForDay(items, plain, 'ayah')?.kind === 'ayah');
  const days = new Set(Array.from({ length: 30 }, (_, i) => svc.pickForDay(items, new Date(2026, 9, 1 + i), 'ayah')?.id));
  check(`30 days → varied ayat (${days.size})`, days.size >= 25);

  console.log('search');
  check('normalised search finds الصبر without harakat', svc.searchItems(items, 'الصبر').length > 5);
  check('multi-word AND', svc.searchItems(items, 'الجنة الصلاة').every((i) => svc.normalizeArabic(i.text).includes('الجنه')));

  console.log('slot planning');
  const s3 = { ...INSPIRATION_DEFAULTS, enabled: true, interval: 'h3' as const };
  const from = new Date(2026, 9, 5, 10, 30);
  const quiet = { start: '23:00', end: '06:00' };
  const times = rem.slotTimes(s3, from, quiet);
  const hhmm = times.map((t) => `${t.getDate()}@${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`);
  check('h3 08–22 from 10:30 → 11,14,17,20 today first', hhmm.slice(0, 4).join() === '5@11:00,5@14:00,5@17:00,5@20:00', hhmm.join(' '));
  check('3-day horizon: 4 + 5 + 5 + 1 slots', times.length === 15, String(times.length));
  const s2 = { ...s3, interval: 'h2' as const, windowStart: '06:00', windowEnd: '23:59' };
  check('quiet hours respected', rem.slotTimes(s2, from, quiet).every((t) => t.getHours() >= 6 && t.getHours() < 23));
  check('never more than MAX_SLOTS', rem.slotTimes({ ...s2, windowStart: '00:00' }, from, null).length <= rem.MAX_SLOTS);
  const daily = rem.slotTimes({ ...s3, interval: 'daily', dailyTime: '23:30' }, from, quiet);
  check('explicit daily time ignores quiet hours', daily.length === 3 && daily.every((t) => t.getHours() === 23));
  check('twice → start + (end − 1h)', rem.dailyMinutes({ ...s3, interval: 'twice' }).join() === `${8 * 60},${21 * 60}`);

  const plan = rem.planInspiration(s3, items, from, { quiet, recent: [] });
  check('ids are stable dateless slot indexes', plan.every((p, i) => p.id === `myzikr_insp_${i}`));
  check('no repeated item in a plan', new Set(plan.map((p) => p.item.id)).size === plan.length);
  const again = rem.planInspiration(s3, items, from, { quiet, recent: [] });
  check('re-plan from same moment is identical', JSON.stringify(again.map((p) => p.item.id)) === JSON.stringify(plan.map((p) => p.item.id)));
  const recent = plan.slice(0, 5).map((p) => p.item.id);
  const later = rem.planInspiration(s3, items, from, { quiet, recent });
  check('recent ring is avoided', later.every((p) => !recent.includes(p.item.id)));
  check('mix=ayat → only ayat', rem.planInspiration({ ...s3, mix: 'ayat' }, items, from, { quiet }).every((p) => p.item.kind === 'ayah'));
  check('notification texts stay short', plan.every((p) => p.item.text.length <= 450));
  const fridayPlan = rem.planInspiration({ ...s3, interval: 'h2' }, items, new Date(friday.getFullYear(), friday.getMonth(), friday.getDate(), 7), { quiet });
  const onFriday = fridayPlan.filter((p) => p.at.getDate() === friday.getDate());
  check('Friday slots carry the occasion label', onFriday.length > 0 && onFriday.every((p) => p.label === 'يوم الجمعة'));

  const pl = rem.toPayload(plan[0]);
  check('deep link opens the exact item', pl.deepLinkPath === `/#/hadith?id=${encodeURIComponent(plan[0].item.id)}`);
  check('payload is one-shot with text + source', pl.repeatInterval === 'none' && pl.body.includes(plan[0].item.text) && pl.body.includes('—'));

  console.log('favourites migration');
  const { useHadithStore } = await import('@/store/hadithStore');
  const favs = useHadithStore.getState().favorites.map((f) => f.id);
  check('bukhari_N → ara-bukhari_N', favs.includes('ara-bukhari_13') && !favs.includes('bukhari_13'), favs.join());
  check('legacy text-hash id kept', favs.includes('bukhari_tabc'));
  check('old-format id still reads as favourite', useHadithStore.getState().isFavorite('bukhari_13'));
  useHadithStore.getState().toggleFavorite({ id: 'ara-bukhari_13', arabic: 'x', book: 'b' });
  check('toggle removes by canonical id', !useHadithStore.getState().isFavorite('ara-bukhari_13'));

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  if (failures) process.exit(1);
}

void main();
