import { useMemo, useState } from 'react';
import { Moon, Check, Undo2, Flame, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { useProgressStore } from '@/store/progressStore';
import { useStreak } from '@/hooks/useStreak';
import { useI18n } from '@/hooks/useI18n';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { arSA } from 'date-fns/locale';

const WEEKDAYS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

/** Today's Hijri day + month, offline via the Umm al-Qura calendar. */
function hijriToday(d: Date): { day: number; month: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric' }).formatToParts(d);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    return Number.isFinite(day) && Number.isFinite(month) ? { day, month } : null;
  } catch {
    return null;
  }
}

/** The sunnah fast (if any) that today falls on — shown as gentle guidance. */
function sunnahOfToday(d: Date): string | null {
  const h = hijriToday(d);
  if (h) {
    if (h.month === 9) return 'شهر رمضان المبارك';
    if (h.month === 12 && h.day === 9) return 'يوم عرفة، يكفّر السنة الماضية والباقية';
    if (h.month === 1 && (h.day === 9 || h.day === 10)) return 'تاسوعاء وعاشوراء';
    if (h.day >= 13 && h.day <= 15) return 'من الأيام البيض';
    if (h.month === 10 && h.day > 1) return 'من ستّ شوال';
  }
  const wd = d.getDay();
  if (wd === 1) return 'يوم الإثنين، يُسنّ صيامه';
  if (wd === 4) return 'يوم الخميس، يُسنّ صيامه';
  return null;
}

/**
 * Fasting: log today's fast (with undo), the sunnah fast today falls on, and
 * this month at a glance.
 */
export function FastingModule() {
  const { t } = useI18n();
  const markModuleComplete = useProgressStore((s) => s.markModuleComplete);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const { currentStreak } = useStreak('fasting');
  const [blessing, setBlessing] = useState(false);

  const today = new Date();
  const todayKey = format(today, 'yyyy-MM-dd');
  const fasted = (key: string) =>
    dailyProgress[key]?.modules?.some((m) => m.moduleId === 'fasting' && m.completed) ?? false;
  const isFastingToday = fasted(todayKey);

  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = getDaysInMonth(today);
  const firstDayOfWeek = getDay(startOfMonth(today));
  const monthDays = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => format(new Date(year, month, i + 1), 'yyyy-MM-dd')),
    [daysInMonth, year, month],
  );
  const monthFasts = monthDays.filter(fasted).length;
  const sunnah = sunnahOfToday(today);

  const handleRecord = () => {
    markModuleComplete('fasting', 1);
    void hapticsService.notify('success');
    setBlessing(true);
    toast.success('تقبّل الله صيامك');
  };

  const handleUndo = () => {
    useProgressStore.getState().unmarkModuleComplete('fasting');
    void hapticsService.impact('medium');
    toast.info('تم إلغاء تسجيل الصيام');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ─────────────────────────────────────── */}
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="flex items-center gap-4">
          <Medallion size={68} tone={isFastingToday ? 'teal' : 'gold'}>
            {isFastingToday ? (
              <Check size={26} strokeWidth={3} className="text-teal dark:text-teal-light" />
            ) : (
              <Moon size={24} className="text-gold-dark dark:text-gold-light" />
            )}
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">{toArabicDigits(format(today, 'EEEE، d MMMM', { locale: arSA }))}</p>
            <p className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark mt-0.5">
              {isFastingToday ? t('fasting_today') : 'هل أنت صائم اليوم؟'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 text-gold-dark dark:text-gold-light text-[11px] font-bold">
                <Moon size={11} /> {toArabicDigits(monthFasts)} هذا الشهر
              </span>
              {currentStreak > 1 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal/10 text-teal dark:text-teal-light text-[11px] font-bold">
                  <Flame size={11} /> {toArabicDigits(currentStreak)} {currentStreak <= 10 ? 'أيام متتالية' : 'يوماً متتالياً'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-4">
          {isFastingToday ? (
            <Button variant="ghost" fullWidth leftIcon={<Undo2 size={15} />} onClick={handleUndo} haptic="medium">
              إلغاء تسجيل صيام اليوم
            </Button>
          ) : (
            <Button variant="primary" fullWidth leftIcon={<Moon size={16} />} onClick={handleRecord} haptic="medium">
              سجّل صيام اليوم
            </Button>
          )}
        </div>
      </Card>

      {/* ── Today's sunnah ───────────────────────────── */}
      {sunnah ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/25 px-3.5 py-3">
          <Sparkles size={17} className="text-gold-dark dark:text-gold-light shrink-0" />
          <p className="text-sm text-text-primary dark:text-text-on-dark">
            <span className="font-bold">اليوم: </span>
            {sunnah}
          </p>
        </div>
      ) : null}

      {/* ── This month ───────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title={toArabicDigits(format(today, 'MMMM yyyy', { locale: arSA }))}
          subtitle={monthFasts > 0 ? `صمت ${toArabicDigits(monthFasts)} من ${toArabicDigits(daysInMonth)} يوماً` : 'لم تسجّل صياماً هذا الشهر بعد'}
        />
        <Card className="p-4">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-center text-[10.5px] text-text-muted font-bold pb-1">
                {d}
              </span>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {monthDays.map((key, i) => {
              const hasFast = fasted(key);
              const isToday = key === todayKey;
              const future = key > todayKey;
              return (
                <div
                  key={key}
                  aria-label={`${toArabicDigits(i + 1)}${hasFast ? '، صائم' : ''}`}
                  className={[
                    'aspect-square flex items-center justify-center text-xs rounded-xl font-counter tabular-nums',
                    hasFast
                      ? 'bg-[image:var(--gradient-teal)] text-on-accent font-bold shadow-[var(--shadow-xs)]'
                      : future
                        ? 'text-text-muted/60'
                        : 'bg-cream-dark/45 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/70',
                    isToday ? 'ring-2 ring-gold ring-offset-2 ring-offset-white dark:ring-offset-dark-card' : '',
                  ].join(' ')}
                >
                  {toArabicDigits(i + 1)}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <CompletionBlessing open={blessing} message="تقبّل الله صيامك" onDone={() => setBlessing(false)} />
    </div>
  );
}
