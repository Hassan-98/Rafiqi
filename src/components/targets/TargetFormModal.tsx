import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { X, ListPlus, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import { SoundSelector } from '@/components/settings/SoundPicker';
import { pickCustomSound } from '@/services/customSound';
import {
  useTargetsStore,
  TARGET_UNIT_LABEL,
  TARGET_RECURRENCE_LABEL,
  QURAN_UNITS,
  RECITE_UNITS,
  nextDeadline,
  type TargetUnit,
  type TargetRecurrence,
  type NewTargetInput,
  type Target,
} from '@/store/targetsStore';
import { surahs } from '@/data/surahs';
import { dhikrApiService } from '@/services/DhikrApiService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import type { SoundKey } from '@/services/notifications/sounds';

const UNITS: TargetUnit[] = ['dhikr', 'times', 'ayah', 'surah', 'page', 'juz', 'duaa'];
const RECURRENCES: TargetRecurrence[] = ['none', 'daily', 'weekly', 'monthly'];

/** One-tap starting points for the most common awrad (create mode only). */
const TEMPLATES: {
  label: string;
  title: string;
  unit: TargetUnit;
  total: number;
  recurrence: TargetRecurrence;
  quranSurah?: number;
  items?: string[];
}[] = [
  { label: 'استغفار ١٠٠ يومياً', title: 'الاستغفار', unit: 'dhikr', total: 100, recurrence: 'daily', items: ['أستغفر الله وأتوب إليه'] },
  {
    label: 'الصلاة على النبي ﷺ',
    title: 'الصلاة على النبي ﷺ',
    unit: 'dhikr',
    total: 100,
    recurrence: 'daily',
    items: ['اللهم صلِّ وسلِّم على نبيّنا محمد'],
  },
  { label: 'صفحتان من القرآن', title: 'وِرد القرآن اليومي', unit: 'page', total: 2, recurrence: 'daily' },
  { label: 'جزء كل يوم', title: 'جزء من القرآن', unit: 'juz', total: 1, recurrence: 'daily' },
  { label: 'الكهف كل أسبوع', title: 'سورة الكهف', unit: 'surah', total: 1, recurrence: 'weekly', quranSurah: 18 },
];

/** Flexible duration units — user types any number + picks a unit. */
const DUR_UNITS: { id: string; label: string; ms: number }[] = [
  { id: 'minute', label: 'دقيقة', ms: 60_000 },
  { id: 'hour', label: 'ساعة', ms: 3_600_000 },
  { id: 'day', label: 'يوم', ms: 86_400_000 },
  { id: 'week', label: 'أسبوع', ms: 604_800_000 },
  { id: 'month', label: 'شهر', ms: 2_592_000_000 },
];
/** Flexible reminder-interval units. */
const INT_UNITS: { id: string; label: string; minutes: number }[] = [
  { id: 'minute', label: 'دقيقة', minutes: 1 },
  { id: 'hour', label: 'ساعة', minutes: 60 },
  { id: 'day', label: 'يوم', minutes: 1440 },
];

const inputClass =
  'w-full bg-cream-dark/60 dark:bg-white/[0.06] text-text-primary dark:text-text-on-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40';

interface TargetFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the form edits this target instead of creating a new one. */
  editing?: Target;
}

/** Shared create/edit form for targets. In edit mode the period deadline is
 *  preserved (only recomputed if the recurrence cadence changes). */
