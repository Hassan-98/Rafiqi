import { AlarmClock, BookOpenText, Check, Sparkles } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { motion } from '@/lib/motion';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import {
  usePrayerLogStore,
  sunnahRakaatOn,
  PRAYERS_ORDER,
  DUHA_RAKAAT_OPTIONS,
  duhaRakaatOf,
  fardCountOf,
  type PrayerCheckType,
} from '@/store/prayerLogStore';
import { useSettingsStore } from '@/store/settingsStore';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { PrayerName } from '@/types';

const NAME: Record<PrayerName, string> = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

/** «الجمعة» instead of the Dhuhr on Fridays, for men. */
export function prayerName(p: PrayerName, dateKey: string, male: boolean): string {
  return p === 'dhuhr' && male && new Date(`${dateKey}T12:00:00`).getDay() === 5 ? 'الجمعة' : NAME[p];
}

/** «ركعتان» / «٤ ركعات» — words avoid a separator dot reading as Arabic zero. */
export const rakaat = (n: number) => (n === 2 ? 'ركعتان' : `${toArabicDigits(n)} ركعات`);

const dayFmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
export const dayTitle = (dateKey: string) => dayFmt.format(new Date(`${dateKey}T12:00:00`));

/**
 * A sunnah / nafl PRAYER: a pill with its own round node (dashed gold, filled
 * with a check once prayed) — the same language as the Duha node, so a circle
 * always means «a prayer», unlike the «في المسجد» checkbox.
 */
export function SunnahChip({ label, done, onClick }: { label: string; done: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={done}
      className={[
        'inline-flex items-center gap-1.5 min-h-8 ps-1.5 pe-2.5 rounded-full text-[11.5px] font-semibold ring-1 transition-colors',
        done
          ? 'bg-gold/15 text-gold-dark dark:text-gold-light ring-gold/40'
          : 'bg-gold/[0.06] text-text-secondary dark:text-text-on-dark/80 ring-gold/25 hover:ring-gold/50',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'w-[18px] h-[18px] rounded-full inline-flex items-center justify-center shrink-0',
          done ? 'bg-[image:var(--gradient-gold)] text-on-accent' : 'border-[1.5px] border-dashed border-gold/60',
        ].join(' ')}
      >
        {done ? <Check size={11} strokeWidth={3.5} /> : null}
      </span>
      <span>{label}</span>
    </motion.button>
  );
}

/** How many rakaat of الضحى — one tap logs (or re-counts) the day with that many. */
export function DuhaRakaatPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="ركعات الضحى">
      {DUHA_RAKAAT_OPTIONS.map((n) => {
        const on = value === n;
        return (
          <motion.button
            key={n}
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onPick(n)}
            aria-pressed={on}
            aria-label={`${n} ركعات`}
            className={[
              'min-w-9 h-8 px-2 rounded-full text-[12px] font-counter font-bold tabular-nums ring-1 transition-colors',
              on
                ? 'bg-[image:var(--gradient-gold)] text-on-accent ring-transparent shadow-[var(--shadow-xs)]'
                : 'bg-gold/[0.06] text-gold-dark dark:text-gold-light ring-gold/25 hover:ring-gold/50',
            ].join(' ')}
          >
            {toArabicDigits(n)}
          </motion.button>
        );
      })}
      <span className="ms-0.5 text-[10.5px] text-text-muted">ركعات</span>
    </div>
  );
}

/** «على وقتها» — women's counterpart of «في المسجد» (her prayer at home is the
 *  better one): prayed at the start of its time. Marking it also marks the fard. */
