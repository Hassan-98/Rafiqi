/**
 * «محاسبة الجمعة» — the sections of the user's own chapters: صلة الرحم،
 * برامج التدرّج، القضاء. Each compute is PURE on plain data (checked by
 * scripts/fridayReviewSections.test.ts); the registrations at the bottom feed
 * them from the stores. Imported by fridayReviewLive.ts so they register
 * before the review is computed.
 */
import { arCount, days as daysGen } from '@/services/insightsEngine';
import { registerReviewSection, trendOf, type SectionResult, type SectionWindow, type Trend } from '@/services/fridayReview';
import { CONTACT, type ContactType } from '@/data/silatContent';
import {
  categoryOf, countsBetween, diffDays, displayName, isDueNow, isLive, rankPeople, sumCounts, weekCoverage,
  type Person, type SilatEntry,
} from '@/store/silatModel';
import { evaluateRun, type ProgramRun, type ProgramSources } from '@/store/programsModel';
import { dateOf, fastStatus, planFasts, prayerTotals, QADA_PRAYERS, type QadaData } from '@/services/qadaPlan';
import { shiftKey } from '@/store/studyModel';
import { toArabicDigits as n } from '@/utils/arabicFormat';
import { useSilatStore } from '@/store/silatStore';
import { useProgramsStore } from '@/store/programsStore';
import { useQadaStore } from '@/store/qadaStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { readProgramSources } from '@/services/programsSources';

type Forms = [string, string, string, string];
const count = (v: number, f: Forms) => (v ? arCount(v, ...f) : n(0));
const of = (v: number, max: number) => `${n(v)} من ${n(max)}`;
const ratio = (v: number, max: number) => (max > 0 ? Math.min(1, v / max) : null);
/** Ratio rows compare by score (the denominator moves), the rest by value — as the built-in rows do. */
const trendBy = (s: number | null, ps: number | null, v: number, pv: number): Trend =>
  s != null && ps != null ? trendOf(s, ps, 0.001) : trendOf(v, pv);

function movePhrase(v: number, pv: number, t: Trend): string {
  if (v > 0 && pv === 0) return 'بداية طيبة هذا الأسبوع';
  if (v === 0 && pv > 0) return 'غاب هذا الأسبوع';
  if (t === 'up') return 'أحسن من الأسبوع الماضي';
  if (t === 'down') return 'أقل من الأسبوع الماضي';
  return v ? 'كالأسبوع الماضي' : 'لم يُسجَّل هذا الأسبوع';
}

// ── صلة الرحم ──────────────────────────────────────────────────────────────
const TYPE_FORMS: Record<ContactType, Forms> = {
  visit: ['زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة'],
  call: ['اتصال واحد', 'اتصالان', 'اتصالات', 'اتصالاً'],
  message: ['رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'],
  gift: ['هدية واحدة', 'هديتان', 'هدايا', 'هدية'],
  help: ['قضاء حاجة', 'قضاء حاجتين', 'حاجات قُضيت', 'حاجة قُضيت'],
  dua: ['دعاء واحد', 'دعاءان', 'أدعية', 'دعاءً'],
  sadaqah: ['صدقة واحدة', 'صدقتان', 'صدقات', 'صدقة'],
  wudd: ['صلة لأهل الودّ', 'صلتان لأهل الودّ', 'صلات لأهل الودّ', 'صلة لأهل الودّ'],
  video: ['مكالمة فيديو واحدة', 'مكالمتا فيديو', 'مكالمات فيديو', 'مكالمة فيديو'],
  voice: ['رسالة صوتية واحدة', 'رسالتان صوتيتان', 'رسائل صوتية', 'رسالة صوتية'],
  iyada: ['عيادة مريض', 'عيادتان لمريض', 'عيادات لمرضى', 'عيادة لمريض'],
  invite: ['دعوة إلى طعام', 'دعوتان إلى طعام', 'دعوات إلى طعام', 'دعوة إلى طعام'],
  outing: ['نزهة واحدة', 'نزهتان', 'نزهات', 'نزهة'],
  food: ['طبق واحد', 'طبقان', 'أطباق', 'طبقاً'],
  money: ['عون بمال', 'عونان بمال', 'مرات عون بمال', 'مرة عون بمال'],
  congrats: ['تهنئة واحدة', 'تهنئتان', 'تهانٍ', 'تهنئة'],
  condole: ['تعزية واحدة', 'تعزيتان', 'تعازٍ', 'تعزية'],
  islah: ['إصلاح ذات بين', 'إصلاحان', 'مرات إصلاح', 'مرة إصلاح'],
  grave: ['زيارة قبر', 'زيارتا قبر', 'زيارات للقبور', 'زيارة للقبور'],
  debt: ['قضاء دَين أو وصية', 'دَينان أو وصيتان', 'ديون أو وصايا', 'ديناً أو وصية'],
  hajj: ['حجة أو عمرة', 'حجتان أو عمرتان', 'حجج أو عُمَر', 'حجة أو عمرة'],
};
const SILAT: Forms = ['صلة واحدة', 'صلتان', 'صلات', 'صلة'];
/** By effort (visit first), for ties. */
const TYPE_ORDER = (Object.keys(CONTACT) as ContactType[]).sort((a, b) => CONTACT[b].points - CONTACT[a].points);