export function TargetFormModal({ open, onClose, editing }: TargetFormModalProps) {
  const addTarget = useTargetsStore((s) => s.addTarget);
  const updateTarget = useTargetsStore((s) => s.updateTarget);
  const isEdit = !!editing;

  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState<TargetUnit>('dhikr');
  const [total, setTotal] = useState('100');
  const [recurrence, setRecurrence] = useState<TargetRecurrence>('none');
  // Carry the unfinished remainder into the next period BY DEFAULT — this is
  // what users expect from a recurring wird ("yesterday's leftover adds on
  // top of today's goal"). Can still be turned off for a fresh goal each period.
  const [carryOver, setCarryOver] = useState(true);
  const [durationValue, setDurationValue] = useState('1');
  const [durationUnit, setDurationUnit] = useState('day');
  const [intervalValue, setIntervalValue] = useState('1');
  const [intervalUnit, setIntervalUnit] = useState('hour');
  const [reminder, setReminder] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [note, setNote] = useState('');
  const [soundKey, setSoundKey] = useState<SoundKey>('target');
  const [customChannelId, setCustomChannelId] = useState<string | undefined>();
  const [customLabel, setCustomLabel] = useState<string | undefined>();
  // Quran scope (optional)
  const [quranSurah, setQuranSurah] = useState('');
  const [quranFrom, setQuranFrom] = useState('');
  const [quranTo, setQuranTo] = useState('');
  // Attached adhkar/duaa
  const [items, setItems] = useState<string[]>([]);
  const [itemInput, setItemInput] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const isQuran = QURAN_UNITS.includes(unit);
  const isRecite = RECITE_UNITS.includes(unit);
  const addItem = (text: string) => {
    const t = text.trim();
    if (t) setItems((prev) => [...prev, t]);
  };

  // (Re)initialise when the modal opens — prefill from `editing`, else defaults.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setUnit(editing.unit);
      setTotal(String(editing.baseTotal ?? editing.total));
      setRecurrence(editing.recurrence ?? 'none');
      setCarryOver(!!editing.carryOver);
      setIntervalValue(String(editing.intervalMinutes >= 60 && editing.intervalMinutes % 60 === 0
        ? editing.intervalMinutes / 60
        : editing.intervalMinutes));
      setIntervalUnit(editing.intervalMinutes >= 60 && editing.intervalMinutes % 60 === 0 ? 'hour' : 'minute');
      setReminder(editing.reminderEnabled);
      setFullScreen(!!editing.fullScreen);
      setNote(editing.note ?? '');
      setSoundKey(editing.soundKey ?? 'target');
      setCustomChannelId(editing.customChannelId);
      setCustomLabel(editing.customLabel);
      setQuranSurah(editing.quranSurah ? String(editing.quranSurah) : '');
      setQuranFrom(editing.quranFrom ? String(editing.quranFrom) : '');
      setQuranTo(editing.quranTo ? String(editing.quranTo) : '');
      setItems(editing.items ?? []);
      setItemInput('');
    } else {
      setTitle('');
      setUnit('dhikr');
      setTotal('100');
      setRecurrence('none');
      setCarryOver(true);
      setDurationValue('1');
      setDurationUnit('day');
      setIntervalValue('1');
      setIntervalUnit('hour');
      setReminder(true);
      setFullScreen(false);
      setNote('');
      setSoundKey('target');
      setCustomChannelId(undefined);
      setCustomLabel(undefined);
      setQuranSurah('');
      setQuranFrom('');
      setQuranTo('');
      setItems([]);
      setItemInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const submit = () => {
    const totalNum = Math.max(1, Math.round(Number(total) || 0));
    if (!title.trim()) {
      toast.error('أدخل عنوان الوِرد');
      return;
    }
    const intUnit = INT_UNITS.find((u) => u.id === intervalUnit) ?? INT_UNITS[1];
    const intervalMinutes = Math.max(1, Math.round((Number(intervalValue) || 1) * intUnit.minutes));

    const common = {
      title: title.trim(),
      unit,
      total: totalNum,
      recurrence,
      carryOver: recurrence !== 'none' ? carryOver : undefined,
      note: note.trim() || undefined,
      quranSurah: isQuran && quranSurah ? Number(quranSurah) : undefined,
      quranFrom: isQuran && quranFrom ? Number(quranFrom) : undefined,
      quranTo: isQuran && quranTo ? Number(quranTo) : undefined,
      items: isRecite && items.length ? items : undefined,
      intervalMinutes,
      reminderEnabled: reminder,
      fullScreen,
      soundKey,
      customChannelId,
      customLabel,
    };

    if (editing) {
      // Preserve deadline/streak unless the recurrence cadence changed.
      const origRec = editing.recurrence ?? 'none';
      let deadline = editing.deadline;
      let streak = editing.streak;
      if (recurrence !== origRec) {
        if (recurrence !== 'none') {
          deadline = nextDeadline(recurrence, Date.now());
          streak = 0;
        } else {
          streak = undefined;
        }
      }
      updateTarget(editing.id, {
        ...common,
        // Keep progress within the (possibly new) total.
        current: Math.min(editing.current, totalNum),
        deadline,
        streak,
      });
      toast.success('تم تحديث الوِرد');
      onClose();
      return;
    }

    // Create: recurring targets derive their deadline from the period.
    let deadline: number;
    if (recurrence !== 'none') {
      deadline = nextDeadline(recurrence, Date.now());
    } else {
      const durUnit = DUR_UNITS.find((u) => u.id === durationUnit) ?? DUR_UNITS[2];
      const durationMs = Math.max(1, Number(durationValue) || 1) * durUnit.ms;
      deadline = Date.now() + durationMs;
    }
    const input: NewTargetInput = { ...common, deadline };
    addTarget(input);
    toast.success('تم إنشاء الوِرد، أعانك الله عليه');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'تعديل الوِرد' : 'وِرد جديد'} size="md">
      <div className="flex flex-col gap-4">
        {!isEdit ? (
          <Field label="ابدأ من قالب">
            {/* Wrapped, not a side-scroller: a mouse can't swipe to the hidden ones. */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tp) => {
                const on = title === tp.title && unit === tp.unit && recurrence === tp.recurrence;
                return (
                  <button
                    key={tp.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setTitle(tp.title);
                      setUnit(tp.unit);
                      setTotal(String(tp.total));
                      setRecurrence(tp.recurrence);
                      setQuranSurah(tp.quranSurah ? String(tp.quranSurah) : '');
                      setItems(tp.items ?? []);
                    }}
                    className={[
                      'shrink-0 min-h-9 rounded-xl px-3 text-xs font-semibold ring-1 transition-colors',
                      on
                        ? 'bg-teal/12 text-teal dark:text-teal-light ring-teal/40'
                        : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/80 ring-black/[0.06] dark:ring-white/[0.08] hover:ring-teal/30',
                    ].join(' ')}
                  >
                    {tp.label}
                  </button>
                );
              })}
            </div>
          </Field>
        ) : null}

        <Field label="العنوان">
          <TextInput
            value={title}
            onValueChange={setTitle}
            placeholder="مثال: ختم سورة الكهف"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <TextInput
              type="number"
              inputMode="numeric"
              value={total}
              onValueChange={setTotal}
              className={`${inputClass} font-counter`}
              dir="ltr"
            />
          </Field>
          <Field label="الوحدة">
            <select value={unit} onChange={(e) => setUnit(e.target.value as TargetUnit)} className={inputClass}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {TARGET_UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="التكرار">
          <div role="radiogroup" aria-label="التكرار" className="grid grid-cols-4 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-white/[0.06] p-1">
            {RECURRENCES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={recurrence === r}
                onClick={() => setRecurrence(r)}
                className={[
                  'min-h-10 rounded-xl text-xs font-bold transition-colors',
                  recurrence === r
                    ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                    : 'text-text-muted',
                ].join(' ')}
              >
                {TARGET_RECURRENCE_LABEL[r]}
              </button>
            ))}
          </div>
          {recurrence !== 'none' ? (
            <>
              <span className="text-[11px] text-text-muted px-1">
                يتجدّد الوِرد تلقائياً كل فترة، مع احتساب سلسلة الإنجاز.
              </span>
              <div className="flex items-start justify-between gap-3 bg-cream-dark/60 dark:bg-white/[0.06] rounded-xl px-3 py-2.5 mt-1">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-text-primary dark:text-text-on-dark">
                    ترحيل المتبقّي للفترة التالية
                  </span>
                  <span className="block text-[11px] text-text-muted leading-snug mt-0.5">
                    تُضاف الكمية غير المكتملة إلى هدف الفترة القادمة (مثال: ١٠٠ من ٢٠٠ اليوم ← ٠ من ٣٠٠ غداً).
                  </span>
                </div>
                <Toggle checked={carryOver} onChange={setCarryOver} size="sm" />
              </div>
            </>
          ) : null}
        </Field>

        {/* Quran scope — optional surah + range, for ayah/surah/page/juz. */}
        {isQuran ? (
          <Field label="نطاق القرآن (اختياري)">
            <div className="flex flex-col gap-2">
              {unit === 'ayah' || unit === 'surah' ? (
                <select value={quranSurah} onChange={(e) => setQuranSurah(e.target.value)} className={inputClass}>
                  <option value="">كل القرآن</option>
                  {surahs.map((s) => (
                    <option key={s.number} value={s.number}>
                      {toArabicDigits(s.number)}. {s.nameArabic}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={quranFrom}
                  onValueChange={setQuranFrom}
                  placeholder={unit === 'ayah' ? 'من الآية' : `من ${TARGET_UNIT_LABEL[unit]}`}
                  dir="ltr"
                  className={`${inputClass} font-counter`}
                />
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={quranTo}
                  onValueChange={setQuranTo}
                  placeholder={unit === 'ayah' ? 'إلى الآية' : `إلى ${TARGET_UNIT_LABEL[unit]}`}
                  dir="ltr"
                  className={`${inputClass} font-counter`}
                />
              </div>
            </div>
          </Field>
        ) : null}

        {/* Adhkar / duaa items — manual add or pick from the adhkar list. */}
        {isRecite ? (
          <Field label={unit === 'duaa' ? 'أدعية الوِرد' : 'أذكار الوِرد'}>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 bg-cream-dark/60 dark:bg-white/[0.06] rounded-xl px-3 py-2">
                  <span className="flex-1 text-xs font-arabic leading-relaxed text-text-primary dark:text-text-on-dark line-clamp-2">
                    {it}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="حذف"
                    className="text-text-muted hover:text-danger shrink-0"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <TextInput
                  value={itemInput}
                  onValueChange={setItemInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItem(itemInput);
                      setItemInput('');
                    }
                  }}
                  placeholder={unit === 'duaa' ? 'أضف دعاءً' : 'أضف ذكراً'}
                  className={`flex-1 ${inputClass}`}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    addItem(itemInput);
                    setItemInput('');
                  }}
                >
                  إضافة
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-teal dark:text-teal-light py-1"
              >
                <ListPlus size={15} /> اختر من قائمة الأذكار
              </button>
            </div>
          </Field>
        ) : null}

        {/* Duration is creation-only; on edit the deadline is preserved. */}
        {!isEdit && recurrence === 'none' ? (
          <Field label="مدّة الوِرد">
            <div className="flex gap-2">
              <TextInput
                type="number"
                inputMode="numeric"
                min={1}
                value={durationValue}
                onValueChange={setDurationValue}
                className={`${inputClass.replace('w-full ', '')} w-24 shrink-0 font-counter text-center`}
                dir="ltr"
              />
              <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)} className={`${inputClass.replace('w-full ', '')} flex-1 min-w-0`}>
                {DUR_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        ) : null}

        <Field label="التذكير كل">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <TextInput
                type="number"
                inputMode="numeric"
                min={1}
                value={intervalValue}
                onValueChange={setIntervalValue}
                className={`${inputClass.replace('w-full ', '')} w-24 shrink-0 font-counter text-center`}
                dir="ltr"
              />
              <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value)} className={`${inputClass.replace('w-full ', '')} flex-1 min-w-0`}>
                {INT_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">تفعيل الإشعار</span>
              <Toggle checked={reminder} onChange={setReminder} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-secondary">نغمة التنبيه</span>
              <SoundSelector
                value={soundKey}
                customLabel={customLabel}
                ariaLabel="نغمة الوِرد"
                onChange={(k) => {
                  setSoundKey(k);
                  setCustomChannelId(undefined);
                  setCustomLabel(undefined);
                }}
                onPickCustom={async () => {
                  const res = await pickCustomSound(`target_${Date.now()}`, 'تنبيه هدف');
                  if (res) {
                    setCustomChannelId(res.channelId);
                    setCustomLabel(res.label);
                  }
                }}
              />
            </div>
            {Capacitor.getPlatform() === 'android' ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary inline-flex items-center gap-1.5">
                  <Smartphone size={13} /> تنبيه ملء الشاشة
                </span>
                <Toggle checked={fullScreen} onChange={setFullScreen} size="sm" />
              </div>
            ) : null}
          </div>
        </Field>

        {!isRecite ? (
          <Field label="نصّ للقراءة (اختياري)">
            <TextArea
              value={note}
              onValueChange={setNote}
              rows={2}
              placeholder="ذِكر أو دعاء يظهر في صفحة الوِرد"
              className={`${inputClass} resize-none`}
            />
          </Field>
        ) : null}

        <Button fullWidth onClick={submit}>
          {isEdit ? 'حفظ التعديلات' : 'إنشاء الوِرد'}
        </Button>
      </div>

      <AdhkarPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={(text) => addItem(text)} />
    </Modal>
  );
}

/** Picks adhkar from the built-in morning/evening/post-prayer sets to attach. */
function AdhkarPickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (text: string) => void;
}) {
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      dhikrApiService.getMorning(),
      dhikrApiService.getEvening(),
      dhikrApiService.getPostPrayer(),
    ])
      .then(([m, e, p]) => {
        if (cancelled) return;
        const all = [...m, ...e, ...p].map((d) => d.arabic).filter(Boolean);
        setList(Array.from(new Set(all)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="اختر من الأذكار" size="md">
      <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pe-1">
        {list.length === 0 ? (
          <p className="text-center text-xs text-text-muted py-6">جارٍ التحميل…</p>
        ) : (
          list.map((text, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onAdd(text);
                toast.success('أُضيف للهدف');
              }}
              className="text-start bg-cream-dark/60 dark:bg-white/[0.06] rounded-xl p-3 active:scale-[0.98] transition-transform"
            >
              <span className="block font-arabic text-sm leading-loose text-text-primary dark:text-text-on-dark line-clamp-2">
                {text}
              </span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-text-secondary dark:text-text-on-dark/80 px-1">{label}</span>
      {children}
    </div>
  );
}
