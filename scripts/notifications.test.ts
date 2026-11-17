/**
 * Executable check for the notification SCHEDULING logic (pure parts):
 * prayer-day planning, idempotency key, next-fire resolution, action mapping,
 * snooze ids and the qiyam de-duplication rule.
 *
 * Run: npx esbuild scripts/notifications.test.ts --bundle --format=esm --platform=node
 *        --alias:@=./src --outfile=.tmp-test/notif.test.mjs "--define:import.meta.env={}"
 *        --loader:.woff2=empty --loader:.woff=empty --loader:.css=empty --loader:.ttf=empty
 *        --alias:@capacitor/local-notifications=./scripts/fakes/localNotifications.ts
 *      node .tmp-test/notif.test.mjs
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
g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {} } };
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
  const { planPrayerDay, prayerScheduleKey } = await import('@/services/PrayerTimeNotificationScheduler');
  const { nextFireTime } = await import('@/services/notifications/types');
  const { actionKindFor, doneModuleFor, snoozeIdFor } = await import('@/services/notifications/actions');
  const { planSmartNotifications } = await import('@/services/smartNotifications');
  const { SMART_DEFAULTS } = await import('@/store/notificationStore');

  // ── prayer day plan ──────────────────────────────────────────────────────
  const day = (h: number, m = 0) => new Date(2026, 8, 27, h, m).getTime();
  const times = {
    fajr: new Date(day(4, 30)),
    dhuhr: new Date(day(11, 50)),
    asr: new Date(day(15, 15)),
    maghrib: new Date(day(17, 55)),
    isha: new Date(day(19, 25)),
  };
  const on = { enabled: true };
  const extrasOff = { pre: { enabled: false, minutes: 15 }, iqama: { enabled: false, minutes: 15 } };
  const noon = day(12);

  const plan = planPrayerDay(times, 'd0', noon, () => on, extrasOff);
  check('past prayers are skipped', plan.length === 3, plan.map((p) => p.id).join(','));
  check('stable day-slot id', plan[0]?.id === 'myzikr_prayer_time_asr_d0');
  check('adhan carries prayer meta for «صلّيت»', plan[0]?.meta?.prayer === 'asr' && plan[0]?.meta?.kind === 'adhan' && plan[0]?.meta?.dateKey === '2026-09-27');

  const noIsha = planPrayerDay(times, 'd1', 0, (p) => ({ enabled: p !== 'isha' }), extrasOff);
  check('disabled prayer is not armed', !noIsha.some((p) => p.id.includes('isha')) && noIsha.length === 4);

  const extras = { pre: { enabled: true, minutes: 15 }, iqama: { enabled: true, minutes: 2 } };
  const full = planPrayerDay(times, 'd1', 0, () => on, extras);
  check('pre + adhan + iqama per prayer', full.length === 15);
  const pre = full.find((p) => p.id === 'myzikr_prayer_pre_fajr_d1');
  check('pre fires minutes before', !!pre && new Date(pre.triggerTime).getTime() === day(4, 15));
  check('pre body uses Arabic digits + plural', !!pre && pre.body.includes('١٥ دقيقة'), pre?.body);
  const iq = full.find((p) => p.id === 'myzikr_prayer_iqama_fajr_d1');
  check('iqama dual form «دقيقتان»', !!iq && iq.body.includes('دقيقتان'), iq?.body);
  // Each mosque sets its own iqama: per-prayer minutes win, others fall back.
  const mosque = planPrayerDay(times, 'd1', 0, () => on, {
    pre: { enabled: false, minutes: 15 },
    iqama: { enabled: true, minutes: 15, perPrayer: { fajr: 25, maghrib: 4 } },
  });
  const iqAt = (p: string) => {
    const n = mosque.find((x) => x.id === `myzikr_prayer_iqama_${p}_d1`);
    return n ? (new Date(n.triggerTime).getTime() - (times as Record<string, Date>)[p].getTime()) / 60_000 : NaN;
  };
  check('iqama per prayer (fajr 25, maghrib 4, isha falls back to 15)', iqAt('fajr') === 25 && iqAt('maghrib') === 4 && iqAt('isha') === 15, `${iqAt('fajr')}/${iqAt('maghrib')}/${iqAt('isha')}`);
  const offset = planPrayerDay(times, 'd1', 0, (p) => ({ enabled: p === 'fajr', prayerOffsetMinutes: 5 }), extrasOff);
  check('per-prayer offset applied', offset.length === 1 && new Date(offset[0].triggerTime).getTime() === day(4, 35));

  const k1 = prayerScheduleKey(new Date(2026, 8, 27, 0, 30));
  check('idempotency key uses the LOCAL date', k1.startsWith('2026-09-27|'), k1);

  // ── next fire resolution (for «القادم») ──────────────────────────────────
  const now = new Date(2026, 8, 27, 10, 0); // Sunday
  const d1 = nextFireTime({ repeat: 'daily', hour: 6, minute: 30 }, now);
  check('daily past today → tomorrow', !!d1 && d1.getDate() === 28 && d1.getHours() === 6);
  const d2 = nextFireTime({ repeat: 'daily', hour: 21, minute: 0 }, now);
  check('daily later today → today', !!d2 && d2.getDate() === 27);
  const w = nextFireTime({ repeat: 'weekly', hour: 21, minute: 0, weekday: 4 }, now); // Wednesday
  check('weekly → next matching weekday', !!w && w.getDay() === 3 && w.getDate() === 30, String(w));
  const w0 = nextFireTime({ repeat: 'weekly', hour: 9, minute: 0, weekday: 1 }, now); // Sunday 09:00 passed
  check('weekly same day but past → next week', !!w0 && w0.getDate() === 4 && w0.getMonth() === 9, String(w0));
  check('one-shot keeps its time', nextFireTime({ at: day(15), repeat: 'none' })?.getTime() === day(15));

  // ── actions ──────────────────────────────────────────────────────────────
  check('adhan → «صلّيت»', actionKindFor({ moduleId: 'prayers', meta: { prayer: 'fajr', kind: 'adhan' } }) === 'prayer');
  check('pre-adhan → snooze only', actionKindFor({ moduleId: 'prayers', meta: { prayer: 'fajr', kind: 'pre' } }) === 'snooze');
  check('custom/targets/habits/fasting → no «تم»', ['custom', 'targets', 'habits', 'fasting', 'special'].every((m) => actionKindFor({ moduleId: m }) === 'snooze'));
  check('study/tasks keep «تم» (handled by studyReminders)', actionKindFor({ moduleId: 'study' }) === 'reminder' && actionKindFor({ moduleId: 'study.task' }) === 'reminder');
  check('آية وحديث → no buttons', actionKindFor({ moduleId: 'inspiration' }) === 'info');
  check('smart + test → no buttons', actionKindFor({ moduleId: 'smart.weekly' }) === 'info' && actionKindFor({ moduleId: 'test' }) === 'info');
  check('adhkar «تم» logs dhikr', doneModuleFor('dhikr.morning') === 'dhikr' && doneModuleFor('custom') === null);
  check('snooze id is stable', snoozeIdFor('myzikr_qiyam') === 'myzikr_snooze_qiyam' && snoozeIdFor(snoozeIdFor('myzikr_qiyam')) === 'myzikr_snooze_qiyam');
  check('snooze survives the prayer re-arm sweep', !snoozeIdFor('myzikr_prayer_time_fajr_d0').startsWith('myzikr_prayer_'));
  check('cancelAll(module) still reaches a snooze', snoozeIdFor('myzikr_dhikr.morning').endsWith('_dhikr.morning'));

  // ── qiyam: master switch silences the smart one ──────────────────────────
  const snap = {
    dailyProgress: {}, prayerFardDays: {}, qiyamNights: {}, dhikrDays: {}, quranDays: {}, fastingDays: {},
    habitsDays: {}, awradDays: {}, tasbihDays: {}, freezes: {},
  } as never;
  const input = {
    snap,
    now,
    prefs: { ...SMART_DEFAULTS, streak: false, weekly: false, celebrate: false },
    celebrated: {},
    seeded: true,
    nightWindow: () => ({ lastThird: new Date(2026, 8, 28, 2, 40) }),
  };
  let smart: ReturnType<typeof planSmartNotifications> | null = null;
  try {
    smart = planSmartNotifications(input);
  } catch (e) {
    check('smart planner runs on a minimal snapshot', false, String(e));
  }
  if (smart) {
    check('smart qiyam armed when master on', smart.notifications.some((n) => n.kind === 'qiyam'));
    const off = planSmartNotifications({ ...input, qiyamEnabled: false });
    check('smart qiyam silenced by the master switch', !off.notifications.some((n) => n.kind === 'qiyam'));
    const snd = planSmartNotifications({ ...input, qiyamSound: 'silent' });
    check('smart qiyam uses the user ringtone', snd.notifications.find((n) => n.kind === 'qiyam')?.soundKey === 'silent');
  }

  // ── series → display id (one shade slot per reminder series) ─────────────
  const { seriesKeyFor, displayIdFor, hashIdToInt } = await import('@/services/notifications/types');
  const same = (a: string, b: string) => displayIdFor(a) === displayIdFor(b);
  check('wird interval nudges share one slot', same('myzikr_target_abc12_0', 'myzikr_target_abc12_17') && seriesKeyFor('myzikr_target_abc12_3') === 'target_abc12');
  check('different awrad → different slots', !same('myzikr_target_abc12_0', 'myzikr_target_xyz9_0'));
  check('pre/adhan/iqama of a prayer share a slot, across days', same('myzikr_prayer_pre_fajr_d0', 'myzikr_prayer_time_fajr_d3') && same('myzikr_prayer_iqama_fajr_d1', 'myzikr_prayer_time_fajr_d0'));
  check('different prayers → different slots', !same('myzikr_prayer_time_fajr_d0', 'myzikr_prayer_time_isha_d0'));
  check('snooze replaces its original', same(snoozeIdFor('myzikr_prayer_time_asr_d0'), 'myzikr_prayer_time_asr_d0') && same(snoozeIdFor('myzikr_habits_h_1_0630'), 'myzikr_habits_h_1_2100'));
  check('habit times share a slot (id with underscores)', seriesKeyFor('myzikr_habits_h_1_0630') === 'habits_h_1');
  check('study task occurrences + its own snooze share a slot', same('myzikr_study_task_k3x_d', 'myzikr_study_task_k3x_snz') && same('myzikr_study_task_k3x', 'myzikr_study_task_k3x_w2'));
  check('study circle slots share one slot, not the task one', same('myzikr_study_c9_0_15', 'myzikr_study_c9_x77_0') && !same('myzikr_study_c9_goal', 'myzikr_study_task_c9'));
  check('آية وحديث slots share one slot', same('myzikr_insp_0', 'myzikr_insp_23'));
  check('fixed + smart qiyam share a slot', same('myzikr_qiyam', 'myzikr_smart_qiyamnight'));
  check('distinct fixed reminders keep distinct slots', !same('myzikr_dhikr.morning', 'myzikr_dhikr.evening'));
  const allIds = [
    ...Array.from({ length: 24 }, (_, k) => `myzikr_target_abc12_${k}`),
    ...['pre', 'time', 'iqama'].flatMap((kd) => ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].flatMap((p) => [0, 1, 2, 3, 4].map((d) => `myzikr_prayer_${kd}_${p}_d${d}`))),
    ...Array.from({ length: 24 }, (_, k) => `myzikr_insp_${k}`),
  ];
  const alarmIds = new Set(allIds.map(hashIdToInt));
  check('alarm ids stay unique per occurrence', alarmIds.size === allIds.length);
  check('display ids never collide with an alarm id', !allIds.some((id) => alarmIds.has(displayIdFor(id))));

  // ── the Capacitor service against a fake plugin ──────────────────────────
  const { CapacitorNotificationService } = await import('@/services/notifications/CapacitorNotificationService');
  const fake = await import('@capacitor/local-notifications');
  const { pending } = fake as unknown as { pending: Map<number, { extra?: { originalId?: string; meta?: Record<string, string> }; actionTypeId?: string; channelId?: string }> };
  const svc = new CapacitorNotificationService();
  const soon = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  const base = { body: 'x', repeatInterval: 'none' as const, deepLinkPath: '/#/' };
  await svc.scheduleNotification({ ...base, id: 'myzikr_prayer_time_fajr_d1', title: 'f', triggerTime: soon(60), moduleId: 'prayers', meta: { prayer: 'fajr', kind: 'adhan' } });
  await svc.scheduleNotification({ ...base, id: 'myzikr_prayer_time_isha_d1', title: 'i', triggerTime: soon(90), moduleId: 'prayers' });
  await svc.scheduleNotification({ ...base, id: 'myzikr_smart_weekly', title: 'w', triggerTime: soon(120), moduleId: 'smart.weekly' });
  await svc.scheduleNotification({ ...base, id: 'myzikr_custom_old', title: 'o', triggerTime: soon(-5), moduleId: 'custom' });
  const oids = () => [...pending.values()].map((n) => n.extra?.originalId).sort();
  check('past one-shot is not armed', !oids().includes('myzikr_custom_old'));
  const fajrN = [...pending.values()].find((n) => n.extra?.originalId === 'myzikr_prayer_time_fajr_d1');
  check('adhan armed with the «صلّيت» action type + meta', fajrN?.actionTypeId === 'prayer' && fajrN?.extra?.meta?.prayer === 'fajr');
  check('adhan carries its series display id for the patched plugin', (fajrN?.extra as { displayId?: number } | undefined)?.displayId === displayIdFor('myzikr_prayer_time_fajr_d1'));
  await svc.cancelByPrefix('myzikr_prayer_', new Set(['myzikr_prayer_time_fajr_d1']));
  check('prefix sweep keeps the re-armed set', JSON.stringify(oids()) === JSON.stringify(['myzikr_prayer_time_fajr_d1', 'myzikr_smart_weekly']), oids().join(','));
  const list = await svc.getPending();
  check('getPending → sorted, with original ids', list.length === 2 && list[0].id === 'myzikr_prayer_time_fajr_d1' && list[0].at < list[1].at);
  await svc.scheduleNotification({ ...base, id: 'myzikr_dhikr.morning', title: 'm', triggerTime: soon(-600), repeatInterval: 'daily', moduleId: 'dhikr.morning' });
  const daily = (await svc.getPending()).find((n) => n.id === 'myzikr_dhikr.morning');
  check('daily repeat armed even when today’s time passed → next occurrence in the future', !!daily && daily.at.getTime() > Date.now() && daily.repeat === 'daily');
  await svc.cancelAll('dhikr.morning');
  check('cancelAll(module) reaches the dateless id', !(await svc.getPending()).some((n) => n.id === 'myzikr_dhikr.morning'));

  console.log(failures ? `\n${failures} failed` : '\nall passed');
  if (failures) process.exit(1);
}

void main();
