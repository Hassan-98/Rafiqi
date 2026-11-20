import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, BellRing, CalendarDays, Flag, Repeat, ShieldAlert, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput } from '@/components/ui/TextInput';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { Field, Pill, Segmented, fieldClass } from '@/components/study/studyUi';
import { useProgramsStore } from '@/store/programsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { toast } from '@/store/toastStore';
import { rescheduleAllPrograms } from '@/services/programsReminders';
import {
  AUTO_KINDS, lengthText, milestonesOf, phasesOf, programDef, rangeText, stepTextOn, type ProgramRun,
} from '@/store/programsModel';
import { LEVEL_LABEL, daysAr, type Grace, type ProgramTemplate, type ReminderSpec } from '@/data/programsCatalog';
import { dayKey, shiftKey } from '@/store/studyModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { IconChip, InfoRow, SourceQuote, StepStairs, isRunning, useProgramEvals } from './programsUi';
import { ReminderEditor } from './ReminderEditor';
import { useStartGuard } from './startGuard';

export const GRACE_TEXT: Record<Grace, { label: string; text: string }> = {
  forgiving: { label: 'متسامح', text: 'إن فاتك يوم أعدنا خطوته غداً، ولا تخسر ما مضى.' },
  strict: { label: 'صارم', text: 'إن فاتك يوم بدأ العدّ من الأول. للعزائم المتتابعة.' },
};