export function silatSection(
  people: readonly Person[],
  entries: readonly SilatEntry[],
  w: SectionWindow,
  gender?: 'male' | 'female' | null,
): SectionResult | null {
  if (!people.some(isLive)) return null;
  const c = countsBetween(entries, people, w.from, w.to);
  const total = sumCounts(c);
  const prev = sumCounts(countsBetween(entries, people, w.prevFrom, w.prevTo));
  const cov = weekCoverage(people, entries, w.to);
  const prevCov = weekCoverage(people, entries, w.prevTo);
  const trend = trendOf(total, prev);

  // «٣ زيارات · اتصالان»: the two most frequent kinds.
  const top = TYPE_ORDER.filter((t) => c[t] > 0).sort((a, b) => c[b] - c[a]).slice(0, 2);
  const summary = top.length ? top.map((t) => arCount(c[t], ...TYPE_FORMS[t])).join(' · ') : n(0);
  const phrase = !cov.total
    ? movePhrase(total, prev, trend)
    : cov.kept === cov.total
      ? 'لم تتأخّر صلة أحد عن موعدها'
      : `${of(cov.kept, cov.total)} في موعد صلتهم`;

  const focus: string[] = [];
  const parents = people.filter((p) => isLive(p) && !p.deceased && categoryOf(p) === 'parents');
  const rel = new Set(parents.map((p) => p.relation));
  if (rel.has('mother') && rel.has('father')) focus.push('أزور والديّ هذا الأسبوع');
  else if (parents[0]) focus.push(`أزور ${displayName(parents[0], gender)} هذا الأسبوع`);
  const late = rankPeople(people, entries, w.to).find((r) => isDueNow(r) && categoryOf(r.person) !== 'parents');
  if (late) focus.push(`أصل ${displayName(late.person, gender)} قبل الجمعة القادمة`);
  focus.push('أصل أحد أرحامي كل يومين', 'أهدي أحد أرحامي هديةً ولو يسيرة');

  return {
    summary,
    prev: count(prev, SILAT),
    diff: total - prev,
    trend,
    phrase,
    score: cov.pct == null ? null : cov.pct / 100,
    prevScore: prevCov.pct == null ? null : prevCov.pct / 100,
    focus: focus.slice(0, 3),
    to: '/silat',
  };
}

// ── برامج التدرّج ──────────────────────────────────────────────────────────
export function programsSection(runs: readonly ProgramRun[], src: ProgramSources, w: SectionWindow, now: Date): SectionResult | null {
  const evs = runs.map((run) => ({ run, ev: evaluateRun(run, src, now) }));
  const tally = (from: string, to: string) => {
    let done = 0;
    let missed = 0;
    let milestones = 0;
    const finished: string[] = [];
    const missedBy = new Map<string, number>();
    for (const { run, ev } of evs) {
      for (const d of ev.days) {
        if (d.key < from || d.key > to) continue;
        // pending = today's step still open: neither done nor missed yet.
        if (d.state === 'done') {
          done++;
          if (d.milestone && d.milestone < ev.total) milestones++;
        } else if (d.state === 'missed') {
          missed++;
          missedBy.set(run.id, (missedBy.get(run.id) ?? 0) + 1);
        }
      }
      if (ev.finishedOn && ev.finishedOn >= from && ev.finishedOn <= to) finished.push(ev.def.title);
    }
    return { done, due: done + missed, milestones, finished, missedBy };
  };
  const cur = tally(w.from, w.to);
  const prev = tally(w.prevFrom, w.prevTo);
  const running = evs.filter(({ run, ev }) => run.status === 'active' && !ev.finishedOn);
  if (!running.length && !cur.finished.length) return null;

  const score = ratio(cur.done, cur.due);
  const prevScore = ratio(prev.done, prev.due);
  const trend = trendBy(score, prevScore, cur.done, prev.done);
  const phrase = cur.finished.length
    ? cur.finished.length === 1
      ? `أتممت «${cur.finished[0]}»، تقبّل الله`
      : `أتممت ${arCount(cur.finished.length, 'برنامجاً واحداً', 'برنامجين', 'برامج', 'برنامجاً')}، تقبّل الله`
    : cur.milestones
      ? `بلغت ${arCount(cur.milestones, 'مرحلة جديدة', 'مرحلتين', 'مراحل', 'مرحلة')}، بارك الله لك`
      : cur.due && cur.done === cur.due
        ? 'لم تفُتك خطوة، تقبّل الله'
        : cur.due
          ? movePhrase(cur.done, prev.done, trend)
          : 'لا خطوة مستحقّة بعد';

  const weakest = [...running].sort((a, b) => (cur.missedBy.get(b.run.id) ?? 0) - (cur.missedBy.get(a.run.id) ?? 0))[0];
  return {
    summary: cur.due ? of(cur.done, cur.due) : n(cur.done),
    prev: prev.due ? of(prev.done, prev.due) : n(prev.done),
    diff: cur.done - prev.done,
    trend,
    phrase,
    score,
    prevScore,
    focus: [
      'لا أترك خطوة برنامجي يوماً',
      ...(weakest ? [`أثبت على «${weakest.ev.def.title}» حتى أتمّه`] : []),
      'أسجّل خطوتي قبل أن أنام',
    ],
    to: '/programs',
  };
}

