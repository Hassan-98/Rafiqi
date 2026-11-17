import { useEffect, useMemo, useState } from 'react';
import { Bell, Clock, Repeat, Trash2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import {
  useCustomRemindersStore,
  SECTION_LABEL,
  SECTION_SOUND,
  type ReminderSection,
} from '@/store/customRemindersStore';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

interface QuickReminderSheetProps {
  open: boolean;
  onClose: () => void;
  section: ReminderSection | string;
  /** Pre-filled title — e.g. the current set / surah name. */
  defaultTitle?: string;
  /** Pre-filled note/details. */
  defaultNote?: string;
}

type Mode = 'duration' | 'time';

const DURATIONS: { min: number; label: string }[] = [
  { min: 5, label: '٥ دقائق' },
  { min: 15, label: '١٥ دقيقة' },
  { min: 30, label: '٣٠ دقيقة' },
  { min: 60, label: 'ساعة' },
  { min: 180, label: '٣ ساعات' },
];

/** Next HH:mm occurrence today, or tomorrow if it already passed. */
function nextTimeIso(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const t = new Date();
  t.setHours(h || 0, m || 0, 0, 0);
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  return t.toISOString();
}

function defaultTimeStr(): string {
  const t = new Date(Date.now() + 60 * 60 * 1000); // an hour from now
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/**
 * A reusable sheet for scheduling a free-form reminder against any section.
 * The user names it, optionally adds details, then either nudges themselves
 * after a set delay or every day at a fixed time. Existing reminders for the
 * same section are listed below for quick removal.
 */
export function QuickReminderSheet({
  open,
  onClose,
  section,
  defaultTitle = '',
  defaultNote = '',
}: QuickReminderSheetProps) {
  const add = useCustomRemindersStore((s) => s.add);
  const remove = useCustomRemindersStore((s) => s.remove);
  const all = useCustomRemindersStore((s) => s.reminders);
  const existing = useMemo(() => all.filter((r) => r.section === section), [all, section]);

  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState(defaultNote);
  const [mode, setMode] = useState<Mode>('duration');
  const [durationMin, setDurationMin] = useState(30);
  const [timeStr, setTimeStr] = useState(defaultTimeStr);
  const [repeat, setRepeat] = useState<'none' | 'daily'>('daily');

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setNote(defaultNote);
    setMode('duration');
    setDurationMin(30);
    setTimeStr(defaultTimeStr());
    setRepeat('daily');
  }, [open, defaultTitle, defaultNote]);

  const summary = useMemo(() => {
    if (mode === 'duration') {
      const label = DURATIONS.find((d) => d.min === durationMin)?.label ?? `${toArabicDigits(durationMin)} دقيقة`;
      return `سيصلك التنبيه بعد ${label}`;
    }
    const [h, m] = timeStr.split(':');
    const clock = `${toArabicDigits(h)}:${toArabicDigits(m)}`;
    return repeat === 'daily' ? `كل يوم عند الساعة ${clock}` : `اليوم/غداً عند الساعة ${clock}`;
  }, [mode, durationMin, timeStr, repeat]);

  const save = () => {
    const finalTitle = title.trim() || `تذكير ${SECTION_LABEL[section] ?? ''}`.trim();
    const triggerTime =
      mode === 'duration' ? new Date(Date.now() + durationMin * 60 * 1000).toISOString() : nextTimeIso(timeStr);
    add({
      section,
      title: finalTitle,
      note: note.trim() || undefined,
      triggerTime,
      repeat: mode === 'duration' ? 'none' : repeat,
      soundKey: SECTION_SOUND[section] ?? 'default',
    });
    toast.success('تم ضبط التذكير 🔔');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`تذكير مخصّص · ${SECTION_LABEL[section] ?? ''}`}>
      <div className="flex flex-col gap-4">
        {/* Title */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-text-muted">عنوان التذكير</span>
          <TextInput
            value={title}
            onValueChange={setTitle}
            placeholder="مثال: لا تنسَ وردك"
            dir="rtl"
            className="w-full rounded-xl border border-teal/15 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 text-sm text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
        </label>

        {/* Optional details */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-text-muted">تفاصيل (اختياري)</span>
          <TextArea
            value={note}
            onValueChange={setNote}
            placeholder="اكتب سبب التذكير أو ما تريد فعله…"
            rows={2}
            dir="rtl"
            className="w-full rounded-xl border border-teal/15 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 text-sm text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
        </label>

        {/* Mode switch */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-cream-dark dark:bg-dark-card">
          {([
            { id: 'duration', label: 'بعد مدّة', Icon: Clock },
            { id: 'time', label: 'وقت محدّد', Icon: Repeat },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={[
                'inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors',
                mode === id
                  ? 'bg-teal text-on-accent shadow-[var(--shadow-sm)]'
                  : 'text-text-secondary hover:text-teal',
              ].join(' ')}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {mode === 'duration' ? (
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.min}
                type="button"
                onClick={() => setDurationMin(d.min)}
                className={[
                  'px-3.5 py-2 rounded-full text-sm font-semibold transition-colors',
                  durationMin === d.min
                    ? 'bg-teal text-on-accent'
                    : 'bg-white dark:bg-dark-card border border-teal/10 dark:border-dark-border text-text-secondary hover:text-teal',
                ].join(' ')}
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-secondary dark:text-text-on-dark">الساعة</span>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                dir="ltr"
                className="rounded-xl border border-teal/15 dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm font-counter text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'daily', label: 'كل يوم' },
                { id: 'none', label: 'مرّة واحدة' },
              ] as const).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRepeat(id)}
                  className={[
                    'py-2 rounded-xl text-sm font-semibold border transition-colors',
                    repeat === id
                      ? 'bg-teal/10 dark:bg-teal/20 border-teal/40 text-teal dark:text-teal-light'
                      : 'border-teal/10 dark:border-dark-border text-text-secondary hover:text-teal',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live summary */}
        <p className="inline-flex items-center gap-1.5 text-xs text-teal dark:text-teal-light bg-teal/8 dark:bg-teal/15 rounded-xl px-3 py-2">
          <Bell size={13} /> {summary}
        </p>

        <Button variant="primary" fullWidth leftIcon={<Check size={17} />} onClick={save}>
          ضبط التذكير
        </Button>

        {/* Existing reminders for this section */}
        {existing.length > 0 ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-[11px] font-bold text-text-muted">تنبيهات هذا القسم</p>
            {existing.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-cream-dark dark:bg-dark-card"
              >
                <Bell size={14} className="text-teal shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">
                    {r.title}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {r.repeat === 'daily' ? 'كل يوم · ' : ''}
                    {toArabicDigits(format(new Date(r.triggerTime), 'HH:mm'))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    remove(r.id);
                    toast.info('تم حذف التذكير');
                  }}
                  aria-label="حذف التذكير"
                  className="p-1.5 text-text-muted hover:text-danger shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
