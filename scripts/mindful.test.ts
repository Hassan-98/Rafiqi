// sh: npx esbuild scripts/mindful.test.ts --bundle --format=esm --platform=node --alias:@=./src '--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}' --loader:.woff=empty --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty --outfile=.tmp-test/mindful.mjs && node .tmp-test/mindful.mjs
import assert from 'node:assert/strict';
import {
  DAY_CAP, MINDFUL_DEFAULTS, QUIET_MS, canShowMindful, composeMindful, contextForRoute, dayKey, gendered, nextVariant, openMinuteFor, recordShown,
  salutation, type MindfulData, type MindfulGate,
} from '@/services/mindful';
import { MINDFUL_KICKER, MINDFUL_REMINDERS, type MindfulContext } from '@/data/mindfulReminders';

const at = (d: number, h = 9, m = 0) => new Date(2026, 10, d, h, m); // Nov 2026
const OK: MindfulGate = { onboardingComplete: true, deepLinked: false, busy: false };
const base = (p: Partial<MindfulData> = {}): MindfulData => ({ ...MINDFUL_DEFAULTS, firstSeen: '2026-11-01', ...p });

// ── never ────────────────────────────────────────────────────────────────
assert.equal(canShowMindful('open', base(), OK, at(17, 13)), true, 'fresh user past day one: open shows (after its moment)');
assert.equal(canShowMindful('quran', base(), OK, at(17)), true, 'fresh user: a section shows');
assert.equal(canShowMindful('open', base({ enabled: false }), OK, at(17, 13)), true, 'not a setting any more (owner): stored «off» is ignored');
assert.equal(canShowMindful('open', base(), { ...OK, onboardingComplete: false }, at(17, 13)), false, 'during onboarding');
assert.equal(canShowMindful('open', base(), { ...OK, deepLinked: true }, at(17, 13)), false, 'right after a notification');
assert.equal(canShowMindful('open', base(), { ...OK, busy: true }, at(17, 13)), false, 'alarm / dialog / hidden');
assert.equal(canShowMindful('open', base({ firstSeen: null }), OK, at(17, 13)), false, 'first run not recorded yet');
assert.equal(canShowMindful('open', base({ firstSeen: '2026-11-17' }), OK, at(17, 23)), false, 'first day of use');
assert.equal(canShowMindful('quran', base({ firstSeen: '2026-11-16' }), OK, at(17, 0, 5)), true, 'second day is fine');

// ── «تذكرة اليوم»: a random moment of the first half of the day ───────────
{
  const days = Array.from({ length: 60 }, (_, i) => dayKey(new Date(2026, 10, 1 + i)));
  const mins = days.map(openMinuteFor);
  assert.ok(mins.every((m) => m >= 330 && m <= 720), 'between 05:30 and 12:00');
  assert.ok(new Set(mins).size > 30, 'a different moment most days');
  assert.equal(openMinuteFor('2026-11-17'), openMinuteFor('2026-11-17'), 'stable through the day');
  const m = openMinuteFor('2026-11-17');
  const before = new Date(2026, 10, 17, Math.floor((m - 1) / 60), (m - 1) % 60);
  const atIt = new Date(2026, 10, 17, Math.floor(m / 60), m % 60);
  assert.equal(canShowMindful('open', base(), OK, before), false, 'not before its moment');
  assert.equal(canShowMindful('open', base(), OK, atIt), true, 'from its moment on');
  assert.equal(canShowMindful('open', base(), OK, at(17, 21)), true, 'still today if the app was closed until evening');
}

// ── several a day, never the same kind twice ───────────────────────────────
{
  let d = base();
  d = { ...d, ...recordShown(d, 'open', 0, at(17, 9)) };
  assert.equal(canShowMindful('open', d, OK, at(17, 18)), false, '«تذكرة اليوم» once a day');
  assert.equal(canShowMindful('qiyam', d, OK, at(17, 9, 30)), false, `${QUIET_MS / 60000} min between any two`);
  assert.equal(canShowMindful('qiyam', d, OK, at(17, 10)), true, 'another kind the same day');
  d = { ...d, ...recordShown(d, 'qiyam', 0, at(17, 10)) };
  assert.equal(canShowMindful('qiyam', d, OK, at(17, 22)), false, 'qiyam once a day');
  for (const [i, ctx] of (['quran', 'adhkar', 'awrad'] as MindfulContext[]).entries()) d = { ...d, ...recordShown(d, ctx, 0, at(17, 11 + i)) };
  assert.equal(Object.values(d.lastByContext).filter((k) => k === '2026-11-17').length, DAY_CAP);
  assert.equal(canShowMindful('numbers', d, OK, at(17, 20)), false, `at most ${DAY_CAP} a day`);
  assert.equal(canShowMindful('quran', d, OK, at(18, 9)), true, 'a new day: the same kinds again');
}