export function OnTimeChip({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={done}
      aria-label="صلّيتها على وقتها"
      className={[
        'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold ring-1 transition-colors',
        done
          ? 'bg-teal/12 text-teal dark:text-teal-light ring-teal/35'
          : 'text-text-muted ring-black/[0.08] dark:ring-white/[0.1] hover:text-teal dark:hover:text-teal-light hover:ring-teal/30',
      ].join(' ')}
    >
      <AlarmClock size={13} aria-hidden />
      <span>على وقتها</span>
      {done ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
    </motion.button>
  );
}

/** «في المسجد» — men only; an ATTRIBUTE of the fard, so a small teal tag
 *  (not a round gold prayer pill). Marking it also marks the fard. */
export function MosqueChip({ done, onClick }: { done: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={done}
      aria-label="صلّيتها في المسجد"
      className={[
        'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold ring-1 transition-colors',
        done
          ? 'bg-teal/12 text-teal dark:text-teal-light ring-teal/35'
          : 'text-text-muted ring-black/[0.08] dark:ring-white/[0.1] hover:text-teal dark:hover:text-teal-light hover:ring-teal/30',
      ].join(' ')}
    >
      <Mosque size={13} aria-hidden />
      <span>في المسجد</span>
      {done ? <Check size={11} strokeWidth={3} aria-hidden /> : null}
    </motion.button>
  );
}

/**
 * «أذكار الصلاة» — the adhkar after this fard: DHIKR, so teal (not a gold
 * prayer pill, not the mosque tag), with a star node that fills once said.
 * `onRead` adds a joined «اقرأ» half that opens the reader for this prayer.
 */
export function AdhkarChip({ done, onClick, onRead }: { done: boolean; onClick: () => void; onRead?: () => void }) {
  return (
    <span
      className={[
        'inline-flex items-stretch rounded-full ring-1 overflow-hidden transition-colors',
        done ? 'bg-teal/12 ring-teal/35' : 'bg-teal/[0.04] ring-teal/25',
      ].join(' ')}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={onClick}
        aria-pressed={done}
        aria-label={done ? 'قلتَ أذكار الصلاة، اضغط للإلغاء' : 'قلتُ أذكار الصلاة'}
        className={[
          'inline-flex items-center gap-1.5 min-h-8 ps-1.5 pe-2.5 text-[11.5px] font-semibold',
          done ? 'text-teal dark:text-teal-light' : 'text-text-secondary dark:text-text-on-dark/80',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'w-[18px] h-[18px] rounded-full inline-flex items-center justify-center shrink-0',
            done ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'bg-teal/12 text-teal dark:text-teal-light',
          ].join(' ')}
        >
          {done ? <Check size={11} strokeWidth={3.5} /> : <Sparkles size={10} />}
        </span>
        <span>أذكار الصلاة</span>
      </motion.button>
      {onRead ? (
        <button
          type="button"
          onClick={onRead}
          aria-label="اقرأ أذكار ما بعد هذه الصلاة"
          className="min-h-8 px-2 inline-flex items-center gap-1 border-s border-teal/20 text-[11px] font-bold text-teal dark:text-teal-light hover:bg-teal/10 transition-colors"
        >
          <BookOpenText size={13} aria-hidden /> اقرأ
        </button>
      ) : null}
    </span>
  );
}

/** The sunnah / adhkar / mosque chips under one fard (shared by today's timeline and the day sheet). */
export function PrayerExtras({
  dateKey,
  prayer,
  male,
  onToggle,
  onRead,
  showAdhkar = true,
}: {
  dateKey: string;
  prayer: PrayerName;
  male: boolean;
  onToggle: (t: PrayerCheckType) => void;
  /** Open this prayer's أذكار in the reader (today only). */
  onRead?: () => void;
  /** Off on an excused day — no prayer to follow. */
  showAdhkar?: boolean;
}) {
  const entry = usePrayerLogStore((s) => s.log[dateKey]?.[prayer]);
  // Friday's Jumu'ah (men): no قبلية, four after.
  const meta = sunnahRakaatOn(prayer, dateKey, male);
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {meta.before > 0 ? (
        <SunnahChip label={`القبلية ${rakaat(meta.before)}`} done={!!entry?.sunnahBefore} onClick={() => onToggle('sunnahBefore')} />
      ) : null}
      {meta.after > 0 ? (
        <SunnahChip label={`البعدية ${rakaat(meta.after)}`} done={!!entry?.sunnahAfter} onClick={() => onToggle('sunnahAfter')} />
      ) : null}
      {showAdhkar ? <AdhkarChip done={!!entry?.adhkar} onClick={() => onToggle('adhkar')} onRead={onRead} /> : null}
      {male ? (
        <span className="ms-auto">
          <MosqueChip done={!!entry?.mosque} onClick={() => onToggle('mosque')} />
        </span>
      ) : showAdhkar ? (
        <span className="ms-auto">
          <OnTimeChip done={!!entry?.onTime} onClick={() => onToggle('onTime')} />
        </span>
      ) : null}
    </div>
  );
}

