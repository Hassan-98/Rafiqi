import { useEffect, useState } from 'react';
import { Minus, Plus, MoonStar, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useQiyamStore, type QiyamNight } from '@/store/qiyamStore';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { nightName } from './nightWindow';

const RAKAAT_PRESETS = [2, 4, 6, 8, 10, 12];
/** 0 = not recorded (duration is optional). */
const MINUTE_PRESETS = [0, 15, 30, 45, 60, 90];

export interface QiyamDraft {
  rakaat: number;
  witr: boolean;
  minutes?: number;
}

interface QiyamLogSheetProps {
  open: boolean;
  onClose: () => void;
  nightKey: string;
  /** The night's existing record, if any (edit mode). */
  existing?: QiyamNight;
  /** Pre-fill for a new record (the user's last choice). */
  initial: QiyamDraft;
  onSaved: (draft: QiyamDraft, wasNew: boolean) => void;
  onRemoved: () => void;
}

/** Log or edit any night: rakaat, witr and an optional duration. */
export function QiyamLogSheet({ open, onClose, nightKey, existing, initial, onSaved, onRemoved }: QiyamLogSheetProps) {
  const logNight = useQiyamStore((s) => s.logNight);
  const removeNight = useQiyamStore((s) => s.removeNight);
  const [rakaat, setRakaat] = useState(initial.rakaat);
  const [witr, setWitr] = useState(initial.witr);
  const [minutes, setMinutes] = useState(initial.minutes ?? 0);

  useEffect(() => {
    if (!open) return;
    const src = existing && existing.rakaat > 0 ? existing : initial;
    setRakaat(src.rakaat || initial.rakaat);
    setWitr(existing ? existing.witr : initial.witr);
    setMinutes((existing ? existing.minutes : initial.minutes) ?? 0);
    // Re-seed only when the sheet opens (or targets another night).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nightKey]);

  const save = () => {
    const draft = { rakaat, witr, minutes: minutes > 0 ? minutes : undefined };
    logNight({ ...draft, nightKey });
    onSaved(draft, !existing);
  };

  const chip = (on: boolean) =>
    [
      'min-h-11 rounded-xl text-[15px] font-bold font-counter tabular-nums transition-colors duration-200',
      on
        ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-sm)]'
        : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10',
    ].join(' ');

  return (
    <BottomSheet open={open} onClose={onClose} title={`قيام ${nightName(nightKey)}`}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-text-secondary dark:text-text-on-dark/80">عدد الركعات</p>
          <div className="grid grid-cols-6 gap-2">
            {RAKAAT_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rakaat === r}
                onClick={() => {
                  setRakaat(r);
                  void hapticsService.selection();
                }}
                className={chip(rakaat === r)}
              >
                {toArabicDigits(r)}
              </button>
            ))}
          </div>
          {/* Any other even count (e.g. ٢٠ في رمضان). */}
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              aria-label="ركعتان أقل"
              onClick={() => setRakaat((r) => Math.max(2, r - 2))}
              className="w-11 h-11 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center"
            >
              <Minus size={17} />
            </button>
            <span className="text-3xl font-counter font-bold text-teal dark:text-teal-light tabular-nums min-w-14 text-center">
              {toArabicDigits(rakaat)}
            </span>
            <button
              type="button"
              aria-label="ركعتان أكثر"
              onClick={() => setRakaat((r) => Math.min(40, r + 2))}
              className="w-11 h-11 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center"
            >
              <Plus size={17} />
            </button>
          </div>
        </section>

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-white/[0.05] px-3.5 py-3">
          <div>
            <p className="font-semibold text-text-primary dark:text-text-on-dark">الوتر</p>
            <p className="text-[11px] text-text-muted font-ornate">«اجعلوا آخر صلاتكم بالليل وترًا»</p>
          </div>
          <Toggle checked={witr} onChange={setWitr} size="sm" label="الوتر" hideLabel />
        </div>

        <section className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-text-secondary dark:text-text-on-dark/80">
            المدّة <span className="text-text-muted font-normal">(اختياري، بالدقائق)</span>
          </p>
          <div className="grid grid-cols-6 gap-2">
            {MINUTE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => setMinutes(m)}
                className={chip(minutes === m) + ' text-[13px]'}
              >
                {m === 0 ? '—' : toArabicDigits(m)}
              </button>
            ))}
          </div>
        </section>

        <Button variant="primary" size="lg" fullWidth onClick={save} haptic="medium" leftIcon={<MoonStar size={18} />}>
          {existing ? 'حفظ التعديل' : `سجّل ${toArabicDigits(rakaat)} ركعات${witr ? ' + الوتر' : ''}`}
        </Button>
        {existing ? (
          <Button
            variant="ghost"
            fullWidth
            haptic="medium"
            leftIcon={<Trash2 size={15} />}
            onClick={() => {
              removeNight(nightKey);
              onRemoved();
            }}
            className="!text-danger"
          >
            حذف تسجيل هذه الليلة
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}
