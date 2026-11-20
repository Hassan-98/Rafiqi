import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BadgeCheck, BellRing, Flame, Lightbulb, Pause, Play, RotateCcw, Share2, ShieldAlert, Square, Trash2, TrendingUp, Trophy,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput } from '@/components/ui/TextInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { Field, Pill, Segmented, fieldClass } from '@/components/study/studyUi';
import { useProgramsStore } from '@/store/programsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { toast } from '@/store/toastStore';
import { rescheduleAllPrograms } from '@/services/programsReminders';
import {
  WEEKDAY_NAME, dayNumber, milestonesOf, openPause, stepTextOn, tipOf, type DayEval, type ProgramRun, type RunEval,
} from '@/store/programsModel';
import { daysAr, templateById, type Grace } from '@/data/programsCatalog';
import { dayKey, parseKey, shiftKey } from '@/store/studyModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { CheckIn } from './CheckIn';
import { todayLine } from './RunCard';
import { InfoRow, PathDots, RecentStrip, SourceQuote, StatePill, StepStairs, STATE_LABEL } from './programsUi';
import { GRACE_TEXT, PhaseList } from './TemplatePreview';
import { ReminderEditor } from './ReminderEditor';
import { shareRun } from './CompletionModal';

const dateAr = (key: string) => {
  const d = parseKey(key);
  return `${WEEKDAY_NAME[d.getDay()]} ${ar(d.getDate())}/${ar(d.getMonth() + 1)}`;
};

