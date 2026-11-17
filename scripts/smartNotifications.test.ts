/**
 * Executable check for the smart-notification DECISION logic
 * (planSmartNotifications: snapshot + time + prefs → what to arm).
 *
 * Run: npx esbuild scripts/smartNotifications.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/smart.test.mjs "--define:import.meta.env={}"
 *        --loader:.woff2=empty --loader:.woff=empty --loader:.css=empty --loader:.ttf=empty
 *      (settingsStore → data/appFonts pulls lazy font CSS into the bundle)
 *      node .tmp-test/smart.test.mjs
 *
 * Streaks are computed against the REAL clock by the insights engine, so the
 * fixtures are built relative to today and `now` is today at 10:00.
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
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
if (!('navigator' in g)) g.navigator = { onLine: true };

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const { planSmartNotifications, SMART_IDS } = await import('@/services/smartNotifications');
  const { SMART_DEFAULTS } = await import('@/store/notificationStore');
  const { format, addDays } = await import('date-fns');
  type Input = Parameters<typeof planSmartNotifications>[0];

  const at = (d: Date, h: number, m = 0) => { const t = new Date(d); t.setHours(h, m, 0, 0); return t; };
  const key = (d: Date) => format(d, 'yyyy-MM-dd');
  const today = new Date();
  const now = at(today, 10);
  const k = (off: number) => key(addDays(today, off));
  const dayDone = (dateKey: string) => ({
    dateKey,
    overallRate: 1,
    modules: [{ moduleId: 'dhikr', completed: true, completionRate: 1 }],
  });
  const base = (): Input => ({
    snap: {
      dailyProgress: { [k(-1)]: dayDone(k(-1)), [k(-2)]: dayDone(k(-2)), [k(-3)]: dayDone(k(-3)) },
      prayerFardDays: { [k(-1)]: 5, [k(-2)]: 5 },
      qiyamNights: {},
    },
    now,
    prefs: { ...SMART_DEFAULTS },
    celebrated: {},
    seeded: true,
    pagesByDay: { [k(-1)]: 4 },
    // last third of night N starts at 02:40 the next morning
    nightWindow: (nk: string) => ({ lastThird: at(addDays(new Date(`${nk}T12:00:00`), 1), 2, 40) }),
  });
  const find = (input: Input, id: string) => planSmartNotifications(input).notifications.find((n) => n.id === id);

  // ── streak at risk ────────────────────────────────────────────────────
  const s1 = find(base(), SMART_IDS.streak);
  check('streak nudge armed tonight at 21:00', !!s1 && s1.at.getTime() === at(today, 21).getTime(), String(s1?.at));
  check('streak nudge prefers the prayers streak', s1?.deepLinkPath === '/#/module/prayers', s1?.deepLinkPath);
  check('streak nudge is informational (no «تم» → no fake completion)', s1?.moduleId === 'smart.streak');

  const done = base();
  done.snap.dailyProgress[k(0)] = dayDone(k(0));
  done.snap.prayerFardDays[k(0)] = 5;
  const s2 = find(done, SMART_IDS.streak);
  check('logged today → nudge moves to tomorrow 21:00', !!s2 && s2.at.getTime() === at(addDays(today, 1), 21).getTime(), String(s2?.at));

  const quiet = base();
  quiet.prefs = { ...quiet.prefs, quietStart: '20:00', quietEnd: '06:00' };
  const s3 = find(quiet, SMART_IDS.streak);
  check('quiet hours from 20:00 → nudge at 19:30', !!s3 && s3.at.getTime() === at(today, 19, 30).getTime(), String(s3?.at));

  const off = base();
  off.prefs = { ...off.prefs, streak: false };
  check('streak toggle off → no nudge', !find(off, SMART_IDS.streak));

  const late = base();
  late.now = at(today, 22);
  const s4 = find(late, SMART_IDS.streak);
  check('after 21:00 with today unlogged → no misleading nudge for tomorrow', !s4, String(s4?.at));

  // ── qiyam ─────────────────────────────────────────────────────────────
  const q1 = find(base(), SMART_IDS.qiyam);
  check('qiyam armed at tonight\'s last third (02:40 tomorrow)', !!q1 && q1.at.getTime() === at(addDays(today, 1), 2, 40).getTime(), String(q1?.at));
  check('qiyam ignores quiet hours', !!find(quiet, SMART_IDS.qiyam));
  const qLogged = base();
  qLogged.snap.qiyamNights[k(0)] = { nightKey: k(0), rakaat: 4, witr: true, loggedAt: 0 };
  check('tonight already logged → no qiyam reminder', !find(qLogged, SMART_IDS.qiyam));
  const qNoLoc = base();
  qNoLoc.nightWindow = () => null;
  check('no location → no qiyam reminder', !find(qNoLoc, SMART_IDS.qiyam));

  // ── weekly ────────────────────────────────────────────────────────────
  const w = find(base(), SMART_IDS.weekly);
  check('weekly armed on a Friday at 18:00', !!w && w.at.getDay() === 5 && w.at.getHours() === 18 && w.at > now, String(w?.at));
  check('weekly body carries real numbers', !!w && w.body.includes('أيام العبادة') && w.body.includes('القراءة'), w?.body);
  const fresh = base();
  fresh.snap.dailyProgress = {};
  check('brand-new user → no weekly summary', !find(fresh, SMART_IDS.weekly));

  // ── celebrate once ────────────────────────────────────────────────────
  // qiyam.record-rakaat: ≥8 rakaat on the current night (before noon = last night).
  const rec = () => {
    const i = base();
    i.snap.qiyamNights[k(-1)] = { nightKey: k(-1), rakaat: 10, witr: true, loggedAt: 0 };
    return i;
  };
  const unseeded = rec();
  unseeded.seeded = false;
  const p0 = planSmartNotifications(unseeded);
  check('first run seeds existing facts silently', !p0.notifications.some((n) => n.id === SMART_IDS.celebrate) && Object.keys(p0.celebrated).length > 0);

  const p1 = planSmartNotifications(rec());
  const c1 = p1.notifications.find((n) => n.id === SMART_IDS.celebrate);
  check('new record celebrated ~20 min later', !!c1 && c1.at.getTime() === now.getTime() + 20 * 60000, String(c1?.at));
  check('celebration is written to the ledger', Object.keys(p1.celebrated).length === 1);

  const again = rec();
  again.celebrated = Object.fromEntries(Object.keys(p1.celebrated).map((x) => [x, now.getTime() - 60000]));
  check('already celebrated → not again', !find(again, SMART_IDS.celebrate));

  const pending = rec();
  pending.celebrated = { ...p1.celebrated };
  const c2 = find(pending, SMART_IDS.celebrate);
  check('pending celebration keeps its time on re-plan', !!c2 && c2.at.getTime() === c1?.at.getTime());

  const capped = rec();
  capped.celebrated = { 'other.fact|x': now.getTime() - 3600000 };
  check('one celebration per day cap', !find(capped, SMART_IDS.celebrate));

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}

void main();
