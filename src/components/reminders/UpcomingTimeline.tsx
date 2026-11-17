import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlarmClock, Bell, BookOpen, CalendarDays, Clock, GraduationCap, HandHeart, ListChecks, Moon, MoonStar, Quote, RefreshCw,
  Sparkles, Star, Sun, Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { notificationService } from '@/services/NotificationService';
import type { PendingItem } from '@/services/notifications/types';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { toArabicDigits, WEEKDAY_LABELS_AR, dateKeyOf } from '@/services/statsService';
import { useNotificationStore } from '@/store/notificationStore';
import { arCount } from '@/services/insightsEngine';

type Kind = { label: string; Icon: LucideIcon | typeof Mosque; tone: 'teal' | 'gold' };

/** Category of an armed notification, from its stable id. */
function kindOf(n: PendingItem): Kind {
  const id = n.id;
  if (id.startsWith('myzikr_prayer_time')) return { label: 'أذان', Icon: Mosque, tone: 'teal' };
  if (id.startsWith('myzikr_prayer_pre')) return { label: 'قبل الأذان', Icon: AlarmClock, tone: 'teal' };
  if (id.startsWith('myzikr_prayer_iqama')) return { label: 'الإقامة', Icon: Mosque, tone: 'teal' };
  if (id.startsWith('myzikr_snooze')) return { label: 'مؤجَّل', Icon: Clock, tone: 'gold' };
  if (id.includes('qiyam')) return { label: 'قيام الليل', Icon: MoonStar, tone: 'gold' };
  if (id.startsWith('myzikr_smart')) return { label: 'ذكي', Icon: Sparkles, tone: 'gold' };
  if (id.startsWith('myzikr_dhikr.morning')) return { label: 'أذكار', Icon: Sun, tone: 'teal' };
  if (id.startsWith('myzikr_dhikr')) return { label: 'أذكار', Icon: Moon, tone: 'teal' };
  if (id.startsWith('myzikr_quran')) return { label: 'القرآن', Icon: BookOpen, tone: 'teal' };
  if (id.startsWith('myzikr_duaa')) return { label: 'دعاء', Icon: HandHeart, tone: 'teal' };
  if (id.startsWith('myzikr_fast')) return { label: 'صيام', Icon: Moon, tone: 'gold' };
  if (id.startsWith('myzikr_special')) return { label: 'مناسبة', Icon: CalendarDays, tone: 'gold' };
  if (id.startsWith('myzikr_target')) return { label: 'وِرد', Icon: Target, tone: 'teal' };
  if (id.startsWith('myzikr_habits')) return { label: 'عادة', Icon: Star, tone: 'teal' };
  if (id.startsWith('myzikr_study_task')) return { label: 'مهمة', Icon: ListChecks, tone: 'teal' };
  if (id.startsWith('myzikr_study')) return { label: 'درس', Icon: GraduationCap, tone: 'teal' };
  if (id.startsWith('myzikr_insp')) return { label: 'آية وحديث', Icon: Quote, tone: 'gold' };
  return { label: 'تذكير', Icon: Bell, tone: 'teal' };
}

function dayLabel(d: Date, now: Date): string {
  const k = dateKeyOf(d);
  if (k === dateKeyOf(now)) return 'اليوم';
  if (k === dateKeyOf(new Date(now.getTime() + 86_400_000))) return 'غداً';
  const diff = (d.getTime() - now.getTime()) / 86_400_000;
  return diff < 7 ? WEEKDAY_LABELS_AR[d.getDay()] : `${WEEKDAY_LABELS_AR[d.getDay()]} ${toArabicDigits(d.getDate())}/${toArabicDigits(d.getMonth() + 1)}`;
}

/** Live list of pending notifications (Android + desktop); `null` while loading. */
export function usePendingNotifications() {
  const [items, setItems] = useState<PendingItem[] | null>(null);
  const refresh = useCallback(async () => {
    setItems((await notificationService.getPending?.()) ?? []);
  }, []);
  // Settings changes re-arm asynchronously — re-read once the schedulers settle.
  const configs = useNotificationStore((s) => s.configs);
  const extras = useNotificationStore((s) => s.prayerExtras);
  const smart = useNotificationStore((s) => s.smart);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 1800);
    return () => clearTimeout(t);
  }, [refresh, configs, extras, smart]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { items, refresh };
}

/**
 * «القادم» — what the device will actually ring next, read from the OS
 * pending list (not a guess from settings), grouped by day.
 */
export function UpcomingTimeline({
  items,
  onRefresh,
  supported,
}: {
  items: PendingItem[] | null;
  onRefresh: () => void;
  supported: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const now = useMemo(() => new Date(), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (items ?? []).slice(0, expanded ? 40 : 6);

  const groups = useMemo(() => {
    const out: { label: string; rows: PendingItem[] }[] = [];
    for (const n of shown) {
      const label = dayLabel(n.at, now);
      const g = out[out.length - 1];
      if (g && g.label === label) g.rows.push(n);
      else out.push({ label, rows: [n] });
    }
    return out;
  }, [shown, now]);

  if (!supported) {
    return (
      <Card variant="inset" className="p-4">
        <p className="text-xs text-text-muted leading-relaxed text-pretty">
          تصل التنبيهات على تطبيق أندرويد وتطبيق سطح المكتب، وتظهر هنا مواعيدها القادمة.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-1.5">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <p className="flex-1 text-[11px] text-text-muted">
          {items === null
            ? 'جارٍ القراءة من الجهاز…'
            : items.length === 0
              ? 'لا شيء مجدول الآن'
              : `مجدول على جهازك: ${arCount(items.length, 'تنبيه واحد', 'تنبيهان', 'تنبيهات', 'تنبيهاً')}`}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="تحديث القائمة"
          className="w-9 h-9 -me-1 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-teal hover:bg-teal/5"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {items && items.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-text-secondary dark:text-text-on-dark/70 leading-relaxed text-pretty">
          فعّل تذكيراً من الأقسام أدناه وسيظهر موعده هنا. إن كانت التنبيهات مفعّلة ولم يظهر شيء، افتح التطبيق مرة
          أخرى ليُعاد جدولتها.
        </p>
      ) : null}

      {groups.map((g) => (
        <div key={g.label} className="px-1.5 pb-1">
          <p className="px-1.5 pt-2 pb-1 text-[11px] font-bold text-gold-dark dark:text-gold-light">{g.label}</p>
          <ol className="relative">
            {g.rows.map((n, i) => {
              const k = kindOf(n);
              return (
                <li key={`${n.id}-${i}`} className="flex items-center gap-3 rounded-[var(--radius-inner)] px-1.5 py-2">
                  <span className="w-[4.25rem] shrink-0 text-end font-counter tabular-nums text-[13px] font-bold text-text-primary dark:text-text-on-dark">
                    {toArabicDigits(formatPrayerTime(n.at))}
                  </span>
                  <span
                    className={[
                      'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
                      k.tone === 'gold'
                        ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                        : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light',
                    ].join(' ')}
                  >
                    <k.Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark truncate">
                      {n.title}
                    </span>
                    <span className="block text-[11px] text-text-muted truncate">
                      {k.label}
                      {n.repeat === 'daily' ? ' · يومياً' : n.repeat === 'weekly' ? ' · أسبوعياً' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      {items && items.length > 6 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full min-h-11 rounded-[var(--radius-inner)] text-xs font-bold text-teal dark:text-teal-light hover:bg-teal/5"
        >
          {expanded ? 'عرض أقل' : `عرض الكل (${toArabicDigits(Math.min(items.length, 40))})`}
        </button>
      ) : null}
    </Card>
  );
}
