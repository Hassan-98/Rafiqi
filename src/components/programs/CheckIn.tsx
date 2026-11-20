import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, Check, ExternalLink, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/NumberInput';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { useProgramsStore } from '@/store/programsStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/store/toastStore';
import { hapticsService } from '@/services/HapticsService';
import { openMushafi } from '@/services/mushafi';
import { logDuha, logFast, logQiyamUnits, setPrayerFlag, useProgramSources } from '@/services/programsSources';
import {
  ADHKAR_LABEL, PROGRAM_POINTS, WEEKDAY_NAME, adhkarSets, milestonesOf, quranPagesOn, rawatibSlotsOn, stepTextOn, weekdayOf,
  type DayEval, type ProgramRun, type RunEval,
} from '@/store/programsModel';
import { PRAYERS_ORDER } from '@/store/prayerLogStore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import type { PrayerName } from '@/types';

const PRAYER_AR: Record<PrayerName, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={[
        'min-h-11 px-3 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-[background-color,color,transform] duration-200 ease-out-soft active:scale-[0.97]',
        on
          ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
          : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10',
      ].join(' ')}
    >
      {on ? <Check size={14} aria-hidden /> : null}
      {children}
    </button>
  );
}

/** «تقبّل الله» when the open day turns done, and a toast at a milestone. */
function useDoneMoment(day: DayEval, ev: RunEval) {
  const [blessing, setBlessing] = useState(false);
  const prev = useRef(day.state);
  useEffect(() => {
    const was = prev.current;
    prev.current = day.state;
    if (was === day.state || day.state !== 'done' || day.key !== ev.openKey) return;
    void hapticsService.notify('success');
    setBlessing(true);
    const m = day.milestone ? milestonesOf(ev.def).find((x) => x.step === day.milestone) : undefined;
    if (m && m.kind !== 'final') toast.success(`بلغتَ ${m.label}`, `+${ar(PROGRAM_POINTS.milestone)} في الترتيب، بارك الله فيك`);
  }, [day.state, day.key, day.milestone, ev]);
  return [blessing, () => setBlessing(false)] as const;
}

/**
 * The check-in for one day of a run — the right control for its kind:
 * one tap that logs the real deed (قيام، الضحى، الصيام، flags of the prayer
 * log), ticks (التكبيرة، الأذكار من كتاب), a count, or «سلمتُ اليوم».
 */
