import { useEffect, useState } from 'react';
import { ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput } from '@/components/ui/TextInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { SoundSelector } from '@/components/settings/SoundPicker';
import { useStudyStore } from '@/store/studyStore';
import {
  FORMAT_LABEL, LESSON_MINUTES, PLATFORMS, PLATFORM_LABEL, SUBJECTS, SUBJECT_LABEL, WEEKDAY_AR, detectPlatform, durationAr, hhmm,
  type CircleFormat, type OneOffSession, type Platform, type StudyCircle, type StudySubject, type WeeklySlot,
} from '@/store/studyModel';
import type { SoundKey } from '@/services/notifications/sounds';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { Field, PLATFORM_TONE, Pill, PlatformGlyph, fieldClass } from './studyUi';

const STEPS = ['المنصّة', 'الحلقة', 'المواعيد', 'التنبيهات'];
const OFFSETS = [0, 10, 15, 30, 60, 1440];

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hhmm(d)}`;
};

interface Draft {
  platform: Platform;
  link: string;
  title: string;
  teacher: string;
  subject: StudySubject;
  format: CircleFormat;
  durationMin: number;
  totalLessons: string;
  slots: WeeklySlot[];
  sessions: OneOffSession[];
  remindersEnabled: boolean;
  reminderOffsets: number[];
  goalEnabled: boolean;
  goalTime: string;
  goalLessons: string;
  soundKey: SoundKey;
  fullScreen: boolean;
}

const blank = (): Draft => ({
  platform: 'telegram',
  link: '',
  title: '',
  teacher: '',
  subject: 'fiqh',
  format: 'live',
  durationMin: 60,
  totalLessons: '',
  slots: [],
  sessions: [],
  remindersEnabled: true,
  reminderOffsets: [10],
  goalEnabled: true,
  goalTime: '20:00',
  goalLessons: '1',
  soundKey: 'target',
  fullScreen: false,
});

const fromCircle = (c: StudyCircle): Draft => ({
  platform: c.platform,
  link: c.link ?? '',
  title: c.title,
  teacher: c.teacher ?? '',
  subject: c.subject,
  format: c.format,
  durationMin: c.durationMin ?? c.slots[0]?.durationMin ?? (c.format === 'live' ? 60 : 30),
  totalLessons: c.totalLessons ? String(c.totalLessons) : '',
  slots: c.slots,
  sessions: c.sessions,
  remindersEnabled: c.remindersEnabled,
  reminderOffsets: c.reminderOffsets,
  goalEnabled: c.dailyGoal?.enabled ?? false,
  goalTime: c.dailyGoal?.time ?? '20:00',
  goalLessons: String(c.dailyGoal?.lessons ?? 1),
  soundKey: c.soundKey ?? 'target',
  fullScreen: !!c.fullScreen,
});

/**
 * Add / edit a circle in four short steps: platform (or smart-paste a link) →
 * details → schedule → reminders. Editing opens on the requested step and every
 * step stays reachable from the step dots.
 */
export function CircleFormSheet({
  open,
  onClose,
  editing,
  startStep,
}: {
  open: boolean;
  onClose: () => void;
  editing?: StudyCircle;
  startStep?: number;
}) {
  const addCircle = useStudyStore((s) => s.addCircle);
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(blank);
  const [paste, setPaste] = useState('');
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (!open) return;
    setD(editing ? fromCircle(editing) : blank());
    setStep(startStep ?? (editing ? 1 : 0));
    setPaste('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const applyPaste = (text: string) => {
    setPaste(text);
    const hit = detectPlatform(text);
    if (!hit) return;
    // Anything around the link (e.g. a shared invite message) becomes the title.
    const rest = text.replace(hit.link.replace(/^https:\/\//, ''), '').replace(/https?:\/\//, '').replace(/\s+/g, ' ').trim();
    set({
      platform: hit.platform,
      link: hit.link,
      format: hit.platform === 'youtube' ? 'series' : d.format,
      title: d.title || rest.slice(0, 80),
    });
    toast.info(`تعرّفنا على الرابط: ${PLATFORM_LABEL[hit.platform]}`);
    setStep(1);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) applyPaste(text);
    } catch {
      toast.info('الصق الرابط في الحقل');
    }
  };

  const save = () => {
    if (!d.title.trim()) {
      setStep(1);
      toast.error('اكتب اسم الحلقة');
      return;
    }
    const total = Math.round(Number(d.totalLessons));
    const input = {
      title: d.title.trim(),
      teacher: d.teacher.trim() || undefined,
      platform: d.platform,
      link: d.link.trim() || undefined,
      subject: d.subject,
      format: d.format,
      durationMin: d.durationMin,
      slots: d.slots,
      sessions: d.sessions,
      remindersEnabled: d.remindersEnabled,
      reminderOffsets: d.reminderOffsets.length ? d.reminderOffsets : [0],
      totalLessons: d.format === 'series' && total > 0 ? total : undefined,
      dailyGoal:
        d.format === 'series'
          ? { enabled: d.goalEnabled, time: d.goalTime || '20:00', lessons: Math.max(1, Math.round(Number(d.goalLessons) || 1)) }
          : undefined,
      soundKey: d.soundKey,
      fullScreen: d.fullScreen,
    };
    if (editing) {
      updateCircle(editing.id, input);
      toast.success('حُفظت التعديلات');
    } else {
      addCircle(input);
      toast.success('أُضيفت الحلقة، نفع الله بها');
    }
    onClose();
  };

  const last = step === STEPS.length - 1;

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'تعديل الحلقة' : 'حلقة علم جديدة'}>
      <div className="flex flex-col gap-5">
        {/* Step dots */}
        <ol className="flex items-center gap-2" aria-label="الخطوات">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className="w-full flex flex-col items-center gap-1.5 min-h-11"
              >
                <span
                  className={[
                    'h-1.5 w-full rounded-full transition-colors duration-300',
                    i <= step ? 'bg-teal dark:bg-teal-light' : 'bg-cream-dark dark:bg-white/10',
                  ].join(' ')}
                />
                <span className={['text-[11px] font-semibold', i === step ? 'text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
                  {s}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-[var(--radius-inner)] bg-teal/5 dark:bg-teal/10 ring-1 ring-teal/15 p-3 flex flex-col gap-2">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">الصق رابط الحلقة</p>
              <p className="text-xs text-text-muted">نتعرّف على المنصة تلقائياً: تيليجرام، واتساب، يوتيوب، زووم، جوجل ميت.</p>
              <div className="flex gap-2">
                <TextInput
                  value={paste}
                  // A real paste is detected right away; typing waits for Enter. (Guessing a
                  // paste from «grew by >3 chars» misfired on every word the keyboard commits whole.)
                  onValueChange={setPaste}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text').trim();
                    if (!text) return;
                    e.preventDefault();
                    applyPaste(text);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyPaste(e.currentTarget.value);
                  }}
                  placeholder="https://t.me/…"
                  dir="ltr"
                  inputMode="url"
                  className={fieldClass}
                  aria-label="رابط الحلقة"
                />
                <Button variant="soft" size="md" aria-label="لصق من الحافظة" onClick={() => void pasteFromClipboard()} leftIcon={<ClipboardPaste size={17} />} />
              </div>
            </div>
            <p className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">أو اختر المنصة</p>
            <div className="grid grid-cols-4 gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={d.platform === p}
                  onClick={() => {
                    set({ platform: p, format: p === 'youtube' ? 'series' : d.format });
                    setStep(1);
                  }}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-[var(--radius-inner)] py-3 ring-1 transition-colors',
                    d.platform === p ? 'ring-teal bg-teal/5 dark:bg-teal/10' : 'ring-black/[0.05] dark:ring-white/[0.07] hover:bg-teal/5',
                  ].join(' ')}
                >
                  <span className={['w-10 h-10 rounded-xl inline-flex items-center justify-center', PLATFORM_TONE[p]].join(' ')}>
                    <PlatformGlyph platform={p} size={20} />
                  </span>
                  <span className="text-[11px] font-semibold text-text-secondary dark:text-text-on-dark/80">{PLATFORM_LABEL[p]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <Field label="اسم الحلقة أو الدرس">
              <TextInput value={d.title} onValueChange={(v) => set({ title: v })} placeholder="شرح الأربعين النووية" className={fieldClass} />
            </Field>
            <Field label="الشيخ / المعلّم (اختياري)">
              <TextInput value={d.teacher} onValueChange={(v) => set({ teacher: v })} placeholder="الشيخ …" className={fieldClass} />
            </Field>
            {d.platform !== 'inperson' ? (
              <Field label="الرابط">
                <TextInput value={d.link} onValueChange={(v) => set({ link: v })} dir="ltr" inputMode="url" placeholder="https://" className={fieldClass} />
              </Field>
            ) : null}
            <Field label="نوع الحلقة">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FORMAT_LABEL) as CircleFormat[]).map((f) => (
                  <Pill key={f} active={d.format === f} onClick={() => set({ format: f })}>
                    {FORMAT_LABEL[f]}
                  </Pill>
                ))}
              </div>
            </Field>
            {d.format === 'series' ? (
              <Field label="عدد دروس السلسلة" hint="اتركه فارغاً إن لم تعرفه بعد">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={d.totalLessons}
                  onChange={(e) => set({ totalLessons: e.target.value })}
                  className={fieldClass}
                  placeholder="٤٠"
                />
              </Field>
            ) : null}
            <Field label="مدة الدرس" hint="نقاط الدرس في الترتيب بحسب مدته">
              <div className="flex flex-wrap gap-2">
                {LESSON_MINUTES.map((m) => (
                  <Pill key={m} active={d.durationMin === m} onClick={() => set({ durationMin: m })}>
                    {durationAr(m)}
                  </Pill>
                ))}
              </div>
            </Field>
            <Field label="المادّة">
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map((s) => (
                  <Pill key={s} active={d.subject === s} onClick={() => set({ subject: s })}>
                    {SUBJECT_LABEL[s]}
                  </Pill>
                ))}
              </div>
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">مواعيد أسبوعية</p>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<Plus size={15} />}
                onClick={() => set({ slots: [...d.slots, { weekday: new Date().getDay(), time: '20:00', durationMin: d.durationMin }] })}
              >
                موعد
              </Button>
            </div>
            {d.slots.length === 0 ? (
              <p className="text-xs text-text-muted">
                {d.format === 'series' ? 'سلسلة مسجّلة؟ لا تحتاج مواعيد — اضبط هدفاً يومياً في الأسفل.' : 'أضف يوم الدرس ووقته ليصلك التذكير كل أسبوع.'}
              </p>
            ) : null}
            {d.slots.map((s, i) => (
              <div key={i} className="rounded-[var(--radius-inner)] bg-cream-dark/40 dark:bg-white/[0.04] p-3 flex flex-col gap-2.5">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                  {WEEKDAY_AR.map((w, wd) => (
                    <Pill
                      key={w}
                      active={s.weekday === wd}
                      className="px-2.5"
                      onClick={() => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, weekday: wd } : x)) })}
                    >
                      {w}
                    </Pill>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <Field label="الوقت">
                    <input
                      type="time"
                      value={s.time}
                      onChange={(e) => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, time: e.target.value || x.time } : x)) })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="المدة (دقيقة)">
                    <NumberInput
                      min={5}
                      max={600}
                      value={s.durationMin ?? 60}
                      onValueChange={(n) => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, durationMin: n } : x)) })}
                      className={fieldClass}
                    />
                  </Field>
                  <Button variant="icon" aria-label="حذف الموعد" onClick={() => set({ slots: d.slots.filter((_, j) => j !== i) })}>
                    <Trash2 size={17} />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">جلسات لمرة واحدة</p>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<Plus size={15} />}
                onClick={() => {
                  const at = new Date();
                  at.setDate(at.getDate() + 1);
                  at.setHours(20, 0, 0, 0);
                  set({ sessions: [...d.sessions, { id: at.getTime().toString(36), at: at.getTime(), durationMin: d.durationMin }] });
                }}
              >
                جلسة
              </Button>
            </div>
            {d.sessions.map((s) => (
              <div key={s.id} className="flex items-end gap-2">
                <Field label="الموعد">
                  <input
                    type="datetime-local"
                    value={toLocalInput(s.at)}
                    onChange={(e) => {
                      const at = new Date(e.target.value).getTime();
                      if (Number.isFinite(at)) set({ sessions: d.sessions.map((x) => (x.id === s.id ? { ...x, at } : x)) });
                    }}
                    className={fieldClass}
                  />
                </Field>
                <Button variant="icon" aria-label="حذف الجلسة" onClick={() => set({ sessions: d.sessions.filter((x) => x.id !== s.id) })}>
                  <Trash2 size={17} />
                </Button>
              </div>
            ))}

            {d.format === 'series' ? (
              <div className="rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/25 p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">هدف يومي</span>
                    <span className="block text-xs text-text-muted">تذكير يومي حتى تنهي دروس اليوم</span>
                  </span>
                  <Toggle checked={d.goalEnabled} onChange={(v) => set({ goalEnabled: v })} label="هدف يومي" hideLabel />
                </div>
                {d.goalEnabled ? (
                  <div className="flex gap-2">
                    <Field label="وقت التذكير">
                      <input type="time" value={d.goalTime} onChange={(e) => set({ goalTime: e.target.value })} className={fieldClass} />
                    </Field>
                    <Field label="دروس في اليوم">
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={d.goalLessons}
                        onChange={(e) => set({ goalLessons: e.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تنبيهات المواعيد</span>
                <span className="block text-xs text-text-muted">قبل كل موعد أسبوعي أو جلسة</span>
              </span>
              <Toggle checked={d.remindersEnabled} onChange={(v) => set({ remindersEnabled: v })} label="تنبيهات المواعيد" hideLabel />
            </div>
            {d.remindersEnabled ? (
              <Field label="متى أذكّرك؟" hint="اختر أكثر من وقت إن شئت">
                <div className="flex flex-wrap gap-2">
                  {OFFSETS.map((o) => {
                    const on = d.reminderOffsets.includes(o);
                    return (
                      <Pill
                        key={o}
                        active={on}
                        onClick={() =>
                          set({ reminderOffsets: on ? d.reminderOffsets.filter((x) => x !== o) : [...d.reminderOffsets, o].sort((a, b) => a - b) })
                        }
                      >
                        {o === 0 ? 'عند البدء' : `قبل ${durationAr(o)}`}
                      </Pill>
                    );
                  })}
                </div>
              </Field>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary dark:text-text-on-dark">نغمة التنبيه</span>
              <SoundSelector value={d.soundKey} onChange={(k) => set({ soundKey: k })} ariaLabel="نغمة الحلقة" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تنبيه بملء الشاشة</span>
                <span className="block text-xs text-text-muted">مثل المكالمة، لدروس لا تريد أن تفوتك</span>
              </span>
              <Toggle checked={d.fullScreen} onChange={(v) => set({ fullScreen: v })} label="تنبيه بملء الشاشة" hideLabel />
            </div>
            {d.slots.length + d.sessions.length === 0 && !(d.format === 'series' && d.goalEnabled) ? (
              <p className="text-xs text-warning">لا توجد مواعيد بعد، فلن يصلك تنبيه. أضفها من خطوة «المواعيد».</p>
            ) : (
              <p className="text-xs text-text-muted">
                {toArabicDigits(d.slots.length)} موعد أسبوعي · {toArabicDigits(d.sessions.length)} جلسة
              </p>
            )}
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              السابق
            </Button>
          ) : null}
          <Button fullWidth onClick={() => (last || (editing && step > 0) ? save() : setStep(step + 1))}>
            {last || (editing && step > 0) ? 'حفظ' : 'التالي'}
          </Button>
          {editing && !last && step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step + 1)}>
              التالي
            </Button>
          ) : null}
        </div>
      </div>
    </BottomSheet>
  );
}
