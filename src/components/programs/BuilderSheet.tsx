import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput } from '@/components/ui/TextInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { Field, Pill, Segmented, fieldClass } from '@/components/study/studyUi';
import { useProgramsStore } from '@/store/programsStore';
import { toast } from '@/store/toastStore';
import { rescheduleAllPrograms } from '@/services/programsReminders';
import { programDef, rangeText, type CustomSpec, type CustomUnit } from '@/store/programsModel';
import { daysAr, type Curve, type Grace, type ReminderSpec } from '@/data/programsCatalog';
import { dayKey, shiftKey } from '@/store/studyModel';
import { StepStairs } from './programsUi';
import { GRACE_TEXT } from './TemplatePreview';
import { ReminderEditor } from './ReminderEditor';
import { useStartGuard } from './startGuard';

const UNITS: { id: CustomUnit; label: string }[] = [
  { id: 'count', label: 'عدد مرات' },
  { id: 'rakaat', label: 'ركعات' },
  { id: 'pages', label: 'صفحات' },
  { id: 'check', label: 'إنجاز يومي' },
];
const CURVES: { value: Curve; label: string }[] = [
  { value: 'linear', label: 'كل يوم قليلاً' },
  { value: 'weekly', label: 'كل أسبوع خطوة' },
  { value: 'fixed', label: 'ثابت' },
];
const LENGTHS = [7, 14, 21, 30, 40, 60];

export type BuilderInit = Partial<CustomSpec> & { grace?: Grace };

const DEFAULTS: CustomSpec = { title: '', days: 30, unit: 'count', start: 10, end: 100, curve: 'weekly', autoQuran: true };

