/**
 * Where features plug into «يحتاج انتباهك» (Home) and «رفيقك اليومي»
 * (notifications) — see ./registry.ts for the API. Imported for its side
 * effects by the Home card and the notification wiring, so a registration
 * here is live at boot. One block per feature; read the feature's store
 * with getState() inside `collect` / `nudges`.
 */
import { houseAttention } from '@/services/attention/house';
import { useHouseStore } from '@/store/houseStore';
import { registerAttentionSource, registerCompanionSource, type SourceContext } from '@/services/attention/registry';
import type { AttentionItem } from '@/services/dayAttention';
import { useSilatStore } from '@/store/silatStore';
import { silatAttention } from '@/store/silatModel';
import { useQadaStore } from '@/store/qadaStore';
import { qadaAttention } from '@/services/qadaPlan';
import { useProgramsStore } from '@/store/programsStore';
import { programAttention } from '@/store/programsModel';
import { readProgramSources } from '@/services/programsSources';
import { useFridayReviewStore } from '@/store/fridayReviewStore';
import { fridayReviewAttention } from '@/services/fridayReview';
import { useGroupsStore } from '@/store/groupsStore';
import { groupNudges } from '@/services/groupsLogic';
import { addDays } from 'date-fns';
import { useMushafiStore } from '@/store/mushafiStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hifzModel, reviewReminder } from '@/services/hifzModel';

registerAttentionSource({
  id: 'house',
  collect: (ctx) => (ctx.gender === 'female' ? houseAttention(useHouseStore.getState().entries, ctx.now) : []),
});

// ── The 2026-11 chapters (each owns its pure item builder + tests) ──────────

/** «موجز الصباح»: one line — the first item's title — on today's brief only. */
const firstTitle = (items: readonly { title: string }[]) => items.slice(0, 1).map((i) => i.title);

// «صلة الرحم»: a parent late/due, the others due today, a sick visit, an occasion («اتصل بخالتك»).
const silat = (ctx: SourceContext): AttentionItem[] => {
  const s = useSilatStore.getState();
  return silatAttention(s.people, s.entries, ctx.now, ctx.gender ?? undefined);
};
registerAttentionSource({ id: 'silat', collect: silat });
registerCompanionSource({ id: 'silat', brief: (ctx, day) => (day === ctx.today ? firstTitle(silat(ctx)) : []) });

// «قضاء ما فات»: tomorrow's planned fast, the pre-Ramadan countdown, today's prayer plan from noon.
const qada = (ctx: SourceContext) => qadaAttention(useQadaStore.getState(), ctx.now, ctx.hijriOffset);
registerAttentionSource({ id: 'qada', collect: qada });
registerCompanionSource({ id: 'qada', brief: (ctx, day) => (day === ctx.today ? firstTitle(qada(ctx)) : []) });

// «برامج التدرّج»: today's open step, a missed run, a strict restart, tomorrow's program fast.
const programs = (ctx: SourceContext) => programAttention(useProgramsStore.getState().runs, readProgramSources(), ctx.now, ctx.times);
registerAttentionSource({ id: 'programs', collect: programs });
registerCompanionSource({ id: 'programs', brief: (ctx, day) => (day === ctx.today ? firstTitle(programs(ctx)) : []) });

// «محاسبة الجمعة»: open Thursday evening → Saturday until done.
registerAttentionSource({
  id: 'friday',
  collect: (ctx) => {
    const i = fridayReviewAttention(useFridayReviewStore.getState(), ctx.now);
    return i ? [i] : [];
  },
});

// «المجموعات»: my unread juz in a group khatma, a shared dhikr goal ending today/tomorrow.
const groups = (ctx: SourceContext) => groupNudges(useGroupsStore.getState().list ?? [], ctx.today);
registerAttentionSource({
  id: 'groups',
  collect: (ctx) =>
    groups(ctx).map((n): AttentionItem => ({
      id: n.id,
      level: n.kind === 'goal' ? 'closing' : 'suggest',
      icon: 'people',
      kicker: 'المجموعات',
      title: n.title,
      body: n.body,
      to: n.to,
      weight: 'extra',
    })),
});
registerCompanionSource({
  id: 'groups',
  nudges: (ctx) =>
    groups(ctx).map((n) => ({
      key: n.id,
      title: n.title,
      body: n.body,
      to: n.to,
      label: 'المجموعات',
      at: ctx.times ? new Date(ctx.times.asr.getTime() + 60 * 60_000) : new Date(ctx.now.getTime() + 3_600_000),
    })),
  brief: (ctx, day) => (day === ctx.today ? firstTitle(groups(ctx)) : []),
});

// «الحفظ والمراجعة»: the day's review (القريب, the share of البعيد) while pages are left —
// on Home, in the morning brief, and a daily reminder at the user's time (owner 2026-11-20).
// No `acted`: asked for daily, it is never eased off.
const hifzOn = (now: Date) => {
  const { code, sessions } = useMushafiStore.getState();
  return code ? reviewReminder(hifzModel(sessions, now.getTime(), useSettingsStore.getState().hifzCycle)) : null;
};
registerAttentionSource({
  id: 'hifz',
  collect: (ctx) => {
    const r = hifzOn(ctx.now);
    return r
      ? [{ id: `hifz-${ctx.today}`, level: 'suggest', icon: 'quran', kicker: 'الحفظ والمراجعة', title: r.title, body: r.body, to: '/hifz', weight: 'sunnah', habit: 'hifz' }]
      : [];
  },
});
registerCompanionSource({
  id: 'hifz',
  nudges: (ctx) => {
    const { hifzRemind, hifzRemindAt } = useSettingsStore.getState();
    if (!hifzRemind) return [];
    return [0, 1, 2].flatMap((i) => {
      const day = addDays(ctx.now, i);
      const fajr = ctx.timesOf(day)?.fajr;
      const at = new Date(day);
      if (hifzRemindAt) at.setHours(...(hifzRemindAt.split(':').map(Number) as [number, number]), 0, 0);
      else if (fajr) at.setTime(fajr.getTime() + 30 * 60_000);
      else at.setHours(7, 0, 0, 0);
      // ponytail: the next days are planned from today's record — re-planned on every sync and return to the app.
      const r = at > ctx.now ? hifzOn(at) : null;
      // A time the user set is theirs, even inside quiet hours.
      return r ? [{ key: 'review', title: r.title, body: r.body, at, to: '/hifz', weight: 'sunnah' as const, label: 'مراجعة الحفظ', quietOk: !!hifzRemindAt }] : [];
    });
  },
  brief: (ctx, day) => {
    const r = day === ctx.today ? hifzOn(ctx.now) : null;
    return r ? [r.title.replace('مراجعة حفظك اليوم: ', 'مراجعة حفظك ')] : [];
  },
});
