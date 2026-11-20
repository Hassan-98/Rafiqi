import { addDays, getDaysInMonth } from 'date-fns';
import type { CompanionCandidate } from '@/services/attention/registry';
import { raceOf, pointsText as pts, type Totals } from '@/services/selfRace';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

/**
 * «لحظات الترتيب» — PURE (tested: scripts/selfRace.test.ts). The few moments
 * worth a notification, handed to «رفيقك اليومي» as a companion source
 * (attention/plugins.ts), which spaces, caps and quiets them like the rest:
 *  - «سباقك مع نفسك» in the evening, when yesterday is within reach (local
 *    points, so exact: they only move when something is logged in the app);
 *  - a crown at stake near the end of a day / Friday / the month's last day,
 *    from the last check of the board — its numbers only when that check is
 *    fresh, otherwise softer words;
 *  - Saturday morning: a new week, everyone from zero.
 * At most one a day (the weightiest), all of them off with prefs.race.
 */

type Period = 'today' | 'week' | 'month';
export interface MomentsInput {
  now: Date;
  /** Points per local day (leaderboard.localTotals). */
  totals: Totals;
  /** Taking part in the board, and it answered at the last check. */
  board: boolean;
  /** When the board was last read (ms). */
  checkedAt: number;
  mine: Partial<Record<Period, { rank: number; points: number; total: number } | null>>;
  heads: Partial<Record<Period, { first: number; second: number | null }>>;
  /** Today's Isha (null without a location). */
  isha?: Date | null;
  female?: boolean;
}

const FRESH_MS = 3 * 3_600_000;
const at = (day: Date, h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

/** The crown of `p` within reach (I'm second, close) or at risk (I lead, narrowly). */
function crownMoment(
  i: MomentsInput,
  p: Period,
  when: Date,
  near: (first: number) => number,
  narrow: number,
  words: { chase: string; hold: string; ends: string },
): CompanionCandidate | null {
  const me = i.mine[p];
  const h = i.heads[p];
  if (!i.board || !me || !h || me.total < 2 || when <= i.now) return null;
  const fresh = when.getTime() - i.checkedAt <= FRESH_MS;
  const g = (m: string, f: string) => (i.female ? f : m);
  const to = `/leaderboard?tab=${p}`;
  if (me.rank === 2 && h.first > me.points && h.first - me.points <= near(h.first)) {
    return {
      key: `crown-${p}`,
      title: words.chase,
      body: fresh
        ? `بينك وبين المتصدّر ${pts(h.first - me.points)}، و${words.ends}`
        : `${g('كنتَ', 'كنتِ')} قريباً من المتصدّر، فافتح الترتيب لترى الفارق الآن — ${words.ends}`,
      at: when,
      latest: new Date(when.getTime() + 45 * 60_000),
      to,
      label: 'لحظات الترتيب',
    };
  }
  if (me.rank === 1 && h.second != null && h.second > 0 && h.first - h.second <= narrow) {
    return {
      key: `crown-${p}`,
      title: words.hold,
      body: fresh
        ? `والذي يليك على بُعد ${pts(h.first - h.second)} — ${words.ends}`
        : `والمنافسة قريبة، فافتح الترتيب لترى الفارق الآن — ${words.ends}`,
      at: when,
      latest: new Date(when.getTime() + 45 * 60_000),
      to,
      label: 'لحظات الترتيب',
    };
  }
  return null;
}

export function raceMoments(i: MomentsInput): CompanionCandidate[] {
  const { now } = i;
  const today = at(now, 0);
  const g = (m: string, f: string) => (i.female ? f : m);
  const out: CompanionCandidate[] = [];

  // The next three days: the weightiest moment of each.
  for (let d = 0; d <= 2; d++) {
    const day = addDays(today, d);
    const picks: (CompanionCandidate | null)[] = [];

    // The month's last day.
    if (day.getDate() === getDaysInMonth(day)) {
      picks.push(
        crownMoment(i, 'month', at(day, 15), (f) => Math.max(150, f * 0.2), 60, {
          chase: 'يومٌ أخير على تاج الشهر',
          hold: 'تاج الشهر معك، ويُحسم الليلة',
          ends: 'يُحسم الشهر الليلة',
        }),
      );
    }
    // Friday: the week's last day.
    if (day.getDay() === 5) {
      picks.push(
        crownMoment(i, 'week', at(day, 16), (f) => Math.max(80, f * 0.25), 30, {
          chase: 'يومٌ أخير على تاج الأسبوع',
          hold: 'تاج الأسبوع معك، ويُحسم الليلة',
          ends: 'يُحسم الأسبوع الليلة',
        }),
      );
    }
    if (d === 0) {
      picks.push(
        crownMoment(i, 'today', at(day, 21), (f) => Math.max(40, f * 0.3), 15, {
          chase: 'تاج اليوم في متناولك',
          hold: 'تاج اليوم معك',
          ends: 'بقي من اليوم ثلاث ساعات',
        }),
      );

      // «سباقك مع نفسك»: exact, since today's points only move when something is logged.
      const when = i.isha ? new Date(Math.max(i.isha.getTime() + 30 * 60_000, at(day, 20).getTime())) : at(day, 20, 30);
      const r = raceOf('today', i.totals, now);
      if (when > now && r.now > 0) {
        const gap = r.ghost - r.now;
        if (r.ghost >= 20 && gap > 0 && gap <= Math.max(30, r.ghost / 2)) {
          picks.push({
            key: 'self',
            title: 'سباقك مع نفسك',
            body: `باقٍ ${pts(gap)} ${g('لتتجاوز', 'لتتجاوزي')} أمسك (${ar(r.ghost)})، وما زال في يومك متّسع`,
            at: when,
            to: '/leaderboard',
            label: 'لحظات الترتيب',
          });
        } else if (r.record && r.now >= r.ghost && r.now < r.record.points && r.record.points - r.now <= 30) {
          picks.push({
            key: 'self',
            title: 'رقمك القياسي قريب',
            body: `على بُعد ${pts(r.record.points - r.now)} من أفضل يوم لك (${ar(r.record.points)})`,
            at: when,
            to: '/leaderboard',
            label: 'لحظات الترتيب',
          });
        }
      }
    }
    // Saturday morning: a new week.
    if (day.getDay() === 6 && at(day, 9) > now) {
      picks.push({
        key: 'new-week',
        title: 'أسبوع جديد، والكل من الصفر',
        body: i.board ? 'تاج الأسبوع لمن يسبق، وأول من تسابقه أسبوعك الماضي' : 'اجعله خيراً من الذي قبله — أسبوعك الماضي هو خصمك',
        at: at(day, 9),
        latest: at(day, 11),
        to: '/leaderboard?tab=week',
        label: 'لحظات الترتيب',
      });
    }

    const pick = picks.find(Boolean);
    if (pick) out.push(pick);
  }
  return out;
}
