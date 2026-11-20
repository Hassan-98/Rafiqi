import { useNavigate } from 'react-router';
import { ChevronLeft, Lightbulb } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useSettingsStore } from '@/store/settingsStore';
import { WEEKDAY_NAME, dayNumber, stepTextOn, tipOf, weekdayOf, type ProgramRun, type RunEval } from '@/store/programsModel';
import { parseKey } from '@/store/studyModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { CheckIn } from './CheckIn';
import { IconChip, ProgressBar, StatePill } from './programsUi';

/** What the open day holds, in words — «خطوة اليوم: ٤ ركعات والوتر», or why there is none. */
export function todayLine(run: ProgramRun, ev: RunEval, male: boolean): string {
  const t = ev.today;
  if (!ev.started) {
    const d = parseKey(run.startDay);
    return `يبدأ ${WEEKDAY_NAME[d.getDay()]} ${ar(d.getDate())}`;
  }
  if (ev.paused || t?.state === 'paused') return 'موقوف مؤقتاً، تستأنفه متى شئت';
  if (t?.state === 'excused') return 'يوم عذر: لا يُحتسب ولا يقطع برنامجك';
  if (t?.state === 'rest' || !t) return ev.nextDue ? `استراحة. خطوتك القادمة ${WEEKDAY_NAME[weekdayOf(ev.nextDue)]}` : 'استراحة اليوم';
  if (t.state === 'missed') return 'سُجّلت زلّة اليوم، وغداً بداية جديدة';
  return stepTextOn(ev.def, t.target, t.key, male, run.name, ev.def.steps[t.step]);
}

/** A running program on the hub: day N of M, today's step and its check-in. */
export function RunCard({ run, ev }: { run: ProgramRun; ev: RunEval }) {
  const navigate = useNavigate();
  const male = useSettingsStore((s) => s.gender) === 'male';
  const t = ev.today;
  const tip = t && (t.state === 'pending' || t.state === 'done') ? tipOf(ev.def, t.step) : undefined;
  const open = () => navigate(`/programs?run=${run.id}`);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <button type="button" onClick={open} className="flex items-center gap-3 text-start -m-1 p-1 rounded-[var(--radius-inner)] hover:bg-teal/5">
        <IconChip def={ev.def} />
        <span className="flex-1 min-w-0">
          <span className="block text-[11.5px] text-text-muted">
            {ev.started ? (
              <>
                اليوم <span className="font-counter tabular-nums">{ar(dayNumber(ev))}</span> من{' '}
                <span className="font-counter tabular-nums">{ar(ev.total)}</span>
              </>
            ) : (
              'لم يبدأ بعد'
            )}
            {ev.restarts ? <> · بدأ من جديد {ar(ev.restarts)}×</> : null}
          </span>
          <span className="block text-[15px] font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">{ev.def.title}</span>
        </span>
        <ChevronLeft size={18} className="text-text-muted shrink-0" aria-hidden />
      </button>

      <ProgressBar ev={ev} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark text-pretty">{todayLine(run, ev, male)}</p>
        {ev.started && !ev.paused ? <StatePill day={t} className="mt-0.5" /> : null}
      </div>

      {t && ev.started && !ev.paused ? <CheckIn run={run} ev={ev} day={t} compact /> : null}

      {tip ? (
        <p className="flex items-start gap-1.5 text-[12px] text-text-muted text-pretty">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          {tip}
        </p>
      ) : null}
    </Card>
  );
}