/** Log or fix any past day: five fard, their sunnah, the mosque (men) or an excused day (women). */
export function PrayerDaySheet({ dateKey, onClose }: { dateKey: string | null; onClose: () => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const day = usePrayerLogStore((s) => (dateKey ? s.log[dateKey] : undefined));
  const excused = usePrayerLogStore((s) => (dateKey ? !!s.excused[dateKey] : false));
  const duhaRakaat = usePrayerLogStore((s) => (dateKey ? duhaRakaatOf(s.duha[dateKey]) : 0));
  const duha = duhaRakaat > 0;
  const male = gender === 'male';
  if (!dateKey) return null;
  const n = fardCountOf(day);
  const st = usePrayerLogStore.getState();
  const toggle = (p: PrayerName, t: PrayerCheckType) => {
    st.togglePrayer(dateKey, p, t);
    void hapticsService.selection();
  };

  return (
    <BottomSheet open onClose={onClose} title={`صلوات ${dayTitle(dateKey)}`}>
      <div className="flex flex-col gap-4">
        {gender === 'female' ? (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-gold/10 px-3.5 py-3">
            <div>
              <p className="font-semibold text-text-primary dark:text-text-on-dark">يوم عذر شرعي</p>
              <p className="text-[11px] text-text-muted">لا يُحتسب في الإحصاءات ولا يقطع السلسلة</p>
            </div>
            <Toggle checked={excused} onChange={(on) => st.setExcused(dateKey, on)} size="sm" label="يوم عذر شرعي" hideLabel />
          </div>
        ) : null}

        {excused ? (
          <p className="text-center text-sm text-text-muted py-4">رفع الله عنكِ الحرج، وكتب لكِ أجر ما كنتِ تعملين.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {PRAYERS_ORDER.map((p) => {
                const done = !!day?.[p]?.fard;
                return (
                  <li key={p} className="py-2.5 flex items-start gap-3">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.88 }}
                      onClick={() => toggle(p, 'fard')}
                      aria-pressed={done}
                      aria-label={`${prayerName(p, dateKey, male)}: ${done ? 'مؤدّاة، اضغط للإلغاء' : 'اضغط لتسجيلها'}`}
                      className={[
                        'w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 transition-colors',
                        done
                          ? 'bg-[image:var(--gradient-teal)] text-on-accent'
                          : 'ring-2 ring-black/[0.08] dark:ring-white/[0.1] text-text-muted hover:ring-teal/50',
                      ].join(' ')}
                    >
                      <Check size={18} strokeWidth={done ? 3 : 2} />
                    </motion.button>
                    <div className="flex-1 min-w-0 pt-2">
                      <p className={['font-display font-bold text-[16px] leading-tight', done ? 'text-teal dark:text-teal-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
                        {prayerName(p, dateKey, male)}
                      </p>
                      <PrayerExtras dateKey={dateKey} prayer={p} male={male} onToggle={(t) => toggle(p, t)} />
                      {p === 'fajr' ? (
                        <div className="mt-1.5 flex flex-col items-start gap-1.5">
                          <SunnahChip
                            label="صلاة الضحى (نافلة)"
                            done={duha}
                            onClick={() => {
                              st.setDuha(dateKey, !duha);
                              void hapticsService.selection();
                            }}
                          />
                          {duha ? (
                            <DuhaRakaatPicker
                              value={duhaRakaat}
                              onPick={(n) => {
                                st.setDuha(dateKey, true, n);
                                void hapticsService.selection();
                              }}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button
              variant={n === 5 ? 'ghost' : 'primary'}
              fullWidth
              haptic="medium"
              onClick={() => st.setAllFard(dateKey, n !== 5)}
            >
              {n === 5 ? 'إلغاء تسجيل الفروض' : 'صلّيتُ الفروض الخمسة كلها'}
            </Button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