/** A past (or today's) day: what it held, its check-in, and «يوم عذر». */
function DaySheet({ run, ev, day, onClose }: { run: ProgramRun; ev: RunEval; day: DayEval | null; onClose: () => void }) {
  const excuseDay = useProgramsStore((s) => s.excuseDay);
  const male = useSettingsStore((s) => s.gender) === 'male';
  // Re-read the day from the live evaluation (it changes as you tick).
  const live = day ? (ev.days.find((d) => d.key === day.key) ?? day) : null;
  const singleExcuse = live ? run.pauses[live.key] === live.key : false;
  return (
    <BottomSheet open={!!day} onClose={onClose} title={live ? dateAr(live.key) : ''}>
      {live ? (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark text-pretty">
              {live.target ? stepTextOn(ev.def, live.target, live.key, male, run.name, ev.def.steps[live.step]) : STATE_LABEL[live.state]}
            </p>
            <StatePill day={live} />
          </div>
          {live.reset ? <p className="text-[12.5px] text-danger">في هذا اليوم بدأ العدّ من جديد.</p> : null}
          {live.target && live.state !== 'rest' ? <CheckIn run={run} ev={ev} day={live} /> : null}
          {live.key < ev.openKey && (live.state === 'missed' || singleExcuse) ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-cream-dark/50 dark:bg-white/[0.05] px-3 py-3">
              <span className="text-[12.5px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
                كان يوم عذر (سفر أو مرض): لا يُحتسب ولا يقطع البرنامج
              </span>
              <Toggle checked={singleExcuse} onChange={(on) => excuseDay(run.id, live.key, on)} label="يوم عذر" hideLabel size="sm" />
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

/** One run: hero, today's step, the path, recent days, milestones, schedule and settings. */
export function RunDetail({ run, ev, onLevelUp }: { run: ProgramRun; ev: RunEval; onLevelUp: () => void }) {
  const navigate = useNavigate();
  const st = useProgramsStore.getState;
  const male = useSettingsStore((s) => s.gender) === 'male';
  const counters = useTasbihStore((s) => s.counters);
  const [picked, setPicked] = useState<DayEval | null>(null);
  const [confirm, setConfirm] = useState<null | 'stop' | 'remove' | 'strict'>(null);
  const tpl = templateById(run.templateId);
  const def = ev.def;
  const t = ev.today;
  const finished = !!ev.finishedOn;
  const stopped = run.status === 'stopped';
  const live = !finished && !stopped;
  const today = dayKey(new Date());
  const n = dayNumber(ev);
  const pct = finished ? 100 : (ev.step / ev.total) * 100;
  const marks = milestonesOf(def);
  const specs = run.reminders?.length ? run.reminders : def.reminders;
  const tip = t && live ? tipOf(def, t.step) : undefined;
  const hadMiss = ev.days.some((d) => d.state === 'missed');

  const setGrace = (g: Grace) => {
    if (g === run.grace) return;
    if (g === 'strict') {
      if (hadMiss) {
        toast.info('فاتتك أيامٌ في هذا البرنامج', 'الوضع الصارم يبدأ مع برنامجٍ جديد، حتى لا يُعاد عدّ ما مضى');
        return;
      }
      setConfirm('strict');
      return;
    }
    st().update(run.id, { grace: g });
  };

  const kicker = finished
    ? 'تمّ البرنامج بحمد الله'
    : stopped
      ? 'أوقفته'
      : !ev.started
        ? todayLine(run, ev, male)
        : ev.paused
          ? 'موقوف مؤقتاً'
          : `اليوم ${ar(n)} من ${ar(ev.total)}`;

  return (
    <div className="flex flex-col gap-6">
      {/* ── hero ── */}
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <ProgressRing
              value={pct}
              size={92}
              strokeWidth={7}
              showPercent={false}
              colorFrom="var(--color-on-accent)"
              colorTo="var(--color-gold-light)"
              trackColor="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-2xl font-counter font-bold tabular-nums">{ar(finished ? ev.total : ev.step)}</span>
              <span className="text-[10px] text-on-accent/75 mt-1">من {ar(ev.total)}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-on-accent/75">{kicker}</p>
            <h2 className="mt-1 text-xl font-display font-bold leading-snug text-balance">{def.title}</h2>
            {live && ev.started && !ev.paused ? <p className="mt-1 text-[13px] text-on-accent/85 text-pretty">{todayLine(run, ev, male)}</p> : null}
            {finished ? <p className="mt-1 text-[13px] text-on-accent/85">في {dateAr(ev.finishedOn!)}</p> : null}
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { icon: <Flame size={15} />, v: ev.chain, l: 'متتابعة' },
            { icon: <Trophy size={15} />, v: ev.doneCount, l: 'أيام أنجزتها' },
            { icon: <RotateCcw size={15} />, v: run.grace === 'strict' ? ev.restarts : ev.days.filter((d) => d.state === 'missed').length, l: run.grace === 'strict' ? 'مرات البدء من جديد' : 'أيام أعدتَها' },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
              <span className="mx-auto flex justify-center text-gold-light">{x.icon}</span>
              <p className="mt-1 text-xl font-counter font-bold tabular-nums">{ar(x.v)}</p>
              <p className="text-[10px] text-on-accent/75 leading-tight">{x.l}</p>
            </div>
          ))}
        </div>
        {finished ? (
          <div className="relative mt-4 flex flex-wrap gap-2">
            <Button variant="gold" size="sm" leftIcon={<Share2 size={15} />} onClick={() => void shareRun(ev)}>
              شارك الإنجاز
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<TrendingUp size={15} />} onClick={onLevelUp}>
              ابدأ المستوى التالي
            </Button>
          </div>
        ) : null}
        {stopped ? (
          <div className="relative mt-4">
            <Button variant="gold" size="sm" leftIcon={<RotateCcw size={15} />} onClick={() => (tpl ? navigate(`/programs?tpl=${tpl.id}`) : onLevelUp())}>
              ابدأه من جديد
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── banners ── */}
      {live && ev.lastReset && ev.lastReset >= shiftKey(ev.openKey, -2) ? (
        <Card variant="inset" className="p-4 flex items-start gap-3">
          <RotateCcw size={18} className="mt-0.5 text-gold-dark dark:text-gold-light shrink-0" aria-hidden />
          <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            فاتك يومٌ فبدأ العدّ من جديد. لا بأس: «خير الخطّائين التوّابون»، وكل يومٍ مضى مكتوبٌ لك. خطوتك الأولى بانتظارك.
          </p>
        </Card>
      ) : live && run.grace === 'forgiving' && ev.missStreak >= 2 ? (
        <Card variant="inset" className="p-4 flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            فاتتك {daysAr(ev.missStreak)}، وخطوتك محفوظة تنتظرك. إن كنت مسافراً أو مريضاً فأوقف البرنامج مؤقتاً.
          </p>
          <Button variant="soft" size="sm" leftIcon={<Pause size={15} />} onClick={() => st().pause(run.id, today)} className="self-start">
            أوقفه مؤقتاً
          </Button>
        </Card>
      ) : null}

      {/* ── today ── */}
      {live && ev.started ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title={def.verify === 'qiyam' && t?.key !== today ? 'خطوة الليلة الماضية' : 'خطوة اليوم'} action={<StatePill day={ev.paused ? null : t} />} />
          <Card className="p-4 flex flex-col gap-3">
            {ev.paused ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13.5px] text-text-secondary dark:text-text-on-dark/80">البرنامج موقوف منذ {dateAr(openPause(run)!)}. الأيام الموقوفة لا تُحتسب ولا تقطع.</p>
                <Button variant="primary" leftIcon={<Play size={16} />} onClick={() => (st().resume(run.id, today), void rescheduleAllPrograms())} className="self-start">
                  استأنف البرنامج
                </Button>
              </div>
            ) : (
              <>
                <p className="text-[16px] font-bold text-text-primary dark:text-text-on-dark text-pretty">{todayLine(run, ev, male)}</p>
                {t ? <CheckIn run={run} ev={ev} day={t} /> : null}
                {tip ? (
                  <p className="flex items-start gap-1.5 rounded-[var(--radius-inner)] bg-gold/[0.08] px-3 py-2.5 text-[12.5px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
                    <Lightbulb size={14} className="mt-0.5 shrink-0 text-gold" aria-hidden />
                    {tip}
                  </p>
                ) : null}
              </>
            )}
          </Card>
        </section>
      ) : null}

      {/* ── the path ── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الطريق" subtitle={def.dueOn ? 'نقطةٌ لكل صوم' : 'نقطةٌ لكل خطوة، والنجوم محطات'} />
        <Card className="p-4">
          <PathDots ev={ev} />
        </Card>
      </section>

      {ev.days.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="آخر الأيام" subtitle="اضغط يوماً لتعديله" />
          <Card className="p-3">
            <RecentStrip ev={ev} onPick={setPicked} />
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="المحطات" />
        <Card className="p-1.5">
          <ul className="flex flex-col">
            {marks.map((m) => {
              const reached = ev.best >= m.step || finished;
              return (
                <li key={m.step} className="flex items-center gap-3 px-3 py-2.5">
                  <Star8 size={16} filled={reached} className={reached ? 'text-gold' : 'text-text-muted'} />
                  <span className={`flex-1 text-[13px] ${reached ? 'font-bold text-text-primary dark:text-text-on-dark' : 'text-text-secondary dark:text-text-on-dark/70'}`}>
                    {m.label}
                  </span>
                  <span className="text-[11.5px] font-counter tabular-nums text-text-muted">
                    {def.dueOn ? `الصوم ${ar(m.step)}` : `اليوم ${ar(m.step)}`}
                  </span>
                  {reached ? <BadgeCheck size={15} className="text-teal dark:text-teal-light" aria-label="بلغتها" /> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الجدول" />
        <Card className="p-4 flex flex-col gap-3">
          <StepStairs steps={def.steps} done={finished ? ev.total : ev.step} current={live && t?.state === 'pending' ? ev.step : -1} />
          <PhaseList def={def} run={run} current={live ? ev.step : undefined} />
        </Card>
      </section>

      {/* ── settings ── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الإعدادات" />
        <Card className="p-4 flex flex-col gap-5">
          {live ? (
            <Field label="إذا فاتك يوم">
              {def.graceLocked ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-gold-dark dark:text-gold-light" aria-hidden />
                  {def.graceLocked}
                </p>
              ) : (
                <>
                  <Segmented
                    value={run.grace}
                    onChange={setGrace}
                    options={(['forgiving', 'strict'] as Grace[]).map((g) => ({ value: g, label: GRACE_TEXT[g].label }))}
                  />
                  <span className="text-[12px] text-text-muted">{GRACE_TEXT[run.grace].text}</span>
                </>
              )}
            </Field>
          ) : null}

          {live && def.needsName ? (
            <Field label="العادة" hint="يبقى الاسم عندك وحدك">
              <TextInput value={run.name ?? ''} onValueChange={(v) => st().update(run.id, { name: v })} className={fieldClass} maxLength={40} />
            </Field>
          ) : null}

          {live && def.verify === 'istighfar' ? (
            <Field label="عدّاد السبحة المربوط">
              <div className="flex flex-wrap gap-2">
                <Pill active={!run.linkRef} onClick={() => st().update(run.id, { linkRef: undefined })}>
                  بلا ربط
                </Pill>
                {counters.map((c) => (
                  <Pill key={c.id} active={run.linkRef === c.id} onClick={() => st().update(run.id, { linkRef: c.id })}>
                    {c.name}
                  </Pill>
                ))}
              </div>
            </Field>
          ) : null}

          {live ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary dark:text-text-on-dark">
                  <BellRing size={16} className="text-teal dark:text-teal-light" aria-hidden /> تذكير يومي
                </span>
                <Toggle
                  checked={run.remindersOn}
                  onChange={(on) => (st().update(run.id, { remindersOn: on }), void rescheduleAllPrograms())}
                  label="تذكير يومي"
                  hideLabel
                />
              </div>
              {run.remindersOn ? (
                <ReminderEditor specs={specs} onChange={(r) => (st().update(run.id, { reminders: r }), void rescheduleAllPrograms())} />
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {live && !ev.paused && ev.started ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pause size={15} />}
                onClick={() => {
                  st().pause(run.id, t?.state === 'done' ? shiftKey(today, 1) : today);
                  void rescheduleAllPrograms();
                  toast.info('أُوقف البرنامج مؤقتاً', 'شفاك الله ويسّر سفرك. استأنفه متى شئت');
                }}
              >
                أوقفه مؤقتاً (سفر أو مرض)
              </Button>
            ) : null}
            {live ? (
              <Button variant="ghost" size="sm" leftIcon={<Square size={14} />} onClick={() => setConfirm('stop')}>
                إنهاء البرنامج
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirm('remove')}
              className="min-h-9 px-3.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 text-danger hover:bg-danger/10"
            >
              <Trash2 size={15} aria-hidden /> حذف
            </button>
          </div>
        </Card>
      </section>

      {def.why ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="عن البرنامج" />
          <Card className="p-4 flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">{def.why}</p>
            {def.source ? <SourceQuote source={def.source} /> : null}
            <InfoRow icon={<BadgeCheck size={17} />} title="كيف يُتحقّق اليوم">
              {def.verifyText}
            </InfoRow>
          </Card>
        </section>
      ) : null}

      <DaySheet run={run} ev={ev} day={picked} onClose={() => setPicked(null)} />

      <ConfirmDialog
        open={confirm === 'strict'}
        title="التحويل إلى الوضع الصارم"
        message="من الآن: إن فاتك يوم بدأ العدّ من الأول. يناسب من عزم على التتابع."
        confirmLabel="نعم، صارم"
        onConfirm={() => (st().update(run.id, { grace: 'strict' }), setConfirm(null))}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'stop'}
        title="إنهاء البرنامج؟"
        message="يبقى في سجلّك بما أنجزت فيه، وتتوقف تذكيراته. للتوقف أياماً استخدم «أوقفه مؤقتاً»."
        confirmLabel="إنهاء"
        confirmVariant="danger"
        onConfirm={() => {
          st().stop(run.id, t?.state === 'done' ? today : shiftKey(today, -1));
          void rescheduleAllPrograms();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        title="حذف البرنامج؟"
        message="يُحذف البرنامج وسجلّه. صلواتك وقيامك وصيامك المسجّلة تبقى في أماكنها."
        confirmLabel="حذف"
        confirmVariant="danger"
        onConfirm={() => {
          st().remove(run.id);
          void rescheduleAllPrograms();
          setConfirm(null);
          navigate('/programs', { replace: true });
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