/** «صمّم برنامجك»: title, unit, length, start→end, curve, grace, reminder — with a live staircase. */
export function BuilderSheet({ open, initial, onClose }: { open: boolean; initial?: BuilderInit; onClose: () => void }) {
  const navigate = useNavigate();
  const start = useProgramsStore((s) => s.start);
  const guard = useStartGuard();
  const [spec, setSpec] = useState<CustomSpec>(DEFAULTS);
  const [grace, setGrace] = useState<Grace>('forgiving');
  const [remindersOn, setRemindersOn] = useState(true);
  const [reminders, setReminders] = useState<ReminderSpec[]>([{ anchor: 'time', offset: 0, time: '20:00' }]);
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');

  useEffect(() => {
    if (!open) return;
    setSpec({ ...DEFAULTS, ...initial });
    setGrace(initial?.grace ?? 'forgiving');
    setWhen('today');
  }, [open, initial]);

  const set = (patch: Partial<CustomSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const def = useMemo(() => programDef({ custom: spec }), [spec]);
  const fixed = spec.curve === 'fixed';

  const go = () => {
    const title = spec.title.trim();
    if (!title) {
      toast.warning('سمِّ برنامجك أولاً');
      return;
    }
    const days = Math.min(365, Math.max(3, Math.round(spec.days) || 30));
    const s = Math.max(1, Math.round(spec.start) || 1);
    const e = fixed ? s : Math.max(1, Math.round(spec.end) || s);
    guard.request(() => {
      const today = dayKey(new Date());
      const id = start({
        custom: { ...spec, title, days, start: s, end: e },
        startDay: when === 'today' ? today : shiftKey(today, 1),
        grace,
        remindersOn,
        reminders,
      });
      void rescheduleAllPrograms();
      toast.success('بدأ برنامجك على بركة الله', title);
      onClose();
      navigate(`/programs?run=${id}`);
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="صمّم برنامجك">
      <div className="flex flex-col gap-4 pb-2">
        <Field label="اسم البرنامج">
          <TextInput value={spec.title} onValueChange={(v) => set({ title: v })} placeholder="مثلاً: التسبيح بعد الصلوات" className={fieldClass} maxLength={48} />
        </Field>

        <Field label="ماذا تعدّ">
          <div className="grid grid-cols-4 gap-1.5">
            {UNITS.map((u) => (
              <Pill key={u.id} active={spec.unit === u.id} onClick={() => set({ unit: u.id })} className="px-1.5">
                {u.label}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="المدة (بالأيام)">
          <div className="flex flex-wrap items-center gap-1.5">
            {LENGTHS.map((n) => (
              <Pill key={n} active={spec.days === n} onClick={() => set({ days: n })}>
                {n === 7 ? 'أسبوع' : n === 14 ? 'أسبوعان' : daysAr(n)}
              </Pill>
            ))}
            <NumberInput
              value={spec.days}
              min={3}
              max={365}
              onValueChange={(v) => set({ days: v })}
              className="w-20 min-h-9 rounded-xl bg-cream-dark/60 dark:bg-white/[0.06] px-2 text-center text-sm font-counter tabular-nums text-text-primary dark:text-text-on-dark outline-none focus:ring-2 focus:ring-teal/40"
              aria-label="عدد الأيام"
            />
          </div>
        </Field>

        {spec.unit !== 'check' ? (
          <>
            <Field label="التدرّج">
              <Segmented value={spec.curve} onChange={(c) => set({ curve: c })} options={CURVES} />
            </Field>
            <div className={`grid gap-2 ${fixed ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <Field label={fixed ? 'كل يوم' : 'تبدأ بـ'}>
                <NumberInput value={spec.start} min={1} max={100000} onValueChange={(v) => set({ start: v })} className={`${fieldClass} font-counter tabular-nums`} aria-label="البداية" />
              </Field>
              {!fixed ? (
                <Field label="وتنتهي إلى">
                  <NumberInput value={spec.end} min={1} max={100000} onValueChange={(v) => set({ end: v })} className={`${fieldClass} font-counter tabular-nums`} aria-label="النهاية" />
                </Field>
              ) : null}
            </div>
            {spec.unit === 'pages' ? (
              <label className="flex items-center justify-between gap-3 text-[13px] text-text-secondary dark:text-text-on-dark/80">
                تحقّق تلقائياً من صفحات «مصحفي»
                <Toggle checked={!!spec.autoQuran} onChange={(v) => set({ autoQuran: v })} label="تحقّق تلقائياً من مصحفي" hideLabel size="sm" />
              </label>
            ) : null}
          </>
        ) : null}

        <div className="rounded-[var(--radius-inner)] bg-cream-dark/45 dark:bg-white/[0.04] px-3 py-3 flex flex-col gap-1.5">
          <StepStairs steps={def.steps} className="h-12" />
          <p className="text-[12px] text-text-muted text-pretty">
            {rangeText(def)} في {daysAr(def.steps.length)}
          </p>
        </div>

        <Field label="إذا فاتك يوم">
          <Segmented value={grace} onChange={setGrace} options={(['forgiving', 'strict'] as Grace[]).map((g) => ({ value: g, label: GRACE_TEXT[g].label }))} />
          <span className={`text-[12px] ${grace === 'strict' ? 'text-danger' : 'text-text-muted'}`}>{GRACE_TEXT[grace].text}</span>
        </Field>

        <Field label="يبدأ">
          <div className="flex gap-2">
            <Pill active={when === 'today'} onClick={() => setWhen('today')} className="flex-1">
              اليوم
            </Pill>
            <Pill active={when === 'tomorrow'} onClick={() => setWhen('tomorrow')} className="flex-1">
              غداً
            </Pill>
          </div>
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">تذكير يومي</span>
            <Toggle checked={remindersOn} onChange={setRemindersOn} label="تذكير يومي" hideLabel />
          </div>
          {remindersOn ? <ReminderEditor specs={reminders} onChange={setReminders} /> : null}
        </div>

        <Button variant="primary" size="lg" fullWidth onClick={go} disabled={!!guard.blocked}>
          ابدأ البرنامج
        </Button>
        {guard.blocked ? <p className="text-center text-[12px] text-text-muted">{guard.blocked}</p> : null}
      </div>
      {guard.dialog}
    </BottomSheet>
  );
}