export function CheckIn({ run, ev, day, compact = false }: { run: ProgramRun; ev: RunEval; day: DayEval; compact?: boolean }) {
  const navigate = useNavigate();
  const src = useProgramSources();
  const male = useSettingsStore((s) => s.gender) === 'male';
  const counters = useTasbihStore((s) => s.counters);
  const st = useProgramsStore.getState;
  const [blessing, closeBlessing] = useDoneMoment(day, ev);
  const def = ev.def;
  const key = day.key;
  const check = run.checks[key] ?? {};
  const done = day.state === 'done';
  const tap = () => void hapticsService.impact('light');

  if (day.state === 'rest' || day.state === 'paused' || day.state === 'excused') return null;

  const blessingEl = (
    <CompletionBlessing open={blessing} onDone={closeBlessing} message="تقبّل الله" detail={`${def.title} · اليوم ${ar(day.step + 1)} من ${ar(ev.total)}`} />
  );
  const progress = (unit: string) => (
    <p className="text-[12.5px] text-text-muted">
      <span className="font-counter tabular-nums font-bold text-text-primary dark:text-text-on-dark">{ar(Math.min(day.amount, 99999))}</span>
      {' / '}
      <span className="font-counter tabular-nums">{ar(day.target)}</span> {unit}
    </p>
  );

  switch (def.verify) {
    case 'check': {
      const quit = !!def.needsName;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={done ? 'soft' : 'primary'}
            size={compact ? 'sm' : 'md'}
            leftIcon={<Check size={16} />}
            aria-pressed={done}
            onClick={() => st().setCheck(run.id, key, { ok: !check.ok, slip: undefined })}
          >
            {quit ? 'سلمتُ اليوم' : done ? 'تمّ' : 'تمّ اليوم'}
          </Button>
          {quit && !done && !compact && key === ev.openKey ? (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                st().setCheck(run.id, key, { slip: true, ok: undefined });
                toast.info('تُب واستغفر، فخير الخطّائين التوّابون', run.grace === 'strict' ? 'يبدأ العدّ من جديد غداً' : 'تُعاد خطوة اليوم غداً');
              }}
            >
              زللتُ اليوم
            </Button>
          ) : null}
          {check.slip && !compact ? <span className="text-[12px] text-text-muted">سُجّلت زلّة اليوم، والتوبة تمحو ما قبلها.</span> : null}
          {blessingEl}
        </div>
      );
    }

    case 'count':
    case 'istighfar': {
      const ist = def.verify === 'istighfar';
      const manual = check.amount ?? 0;
      const auto = ist ? Math.max(0, day.amount - manual) : 0;
      const step = day.target >= 500 ? 100 : day.target >= 100 ? 33 : day.target >= 10 ? 10 : 1;
      const counter = ist ? counters.find((c) => c.id === run.linkRef) : undefined;
      return (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            {progress(def.unit === 'pages' ? 'صفحة' : def.unit === 'rakaat' ? 'ركعة' : 'مرة')}
            {ist && counter ? (
              <span className="text-[11.5px] text-text-muted truncate">
                منها {ar(auto)} من «{counter.name}»
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="icon" aria-label={`أنقص ${ar(step)}`} onClick={() => (tap(), st().addAmount(run.id, key, -step))} disabled={manual <= 0}>
              <Minus size={18} />
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<Plus size={15} />} onClick={() => (tap(), st().addAmount(run.id, key, step))}>
              {ar(step)}
            </Button>
            {!done ? (
              <Button variant="primary" size="sm" leftIcon={<Check size={15} />} onClick={() => st().setCheck(run.id, key, { amount: manual + Math.max(0, day.target - day.amount) })}>
                أتممتُ {ar(day.target)}
              </Button>
            ) : null}
            {ist && !compact ? (
              <Button variant="ghost" size="sm" leftIcon={<ExternalLink size={14} />} onClick={() => navigate('/tasbih')}>
                السبحة
              </Button>
            ) : null}
          </div>
          {!compact ? (
            <label className="flex items-center gap-2 text-[12px] text-text-muted">
              {ist ? 'ما عددته بيدك:' : 'العدد:'}
              <NumberInput
                value={manual}
                min={0}
                max={100000}
                onValueChange={(v) => st().setCheck(run.id, key, { amount: v > 0 ? v : undefined })}
                className="w-24 rounded-xl bg-cream-dark/60 dark:bg-white/[0.06] px-3 py-2 text-sm font-counter tabular-nums text-text-primary dark:text-text-on-dark outline-none focus:ring-2 focus:ring-teal/40"
                aria-label="العدد"
              />
            </label>
          ) : null}
          {blessingEl}
        </div>
      );
    }

    case 'takbeer':
    case 'mosque':
    case 'onTime': {
      const flag = def.verify === 'onTime' ? 'onTime' : 'mosque';
      const isOn = (p: PrayerName) =>
        def.verify === 'takbeer' ? !!check.items?.includes(p) : !!src.prayerLog[key]?.[p]?.[flag];
      const toggle = (p: PrayerName) => {
        tap();
        const on = !isOn(p);
        if (def.verify !== 'takbeer') return setPrayerFlag(key, p, flag, on);
        // Catching the first takbeer is praying in congregation: record it in the
        // prayer log too, and take back only what this tick wrote.
        const had = !!src.prayerLog[key]?.[p]?.mosque;
        st().toggleItem(run.id, key, p);
        const wrote = check.wrote ?? [];
        if (on && !had) {
          setPrayerFlag(key, p, 'mosque', true);
          st().setCheck(run.id, key, { wrote: [...wrote, p] });
        } else if (!on && wrote.includes(p)) {
          setPrayerFlag(key, p, 'mosque', false);
          st().setCheck(run.id, key, { wrote: wrote.filter((x) => x !== p) });
        }
      };
      return (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-5 gap-1.5">
            {PRAYERS_ORDER.map((p) => (
              <Chip key={p} on={isOn(p)} onClick={() => toggle(p)} label={`${PRAYER_AR[p]}${isOn(p) ? ': تمّ' : ''}`}>
                <span className="text-[12px]">{PRAYER_AR[p]}</span>
              </Chip>
            ))}
          </div>
          {!compact ? (
            <p className="text-[11.5px] text-text-muted">
              {def.verify === 'takbeer'
                ? 'علّم كل صلاة أدركتَ فيها تكبيرة الإحرام مع الإمام.'
                : def.verify === 'onTime'
                  ? 'كل صلاة تعلّمينها هنا تُسجّل «على وقتها» في سجلّ صلواتك.'
                  : `${ar(day.amount)} من ${ar(day.target)} في المسجد اليوم. تُسجّل في سجلّ صلواتك.`}
            </p>
          ) : null}
          {blessingEl}
        </div>
      );
    }

    case 'rawatib': {
      const slots = rawatibSlotsOn(key, male, def.steps[Math.min(day.step, def.steps.length - 1)]);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => {
              const on = !!src.prayerLog[key]?.[s.prayer]?.[s.type];
              return (
                <Chip key={`${s.prayer}.${s.type}`} on={on} onClick={() => (tap(), setPrayerFlag(key, s.prayer, s.type, !on))}>
                  {s.label}
                  <span className="text-[11px] opacity-75 font-counter">{ar(s.rakaat)}</span>
                </Chip>
              );
            })}
          </div>
          {blessingEl}
        </div>
      );
    }

    case 'qiyam':
    case 'duha': {
      const isQiyam = def.verify === 'qiyam';
      return (
        <div className="flex flex-wrap items-center gap-2">
          {done ? (
            <p className="text-[13px] text-teal dark:text-teal-light font-semibold">
              {isQiyam ? 'سُجّل قيامك' : 'سُجّلت الضحى'}: {stepTextOn(def, day.amount, key, male)}
            </p>
          ) : (
            <Button
              variant="primary"
              size={compact ? 'sm' : 'md'}
              leftIcon={<Check size={16} />}
              onClick={() => (isQiyam ? logQiyamUnits(key, day.target) : logDuha(key, day.target))}
            >
              {isQiyam ? 'صلّيتُ قيامي' : 'صلّيتُ الضحى'}
            </Button>
          )}
          {!compact && def.link ? (
            <Button variant="ghost" size="sm" leftIcon={<ExternalLink size={14} />} onClick={() => navigate(def.link!.to)}>
              {def.link.label}
            </Button>
          ) : null}
          {blessingEl}
        </div>
      );
    }

    case 'adhkar': {
      const sets = adhkarSets(day.target);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {sets.map((s) => {
              const fromBook = !!check.items?.includes(s);
              const read = src.events.some((e) => e.dateKey === key && e.domain === 'dhikr' && e.refId === s && e.amount > 0);
              const on = read || fromBook;
              return (
                <div key={s} className="flex items-center gap-1">
                  <Chip on={on} onClick={() => (read ? undefined : navigate(`/adhkar?set=${s}`))} label={ADHKAR_LABEL[s]}>
                    {ADHKAR_LABEL[s]}
                  </Chip>
                  {!read && !compact ? (
                    <button
                      type="button"
                      aria-pressed={fromBook}
                      onClick={() => (tap(), st().toggleItem(run.id, key, s))}
                      className="min-h-11 px-2.5 rounded-xl text-[11.5px] text-text-muted hover:bg-teal/5 inline-flex items-center gap-1"
                    >
                      <BookOpen size={13} aria-hidden /> {fromBook ? 'قرأتها من كتاب ✓' : 'قرأتها من كتاب'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {blessingEl}
        </div>
      );
    }

    case 'quran': {
      const pages = quranPagesOn(src, key);
      return (
        <div className="flex flex-col gap-2">
          {progress('صفحة')}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" leftIcon={<BookOpen size={15} />} onClick={() => void openMushafi()}>
              افتح مصحفي
            </Button>
            {!done || check.ok ? (
              <Button
                variant={check.ok ? 'soft' : 'primary'}
                size="sm"
                aria-pressed={!!check.ok}
                leftIcon={<Check size={15} />}
                onClick={() => st().setCheck(run.id, key, { ok: !check.ok })}
              >
                قرأتُ وِردي
              </Button>
            ) : null}
          </div>
          {!compact && pages > 0 ? <p className="text-[11.5px] text-text-muted">قرأت اليوم {ar(pages)} صفحة في مصحفي.</p> : null}
          {blessingEl}
        </div>
      );
    }

    case 'fasting': {
      return (
        <div className="flex flex-wrap items-center gap-2">
          {done ? (
            <p className="text-[13px] text-teal dark:text-teal-light font-semibold">صائمٌ اليوم · تقبّل الله صيامك</p>
          ) : (
            <Button variant="primary" size={compact ? 'sm' : 'md'} leftIcon={<Check size={16} />} onClick={() => logFast(key)}>
              صمتُ {WEEKDAY_NAME[weekdayOf(key)]}
            </Button>
          )}
          {blessingEl}
        </div>
      );
    }
  }
  return null;
}