// ── القضاء (private: the plan and what was done, never the size of the debt) ─
type QadaInput = Pick<QadaData, 'debts' | 'paid' | 'settings'>;

export function qadaSection(s: QadaInput, w: SectionWindow, offset = 0): SectionResult | null {
  const paidIn = (from: string, to: string) => {
    let prayers = 0;
    let fasts = 0;
    for (const [k, day] of Object.entries(s.paid)) {
      if (k < from || k > to || !day) continue;
      for (const p of QADA_PRAYERS) prayers += Math.max(0, day[p] ?? 0);
      if ((day.fast ?? 0) > 0) fasts++;
    }
    return { prayers, fasts, done: prayers + fasts };
  };
  const paidBefore = (key: string) => Object.fromEntries(Object.entries(s.paid).filter(([k]) => k < key));
  /** The plan over [from, to]: perDay prayers a day (up to what was owed at its start) + the fasts the plan put in it. */
  const planned = (from: string, to: string) => {
    const before = { debts: s.debts, paid: paidBefore(from) };
    const prayers = Math.min(prayerTotals(before).remainingTotal, Math.max(0, Math.floor(s.settings.perDay)) * (diffDays(to, from) + 1));
    const fs = fastStatus(before, dateOf(from), offset);
    const fasts = fs.remaining ? planFasts(fs.remaining, dateOf(from), fs.nextRamadan, offset).days.filter((d) => d.key <= to).length : 0;
    return prayers + fasts;
  };

  const cur = paidIn(w.from, w.to);
  const prev = paidIn(w.prevFrom, w.prevTo);
  const after = { debts: s.debts, paid: paidBefore(shiftKey(w.to, 1)) };
  const fastsLeft = fastStatus(after, dateOf(w.to), offset).remaining;
  const left = prayerTotals(after).remainingTotal + fastsLeft;
  if (!left && !cur.done && !prev.done) return null;

  const plan = planned(w.from, w.to);
  const prevPlan = planned(w.prevFrom, w.prevTo);
  const score = ratio(cur.done, plan);
  const prevScore = ratio(prev.done, prevPlan);
  const trend = trendBy(score, prevScore, cur.done, prev.done);
  const rest = Math.max(0, plan - cur.done);
  const phrase =
    !left && cur.done
      ? 'أتممت القضاء كله، تقبّل الله'
      : plan && !rest
        ? 'وفّيت بالخطة، تقبّل الله'
        : plan
          ? cur.fasts
            ? `منها صوم ${daysGen(cur.fasts)}، بقي ${n(rest)}`
            : `بقي من الخطة ${n(rest)}`
          : movePhrase(cur.done, prev.done, trend);

  return {
    summary: plan ? of(cur.done, plan) : n(cur.done),
    prev: prevPlan ? of(prev.done, prevPlan) : n(prev.done),
    diff: cur.done - prev.done,
    trend,
    phrase,
    score,
    prevScore,
    focus: ['أقضي مع كل فرضٍ فرضاً', ...(fastsLeft ? ['أصوم يوماً من القضاء هذا الأسبوع'] : []), 'أبدأ يومي بصلاةٍ مقضيّة'],
    to: '/qada',
  };
}

// ── registration ───────────────────────────────────────────────────────────
registerReviewSection({
  id: 'silat',
  title: 'صلة الرحم',
  compute: (w) => {
    const { people, entries } = useSilatStore.getState();
    return silatSection(people, entries, w, useSettingsStore.getState().gender);
  },
});

registerReviewSection({
  id: 'programs',
  title: 'برامج التدرّج',
  compute: (w) => programsSection(useProgramsStore.getState().runs, readProgramSources(), w, new Date()),
});

registerReviewSection({
  id: 'qada',
  title: 'القضاء',
  compute: (w) => qadaSection(useQadaStore.getState(), w, useCalendarPrefs.getState().hijriOffset),
});
