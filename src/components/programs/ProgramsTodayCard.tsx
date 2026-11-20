import { useNavigate } from 'react-router';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { useSettingsStore } from '@/store/settingsStore';
import { dayNumber } from '@/store/programsModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { CheckIn } from './CheckIn';
import { todayLine } from './RunCard';
import { IconChip, StatePill, isRunning, useProgramEvals } from './programsUi';

/**
 * Home: today's step of every running «برنامج تدرّج», with its one-tap
 * check-in. Renders nothing when no program runs. Self-contained (reads the
 * stores) — drop it anywhere: <ProgramsTodayCard />.
 */
export function ProgramsTodayCard({ max = 3 }: { max?: number }) {
  const navigate = useNavigate();
  const male = useSettingsStore((s) => s.gender) === 'male';
  const { runs, evals } = useProgramEvals();
  const live = runs.filter((r) => isRunning(r.status, evals.get(r.id)) && evals.get(r.id)!.started);
  if (!live.length) return null;
  const doneCount = live.filter((r) => evals.get(r.id)!.today?.state === 'done').length;
  const due = live.filter((r) => ['pending', 'done'].includes(evals.get(r.id)!.today?.state ?? '')).length;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="برامج التدرّج"
        subtitle={due ? `${ar(doneCount)} من ${ar(due)} خطوات اليوم` : 'لا خطوات اليوم'}
        action={
          <button type="button" onClick={() => navigate('/programs')} className="text-[12.5px] font-semibold text-teal dark:text-teal-light min-h-9 px-2">
            الكل
          </button>
        }
      />
      <Card className="p-1.5">
        <ul className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {live.slice(0, max).map((r) => {
            const ev = evals.get(r.id)!;
            const t = ev.today;
            return (
              <li key={r.id} className="px-2.5 py-3 flex flex-col gap-2.5">
                <button type="button" onClick={() => navigate(`/programs?run=${r.id}`)} className="flex items-center gap-3 text-start">
                  <IconChip def={ev.def} size={38} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{ev.def.title}</span>
                    <span className="block text-[12px] text-text-muted truncate">
                      اليوم {ar(dayNumber(ev))} من {ar(ev.total)} · {todayLine(r, ev, male)}
                    </span>
                  </span>
                  {!ev.paused ? <StatePill day={t} /> : null}
                </button>
                {t?.state === 'pending' && !ev.paused ? <CheckIn run={r} ev={ev} day={t} compact /> : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
