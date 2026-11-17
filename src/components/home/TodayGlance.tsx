import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { format } from 'date-fns';
import { Mosque } from '@/components/icons/Mosque';
import { Sparkles, BookOpen, Star, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useProgressStore } from '@/store/progressStore';
import { useQuranStore } from '@/store/quranStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTargetsStore } from '@/store/targetsStore';
import { toArabicDigits } from '@/utils/arabicFormat';

interface Metric {
  key: string;
  label: string;
  pct: number;
  detail: string;
  Icon: LucideIcon | typeof Mosque;
  to: string;
}

/**
 * ملخّص اليوم — a compact "today at a glance" strip that opens the Home page:
 * an overall completion headline plus up to four mini rings (prayers, adhkar,
 * wird, habits/awrad) that adapt to what the user actually tracks. Each ring is
 * a shortcut into its section. Complements — doesn't duplicate — the detailed
 * وردك اليوم checklist below it, and never repeats a bottom-nav destination as
 * a competing button (it's a progress read-out, tapped only to jump in).
 */
export function TodayGlance() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const fardCount = usePrayerLogStore((s) => s.getFardCount(today));
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const wird = useQuranStore((s) => s.wird);
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const customHabits = useSettingsStore((s) => s.customHabits);
  const targets = useTargetsStore((s) => s.targets);

  const metrics = useMemo<Metric[]>(() => {
    const day = dailyProgress[today];
    const out: Metric[] = [];

    // Prayers — always shown; the anchor of the day.
    out.push({
      key: 'prayers',
      label: 'الصلاة',
      pct: Math.round((fardCount / 5) * 100),
      detail: `${toArabicDigits(fardCount)}/${toArabicDigits(5)}`,
      Icon: Mosque,
      to: '/module/prayers',
    });

    // Adhkar — daily goal; completion rate from the progress store.
    const dhikrRate = day?.modules.find((m) => m.moduleId === 'dhikr')?.completionRate ?? 0;
    out.push({
      key: 'dhikr',
      label: 'الأذكار',
      pct: Math.round(dhikrRate * 100),
      detail: `${toArabicDigits(Math.round(dhikrRate * 100))}٪`,
      Icon: Sparkles,
      to: '/adhkar',
    });

    // Wird — only when a Quran wird is configured.
    if (wird) {
      const entry = wirdHistory[today];
      const ratio = entry && entry.amount > 0 ? Math.min(1, entry.achieved / entry.amount) : 0;
      out.push({
        key: 'wird',
        label: 'وِرد القرآن',
        pct: Math.round(ratio * 100),
        detail: `${toArabicDigits(Math.round(ratio * 100))}٪`,
        Icon: BookOpen,
        to: '/quran',
      });
    }

    // Habits — only when the user has any.
    if (customHabits.length > 0) {
      const done = customHabits.filter(
        (h) => day?.modules.find((m) => m.moduleId === h.id)?.completed,
      ).length;
      out.push({
        key: 'habits',
        label: 'العادات',
        pct: Math.round((done / customHabits.length) * 100),
        detail: `${toArabicDigits(done)}/${toArabicDigits(customHabits.length)}`,
        Icon: Star,
        to: '/habits',
      });
    }

    // Awrad — fill the fourth slot when there's room and active recurring awrad.
    if (out.length < 4) {
      const active = targets.filter((t) => t.recurrence && t.recurrence !== 'none' && !t.completedAt);
      if (active.length > 0) {
        const done = active.filter((t) => t.current >= t.total).length;
        out.push({
          key: 'awrad',
          label: 'الأوراد',
          pct: Math.round((done / active.length) * 100),
          detail: `${toArabicDigits(done)}/${toArabicDigits(active.length)}`,
          Icon: Target,
          to: '/targets',
        });
      }
    }

    return out.slice(0, 4);
  }, [dailyProgress, today, fardCount, wird, wirdHistory, customHabits, targets]);

  const overall = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + Math.min(100, m.pct), 0) / metrics.length)
    : 0;
  const doneCount = metrics.filter((m) => m.pct >= 100).length;
  const message =
    doneCount === metrics.length && metrics.length > 0
      ? 'أتممت عبادات يومك، تقبّل الله منك'
      : overall === 0
        ? 'يومك في أوّله، ابدأ بما تيسّر'
        : `أتممت ${toArabicDigits(doneCount)} من ${toArabicDigits(metrics.length)}، وبقي القليل`;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <span className="relative inline-flex shrink-0">
          <ProgressRing
            value={overall}
            size={64}
            strokeWidth={6}
            showPercent={false}
            colorFrom={overall >= 100 ? 'var(--color-gold)' : 'var(--color-teal)'}
            colorTo={overall >= 100 ? 'var(--color-gold-light)' : 'var(--color-teal-light)'}
          />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-counter font-bold text-teal dark:text-teal-light">
            {toArabicDigits(overall)}٪
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">ملخّص اليوم</h2>
          <p className="mt-0.5 text-xs text-text-muted text-pretty">{message}</p>
        </div>
      </div>

      <div
        className="mt-3.5 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, metrics.length)}, minmax(0, 1fr))` }}
      >
        {metrics.map((m) => {
          const { Icon } = m;
          const complete = m.pct >= 100;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => navigate(m.to)}
              aria-label={`${m.label}: ${m.detail}`}
              className="rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-2 py-2.5 text-start transition-colors hover:bg-teal/8 active:scale-[0.98]"
            >
              <span
                className={[
                  'flex items-center gap-1 text-[11px] font-semibold truncate',
                  complete ? 'text-gold-dark dark:text-gold-light' : 'text-text-secondary dark:text-text-on-dark/80',
                ].join(' ')}
              >
                <Icon size={13} strokeWidth={2} />
                <span className="truncate">{m.label}</span>
              </span>
              <span className="mt-1 block text-[13px] font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark leading-none">
                {m.detail}
              </span>
              <span className="mt-2 block h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                <span
                  className={['block h-full rounded-full', complete ? 'bg-gold' : 'bg-teal'].join(' ')}
                  style={{ width: `${Math.min(100, m.pct)}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
