import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { BarChart } from '@/components/stats/BarChart';
import { DistributionBars } from '@/components/stats/DistributionBars';
import { useNow } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { dayKey, parseKey, shiftKey } from '@/store/studyModel';
import { CONTACT, CONTACT_GROUPS, RECONCILE_POINTS, SILAT_DAY_MAX, groupOf, type ContactGroupId } from '@/data/silatContent';
import {
  countsBetween, coverageStreak, displayName, reachRanking, silatPointsOn, sinceText, sumCounts, weekCoverage,
  weekStartKey, weeklyByType, type Person, type TypeCounts,
} from '@/store/silatModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { Avatar } from './silatUi';

/** Twenty-odd kinds read as six colours: one per group. */
const GROUP_COLOR: Record<ContactGroupId, string> = {
  reach: 'var(--color-teal)',
  meet: 'var(--color-teal-dark)',
  give: 'var(--color-gold)',
  occasion: 'var(--color-info)',
  ghayb: 'var(--color-gold-light)',
  after: 'var(--color-gold-dark)',
};
const ORDER = CONTACT_GROUPS.flatMap((g) => g.types);
const groupSum = (c: TypeCounts, id: ContactGroupId) => CONTACT_GROUPS.find((g) => g.id === id)!.types.reduce((n, t) => n + c[t], 0);

function Tile({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <Card className="p-4 text-center">
      <p className={['text-[26px] font-counter font-bold tabular-nums leading-none', gold ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'].join(' ')}>{value}</p>
      <p className="mt-1.5 text-[11.5px] text-text-muted">{label}</p>
    </Card>
  );
}

function PeopleList({ rows, today, empty }: { rows: { person: Person; n: number; last: string | null }[]; today: string; empty: string }) {
  const gender = useSettingsStore((s) => s.gender);
  if (!rows.length) return <p className="text-[12.5px] text-text-muted px-1">{empty}</p>;
  return (
    <Card className="p-1.5">
      <ul className="flex flex-col">
        {rows.map(({ person, n, last }) => (
          <li key={person.id} className="flex items-center gap-3 px-2.5 py-2">
            <Avatar person={person} size={36} />
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{displayName(person, gender)}</span>
              <span className="block text-[11.5px] text-text-muted">آخر صلة: {sinceText(last, today)}</span>
            </span>
            <span className="font-counter tabular-nums text-[15px] font-bold text-teal dark:text-teal-light">{ar(n)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** «إحصاءات»: this week and month, the run of kept weeks, contacts by type, most and least reached. */
export function InsightsView() {
  const people = useSilatStore((s) => s.people);
  const entries = useSilatStore((s) => s.entries);
  const now = useNow(60_000);
  const today = dayKey(now);

  const d = useMemo(() => {
    const ws = weekStartKey(today);
    const monthStart = `${today.slice(0, 8)}01`;
    const from30 = shiftKey(today, -29);
    const ranking = reachRanking(people, entries, from30, today);
    let weekPts = 0;
    for (let k = ws; k <= today; k = shiftKey(k, 1)) weekPts += silatPointsOn(entries, people, k).points;
    return {
      week: sumCounts(countsBetween(entries, people, ws, today)),
      month: countsBetween(entries, people, monthStart, today),
      weeks: weeklyByType(entries, people, today, 8),
      streak: coverageStreak(people, entries, today),
      cov: weekCoverage(people, entries, today),
      most: ranking.filter((r) => r.n > 0).slice(0, 3),
      least: [...ranking].reverse().slice(0, 3),
      weekPts,
    };
  }, [people, entries, today]);

  const monthTotal = sumCounts(d.month);
  const usedGroups = CONTACT_GROUPS.filter((g) => d.weeks.some((w) => groupSum(w.counts, g.id) > 0));

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Tile value={ar(d.week)} label="صلة هذا الأسبوع" />
        <Tile value={ar(monthTotal)} label="صلة هذا الشهر" />
        <Tile value={d.cov.pct === null ? '—' : `${ar(d.cov.pct)}٪`} label="تغطية الأسبوع" />
        <Tile value={ar(d.streak)} label={d.streak === 1 ? 'أسبوع كامل على العهد' : 'أسابيع متتالية على العهد'} gold />
      </div>
      <p className="-mt-3 px-1 text-[11.5px] text-text-muted text-pretty">
        «على العهد»: أسبوع وصلتَ فيه كلَّ من في قائمتك في موعده. نقاط هذا الأسبوع: <span className="font-counter font-bold text-gold-dark dark:text-gold-light">{ar(d.weekPts)}</span>
      </p>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="أسبوعاً بأسبوع" subtitle="آخر ثمانية أسابيع حسب نوع الصلة" />
        <Card className="p-4 flex flex-col gap-3">
          <BarChart
            height={150}
            data={d.weeks.map((w) => {
              const s = parseKey(w.start);
              return {
                label: `${ar(s.getDate())}/${ar(s.getMonth() + 1)}`,
                value: sumCounts(w.counts),
                segments: CONTACT_GROUPS.map((g) => ({ value: groupSum(w.counts, g.id), color: GROUP_COLOR[g.id], label: g.label })).filter((x) => x.value > 0),
              };
            })}
          />
          {usedGroups.length ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="مفتاح الألوان">
              {usedGroups.map((g) => (
                <li key={g.id} className="flex items-center gap-1.5 text-[11.5px] text-text-secondary dark:text-text-on-dark/75">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOR[g.id] }} aria-hidden />
                  {g.label}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="هذا الشهر حسب النوع" />
        <Card className="p-4">
          <DistributionBars
            items={ORDER.filter((t) => d.month[t] > 0).map((t) => ({ label: CONTACT[t].label, value: d.month[t], color: GROUP_COLOR[groupOf(t)] }))}
            emptyLabel="لا صلة مسجّلة هذا الشهر بعد"
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الأكثر صلة" subtitle="آخر ثلاثين يوماً" />
        <PeopleList rows={d.most} today={today} empty="سجّل صلاتك لتظهر هنا." />
      </section>
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الأقل صلة" subtitle="لعلّهم أحوج إلى اتصالك" />
        <PeopleList rows={d.least} today={today} empty="أضف من تحب أن تصلهم." />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="كيف تُحتسب النقاط" subtitle="في «الترتيب»، بحسب الجهد" />
        <Card className="p-1.5">
          <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {CONTACT_GROUPS.map((g) => (
              <li key={g.id} className="flex flex-col gap-1 px-3 py-2.5">
                <span className="text-[11.5px] font-semibold text-text-muted">{g.label}</span>
                <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px]">
                  {g.types.map((t) => (
                    <span key={t} className="text-text-primary dark:text-text-on-dark">
                      {CONTACT[t].label} <span className="font-counter tabular-nums font-bold text-gold-dark dark:text-gold-light">{ar(CONTACT[t].points)}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between px-3 py-2 text-[13px]">
              <span className="text-text-primary dark:text-text-on-dark">أول صلة بعد قطيعة</span>
              <span className="font-counter tabular-nums font-bold text-gold-dark dark:text-gold-light">+{ar(RECONCILE_POINTS)}</span>
            </li>
          </ul>
          <p className="px-3 pb-2.5 pt-1 text-[11.5px] text-text-muted text-pretty">
            كل نوع يُحتسب مرة واحدة لكل شخص في اليوم، وحدّ القسم في اليوم {ar(SILAT_DAY_MAX)} نقطة.
          </p>
        </Card>
      </section>
    </>
  );
}