/** «الأيام ١–٥ · ركعتان» — the schedule phase by phase. */
export function PhaseList({ def, run, current }: { def: ProgramTemplate; run?: Pick<ProgramRun, 'name'>; current?: number }) {
  const male = useSettingsStore((s) => s.gender) !== 'female';
  const today = dayKey(new Date());
  const phases = phasesOf(def.steps);
  return (
    <ol className="flex flex-col">
      {phases.map((p) => {
        const on = current !== undefined && current + 1 >= p.from && current + 1 <= p.to;
        const past = current !== undefined && current + 1 > p.to;
        return (
          <li
            key={p.from}
            className={`flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-2.5 ${on ? 'bg-gold/10 ring-1 ring-gold/40' : ''}`}
          >
            <span className={`text-[11.5px] font-counter tabular-nums w-20 shrink-0 ${past ? 'text-teal dark:text-teal-light' : 'text-text-muted'}`}>
              {def.dueOn ? (p.from === p.to ? `الصوم ${ar(p.from)}` : `الصوم ${ar(p.from)}–${ar(p.to)}`) : p.from === p.to ? `اليوم ${ar(p.from)}` : `الأيام ${ar(p.from)}–${ar(p.to)}`}
            </span>
            <span className={`flex-1 text-[13px] ${on ? 'font-bold' : 'font-semibold'} text-text-primary dark:text-text-on-dark text-pretty`}>
              {stepTextOn(def, p.target, today, male, run?.name, p.target)}
            </span>
            {past ? <BadgeCheck size={15} className="text-teal dark:text-teal-light shrink-0" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Before starting: why, the source, the escalation, how a day is verified, grace, start day, reminder. */
export function TemplatePreview({ tpl }: { tpl: ProgramTemplate }) {
  const navigate = useNavigate();
  const start = useProgramsStore((s) => s.start);
  const counters = useTasbihStore((s) => s.counters);
  const female = useSettingsStore((s) => s.gender) === 'female';
  const { runs, evals } = useProgramEvals();
  const guard = useStartGuard();
  const already = runs.find((r) => r.templateId === tpl.id && isRunning(r.status, evals.get(r.id)));

  // Prayer-tied programs started after Fajr begin tomorrow (today's Fajr is gone).
  const lateToday = ['takbeer', 'onTime', 'mosque'].includes(tpl.verify) && new Date().getHours() >= 7;
  const [when, setWhen] = useState<'today' | 'tomorrow'>(lateToday ? 'tomorrow' : 'today');
  const [grace, setGrace] = useState<Grace>(tpl.grace);
  const [remindersOn, setRemindersOn] = useState(true);
  const [reminders, setReminders] = useState<ReminderSpec[]>(() => tpl.reminders.map((r) => ({ ...r })));
  const [name, setName] = useState('');
  const [days, setDays] = useState(tpl.steps.length);
  const [linkRef, setLinkRef] = useState<string | undefined>(
    () => counters.find((c) => /[اأإ]?ستغفر/.test(c.name))?.id,
  );
  const def = useMemo(() => programDef({ templateId: tpl.id, days, name }), [tpl.id, days, name]);
  const auto = AUTO_KINDS.has(tpl.verify);

  const go = () => {
    if (tpl.needsName && !name.trim()) {
      toast.warning('سمِّ العادة أولاً', 'يبقى الاسم عندك وحدك');
      return;
    }
    guard.request(() => {
      const today = dayKey(new Date());
      const id = start({
        templateId: tpl.id,
        name: tpl.needsName ? name : undefined,
        days: tpl.needsName ? days : undefined,
        startDay: when === 'today' ? today : shiftKey(today, 1),
        grace,
        remindersOn,
        reminders,
        linkRef: tpl.verify === 'istighfar' ? linkRef : undefined,
      });
      void rescheduleAllPrograms();
      toast.success('بدأ البرنامج على بركة الله', def.title);
      navigate(`/programs?run=${id}`, { replace: true });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="relative flex items-start gap-4">
          <IconChip def={tpl} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-text-muted">{LEVEL_LABEL[tpl.level]}</p>
            <h2 className="mt-0.5 text-xl font-display font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">{def.title}</h2>
            <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/75 text-pretty">{tpl.short}</p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { icon: <CalendarDays size={15} />, v: lengthText(def) },
            { icon: <TrendingUp size={15} />, v: rangeText(def) },
            { icon: <Flag size={15} />, v: `${ar(milestonesOf(def).length)} محطات` },
          ].map((x, i) => (
            <div key={i} className="rounded-2xl bg-white/60 dark:bg-white/[0.05] px-2 py-2.5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
              <span className="mx-auto mb-1 flex justify-center text-gold-dark dark:text-gold-light">{x.icon}</span>
              <p className="text-[12px] font-semibold leading-snug text-text-primary dark:text-text-on-dark text-balance">{x.v}</p>
            </div>
          ))}
        </div>
      </Card>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="لماذا هذا البرنامج" />
        <Card className="p-4 flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">{tpl.why}</p>
          {tpl.source ? <SourceQuote source={tpl.source} /> : null}
          {tpl.more?.map((s) => <SourceQuote key={s.text} source={s} />)}
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="كيف يتدرّج" subtitle={def.dueOn ? 'الأيام الأخرى استراحة لا تُحتسب' : `${daysAr(def.steps.length)}، خطوةٌ كل يوم`} />
        <Card className="p-4 flex flex-col gap-3">
          <StepStairs steps={def.steps} />
          <PhaseList def={def} run={{ name }} />
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الإعداد" />
        <Card className="p-4 flex flex-col gap-5">
          <InfoRow icon={auto ? <BadgeCheck size={17} /> : <Repeat size={17} />} title={auto ? 'يتحقّق تلقائياً' : 'تسجيل اليوم'}>
            {tpl.verifyText}
            {tpl.excusable && female ? ' وأيام العذر لا تُحتسب ولا تقطع البرنامج.' : ''}
          </InfoRow>

          {tpl.needsName ? (
            <>
              <Field label="ما العادة التي تتركها؟" hint="يبقى الاسم عندك، ولا يظهر في الترتيب">
                <TextInput value={name} onValueChange={setName} placeholder="مثلاً: السهر، التدخين، الغيبة…" className={fieldClass} maxLength={40} />
              </Field>
              <Field label="المدة">
                <div className="flex flex-wrap gap-2">
                  {(tpl.lengthChoices ?? [40]).map((n) => (
                    <Pill key={n} active={days === n} onClick={() => setDays(n)}>
                      {daysAr(n)}
                    </Pill>
                  ))}
                </div>
              </Field>
            </>
          ) : null}

          {tpl.verify === 'istighfar' ? (
            <Field label="اربطه بعدّاد في السبحة" hint="ما تعدّه بهذا العدّاد يُحسب تلقائياً">
              <div className="flex flex-wrap gap-2">
                <Pill active={!linkRef} onClick={() => setLinkRef(undefined)}>
                  بلا ربط
                </Pill>
                {counters.map((c) => (
                  <Pill key={c.id} active={linkRef === c.id} onClick={() => setLinkRef(c.id)}>
                    {c.name}
                  </Pill>
                ))}
              </div>
            </Field>
          ) : null}

          <Field label="إذا فاتك يوم">
            {tpl.graceLocked ? (
              <p className="flex items-start gap-2 rounded-[var(--radius-inner)] bg-gold/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
                <ShieldAlert size={16} className="mt-0.5 shrink-0 text-gold-dark dark:text-gold-light" aria-hidden />
                {tpl.graceLocked}
              </p>
            ) : (
              <>
                <Segmented
                  value={grace}
                  onChange={setGrace}
                  options={(['forgiving', 'strict'] as Grace[]).map((g) => ({ value: g, label: GRACE_TEXT[g].label }))}
                />
                <span className={`text-[12px] ${grace === 'strict' ? 'text-danger' : 'text-text-muted'}`}>{GRACE_TEXT[grace].text}</span>
              </>
            )}
          </Field>

          <Field label="يبدأ">
            <div className="flex gap-2">
              <Pill active={when === 'today'} onClick={() => setWhen('today')} className="flex-1">
                {tpl.verify === 'qiyam' ? 'الليلة' : 'اليوم'}
              </Pill>
              <Pill active={when === 'tomorrow'} onClick={() => setWhen('tomorrow')} className="flex-1">
                {tpl.verify === 'qiyam' ? 'ليلة الغد' : 'غداً'}
              </Pill>
            </div>
            {lateToday && when === 'today' ? <span className="text-[12px] text-text-muted">فجر اليوم مضى؛ البدء غداً أوفق.</span> : null}
          </Field>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary dark:text-text-on-dark">
                <BellRing size={16} className="text-teal dark:text-teal-light" aria-hidden /> تذكير يومي
              </span>
              <Toggle checked={remindersOn} onChange={setRemindersOn} label="تذكير يومي" hideLabel />
            </div>
            {remindersOn ? <ReminderEditor specs={reminders} onChange={setReminders} /> : null}
          </div>
        </Card>
      </section>

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-[calc(var(--safe-bottom,0px)+1rem)] bg-gradient-to-t from-cream via-cream/95 to-cream/0 dark:from-dark-bg dark:via-dark-bg/95 dark:to-dark-bg/0">
        {already ? (
          <Button variant="secondary" size="lg" fullWidth onClick={() => navigate(`/programs?run=${already.id}`, { replace: true })}>
            البرنامج جارٍ، افتحه
          </Button>
        ) : (
          <Button variant="primary" size="lg" fullWidth onClick={go} disabled={!!guard.blocked}>
            ابدأ البرنامج
          </Button>
        )}
        {guard.blocked ? <p className="mt-2 text-center text-[12px] text-text-muted">{guard.blocked}</p> : null}
      </div>
      {guard.dialog}
    </div>
  );
}

/** Small hero medallion with the day count — reused by the detail page. */
export function DayMedallion({ n, total }: { n: number; total: number }) {
  return (
    <Medallion size={64} tone="onAccent">
      <span className="flex flex-col items-center leading-none">
        <span className="text-xl">{ar(n)}</span>
        <span className="text-[9px] font-normal opacity-75 mt-0.5">من {ar(total)}</span>
      </span>
    </Medallion>
  );
}