// ── rotation ─────────────────────────────────────────────────────────────
for (const ctx of Object.keys(MINDFUL_REMINDERS) as MindfulContext[]) {
  const n = MINDFUL_REMINDERS[ctx].length;
  let d = base();
  const seen: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const v = nextVariant(ctx, d);
    if (seen.length) assert.notEqual(v, seen[seen.length - 1], `${ctx}: never repeats the last one`);
    seen.push(v);
    d = { ...d, ...recordShown(d, ctx, v, at(1 + i)) };
  }
  assert.equal(new Set(seen.slice(0, n)).size, n, `${ctx}: a full cycle shows every variant`);
}

// ── content ──────────────────────────────────────────────────────────────
{
  // Several kinds a day now (owner 2026-11-18): deep pools so the words don't come back soon.
  const min: Partial<Record<MindfulContext, number>> = { open: 10, qada: 5, circles: 5 };
  assert.equal(MINDFUL_KICKER.qada, 'وقفة مع القضاء');
  assert.equal(MINDFUL_KICKER.circles, 'وقفة مع مجالس العلم');
  const quotes = new Set<string>();
  const bodies = new Set<string>();
  for (const ctx of Object.keys(MINDFUL_REMINDERS) as MindfulContext[]) {
    assert.ok(MINDFUL_REMINDERS[ctx].length >= (min[ctx] ?? 6), `${ctx}: enough variants (${MINDFUL_REMINDERS[ctx].length})`);
    assert.ok(MINDFUL_KICKER[ctx], `${ctx}: kicker`);
    MINDFUL_REMINDERS[ctx].forEach((r, i) => {
      assert.ok(!quotes.has(r.quote.text), `${ctx}#${i}: quote used once in all the reminders`);
      assert.ok(!bodies.has(r.body), `${ctx}#${i}: body used once`);
      quotes.add(r.quote.text);
      bodies.add(r.body);
      for (const g of ['male', 'female', null] as const) {
        const body = gendered(r.body, g);
        assert.ok(!/[{}|]/.test(body), `${ctx}#${i} ${g}: no stray template marks`);
        assert.ok(!/!/.test(body), `${ctx}#${i}: no exclamation marks`);
        assert.ok(!/[.،؛؟:](?=\S)/.test(body) && !/\s{2}/.test(body), `${ctx}#${i} ${g}: one space after punctuation`);
      }
      // A vowelled 2nd-person ending left outside {m|f} reads wrong for the other gender.
      assert.ok(!/تَ(?=[\s،.؟:]|$)/.test(gendered(r.body, 'female')), `${ctx}#${i}: no masculine «ـتَ» for a woman`);
      assert.ok(!/تِ(?=[\s،.؟:]|$)/.test(gendered(r.body, 'male')), `${ctx}#${i}: no feminine «ـتِ» for a man`);
      const sentences = r.body.split(/[.؟]/).filter((s) => s.trim()).length;
      assert.ok(sentences >= 2 && sentences <= 4, `${ctx}#${i}: 2–4 sentences (${sentences})`);
      if (r.quote.kind === 'ayah') assert.match(r.quote.text, /^﴿.*﴾$/, `${ctx}#${i}: ayah in ornate brackets`);
      else assert.match(r.quote.text, /«.*»/, `${ctx}#${i}: hadith in quotes`);
      assert.ok(r.quote.ref.trim(), `${ctx}#${i}: reference`);
      if (r.quote.kind === 'ayah') assert.match(r.quote.ref, /^\S+( \S+)?: [٠-٩–]+$/, `${ctx}#${i}: «سورة: رقم»`);
    });
  }
}

