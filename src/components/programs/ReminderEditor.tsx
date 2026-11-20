import type { ReminderAnchor, ReminderSpec } from '@/data/programsCatalog';
import { clockAr } from '@/store/studyModel';
import { fieldClass } from '@/components/study/studyUi';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

const ANCHORS: [ReminderAnchor, string][] = [
  ['time', 'وقت محدد'],
  ['fajr', 'الفجر'],
  ['sunrise', 'الشروق'],
  ['dhuhr', 'الظهر'],
  ['asr', 'العصر'],
  ['maghrib', 'المغرب'],
  ['isha', 'العشاء'],
];
const ANCHOR_AR = Object.fromEntries(ANCHORS) as Record<ReminderAnchor, string>;
const OFFSETS = [-45, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 30, 40, 45, 60, 90, 120, 150, 180];

const offsetAr = (o: number) => (o < 0 ? `قبله بـ ${ar(-o)} دقيقة` : o === 0 ? 'عند دخوله' : `بعده بـ ${ar(o)} دقيقة`);

/** «قبل الفجر بـ ٢٠ دقيقة» / «الساعة ٨:٣٠ م» (/ «مساء اليوم السابق…»). */
export function reminderSummary(spec: ReminderSpec): string {
  const when =
    spec.anchor === 'time'
      ? `الساعة ${clockAr(spec.time || '20:00')}`
      : spec.offset === 0
        ? `عند ${ANCHOR_AR[spec.anchor]}`
        : `${spec.offset < 0 ? 'قبل' : 'بعد'} ${ANCHOR_AR[spec.anchor]} بـ ${ar(Math.abs(spec.offset))} دقيقة`;
  return spec.eve ? `مساء اليوم السابق، ${when}` : when;
}

/** Each reminder's time: a clock time, or a prayer ± minutes (moves with the prayer every day). */
export function ReminderEditor({ specs, onChange }: { specs: ReminderSpec[]; onChange: (specs: ReminderSpec[]) => void }) {
  const set = (i: number, patch: Partial<ReminderSpec>) => onChange(specs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-3">
      {specs.map((s, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {specs.length > 1 || s.eve ? (
            <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">
              {s.label ? `تذكير ${s.label}` : s.eve ? 'مساء اليوم السابق' : 'التذكير'}
            </span>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="مرتبط بـ"
              className={fieldClass}
              value={s.anchor}
              onChange={(e) => set(i, { anchor: e.target.value as ReminderAnchor })}
            >
              {ANCHORS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {s.anchor === 'time' ? (
              <input
                type="time"
                aria-label="الوقت"
                className={`${fieldClass} font-counter tabular-nums`}
                value={s.time || '20:00'}
                onChange={(e) => e.target.value && set(i, { time: e.target.value })}
              />
            ) : (
              <select aria-label="الفارق" className={fieldClass} value={s.offset} onChange={(e) => set(i, { offset: Number(e.target.value) })}>
                {[...new Set([...OFFSETS, s.offset])].sort((a, b) => a - b).map((o) => (
                  <option key={o} value={o}>
                    {offsetAr(o)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="text-[11px] text-text-muted">{reminderSummary(s)}</span>
        </div>
      ))}
    </div>
  );
}