// ── gender: salutation + agreement ───────────────────────────────────────
assert.equal(salutation('male'), 'أخي المسلم،');
assert.equal(salutation('female'), 'أختي المسلمة،');
assert.equal(salutation(null), 'أيها المسلم الكريم،');
assert.equal(gendered('{اجعل|اجعلي} همّك', 'female'), 'اجعلي همّك');
assert.equal(gendered('{اجعل|اجعلي} همّك', 'male'), 'اجعل همّك');
assert.equal(gendered('{اجعل|اجعلي} همّك', null), 'اجعل همّك', 'unknown reader: generic masculine');
{
  const q = composeMindful('quran', 2, 'female');
  assert.equal(q.salutation, 'أختي المسلمة،');
  assert.ok(q.body.includes('أنتِ مع القرآن تتعاملين مع الله'), 'quran: feminine verb + pronoun');
  assert.ok(q.body.includes('واسألي نفسك'), 'quran: feminine imperative');
  const m = composeMindful('quran', 2, 'male');
  assert.ok(m.body.includes('أنتَ مع القرآن تتعامل مع الله'), 'quran: masculine');
  const o = composeMindful('open', 3, 'female');
  assert.ok(o.body.includes('قليلٌ تداومين عليه') && o.body.includes('لا ترهقي نفسك بما لا تطيقين'), 'open: feminine throughout');
  const a = composeMindful('awrad', 2, 'female');
  assert.ok(a.body.includes('فكوني مثلهم: عاملةً راجيةً خائفةً'), 'awrad: feminine adjectives');
  const k = composeMindful('qada', 0, 'female');
  assert.ok(k.body.includes('اقضيه حين تذكرينه ولا تؤجّليه'), 'qada: feminine imperative + verbs');
  assert.ok(composeMindful('qada', 0, 'male').body.includes('اقضِه حين تذكره ولا تؤجّله'), 'qada: masculine');
  const c = composeMindful('circles', 3, 'female');
  assert.ok(c.body.includes('لقبٌ تُعرفين به') && c.body.includes('فاطلبيه لترتفعي'), 'circles: feminine throughout');
  assert.ok(composeMindful('open', 10, 'female').body.includes('في وجه أختك'), 'open: a sister for a woman');
  // Every variant that addresses the reader changes for a woman.
  for (const ctx of Object.keys(MINDFUL_REMINDERS) as MindfulContext[]) {
    MINDFUL_REMINDERS[ctx].forEach((r, i) => {
      if (r.body.includes('{')) assert.notEqual(gendered(r.body, 'female'), gendered(r.body, 'male'), `${ctx}#${i}: female form differs`);
    });
  }
  assert.equal(composeMindful('open', 99, 'male').body, composeMindful('open', 0, 'male').body, 'bad index falls back');
}

// ── route → context ──────────────────────────────────────────────────────
const routes: [string, string, MindfulContext | null][] = [
  ['/', '', 'open'],
  ['/quran', '', 'quran'],
  ['/adhkar', '', 'adhkar'],
  ['/tasbih', '', 'adhkar'],
  ['/targets', '', 'awrad'],
  ['/targets', '?tab=awrad', 'awrad'],
  ['/targets', '?tab=qiyam', 'qiyam'],
  ['/targets', '?tab=programs', null], // redirects to /programs (programs left «عباداتي» 2026-11-18)
  ['/targets', '?tab=review', 'review'],
  ['/targets', '?tab=friday', 'review'],
  ['/targets', '?tab=qada', 'qada'],
  ['/targets', '?tab=qada&view=fasts', 'qada'],
  ['/targets', '?tab=circles', 'circles'],
  ['/qada', '', 'qada'],
  ['/qada', '?tab=fasts', 'qada'],
  ['/qiyam', '', 'qiyam'],
  ['/leaderboard', '', 'numbers'],
  ['/stats', '', 'numbers'],
  ['/stats/quran', '?period=week', 'numbers'],
  ['/statsx', '', null],
  ['/badges', '', 'numbers'],
  ['/me', '', 'numbers'],
  ['/programs', '', 'programs'],
  ['/sadaqah', '', 'sadaqah'],
  ['/silat', '', 'silat'],
  ['/study', '?tab=silat', 'silat'],
  ['/study', '', 'study'],
  ['/study', '?tab=tasks', 'study'],
  ['/study', '?tab=circles', 'circles'],
  ['/study/circle/abc', '', 'circles'],
  ['/study/circles', '', null],
  ['/study', '?tab=habits', null],
  ['/module/prayers', '', 'prayer'],
  ['/module/dhikr', '', null],
  ['/friday-review', '', 'review'],
  ['/settings', '', null],
  ['/onboarding', '', null],
];
for (const [p, s, want] of routes) assert.equal(contextForRoute(p, s), want, `${p}${s}`);

assert.equal(dayKey(at(17, 23, 59)), '2026-11-17');

console.log('mindful: all checks passed');
