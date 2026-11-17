import { useEffect, useState } from 'react';
import { BellRing, Moon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useInspirationStore, type InspirationInterval, type InspirationMix } from '@/store/inspirationStore';
import { getSmartPrefs } from '@/store/notificationStore';
import { notificationService } from '@/services/NotificationService';
import { rescheduleInspiration, sendInspirationTest, notificationTitle, type PlannedSlot } from '@/services/inspirationReminders';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

export const INTERVAL_LABELS: Record<InspirationInterval, string> = {
  h2: 'كل ساعتين',
  h3: 'كل ٣ ساعات',
  h6: 'كل ٦ ساعات',
  twice: 'مرتين يومياً',
  daily: 'مرة يومياً',
};

const MIX: { id: InspirationMix; label: string }[] = [
  { id: 'both', label: 'آيات وأحاديث' },
  { id: 'ayat', label: 'آيات' },
  { id: 'hadith', label: 'أحاديث' },
];

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** «الجمعة ٩:٠٠ ص» — 12-hour Arabic clock with a weekday when not today. */
const clock12 = (h: number, m: number) =>
  `${toArabicDigits(h % 12 || 12)}:${toArabicDigits(String(m).padStart(2, '0'))} ${h < 12 ? 'ص' : 'م'}`;
const hhmm12 = (s: string) => clock12(Number(s.slice(0, 2)), Number(s.slice(3, 5)));

export function slotLabel(at: Date, now = new Date()): string {
  const clock = clock12(at.getHours(), at.getMinutes());
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? 'اليوم' : days === 1 ? 'غداً' : WEEKDAYS[at.getDay()];
  return `${day} ${clock}`;
}

const chip = (active: boolean) =>
  [
    'min-h-10 rounded-xl px-3 text-xs font-bold transition-colors',
    active
      ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
      : 'text-text-muted',
  ].join(' ');

const timeInput =
  'rounded-xl bg-cream-dark/55 dark:bg-dark-surface px-3 py-2 text-sm font-counter tabular-nums text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40';

/**
 * Settings for the «آية وحديث» notifications: toggle, interval, active window,
 * content mix, day-awareness, a preview of what's coming, and a test send.
 * Self-contained — every change re-plans the rolling horizon.
 */
export function InspirationSettings() {
  const s = useInspirationStore((st) => st.settings);
  const setSettings = useInspirationStore((st) => st.setSettings);
  const [upcoming, setUpcoming] = useState<PlannedSlot[]>([]);
  const quiet = getSmartPrefs();

  // Re-plan (debounced) whenever a setting changes; the result doubles as the preview.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      rescheduleInspiration()
        .then((plan) => !cancelled && setUpcoming(plan.slice(0, 3)))
        .catch(() => undefined);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [s]);

  const toggle = async (on: boolean) => {
    if (on && notificationService.isAvailable() && !(await notificationService.requestPermission())) {
      toast.error('فعّل إذن الإشعارات أولاً');
      return;
    }
    setSettings({ enabled: on });
  };

  const test = async () => {
    void hapticsService.impact('light');
    const ok = await sendInspirationTest();
    if (ok) toast.success('ستصلك آية أو حديث خلال ثوانٍ');
    else toast.info('الإشعارات متاحة على الهاتف فقط');
  };

  return (
    <div className="flex flex-col gap-4">
      <Card variant="plain" className="p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <BellRing size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">آية وحديث في إشعار</p>
          <p className="text-xs text-text-muted mt-0.5 text-pretty">تصلك آية أو حديث صحيح تلقائياً، وما يناسب اليوم في المناسبات</p>
        </div>
        <Toggle checked={s.enabled} onChange={(v) => void toggle(v)} label="تفعيل آية وحديث" hideLabel />
      </Card>

      {s.enabled ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="px-1 text-xs font-bold text-text-secondary dark:text-text-on-dark/80">كم مرة؟</p>
            <div className="flex flex-wrap gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="radiogroup" aria-label="التكرار">
              {(Object.keys(INTERVAL_LABELS) as InspirationInterval[]).map((id) => (
                <button key={id} type="button" role="radio" aria-checked={s.interval === id} onClick={() => setSettings({ interval: id })} className={chip(s.interval === id)}>
                  {INTERVAL_LABELS[id]}
                </button>
              ))}
            </div>
          </div>

          {s.interval === 'daily' ? (
            <label className="flex items-center justify-between gap-3 px-1">
              <span className="text-sm text-text-secondary dark:text-text-on-dark">الوقت</span>
              <input type="time" dir="ltr" value={s.dailyTime} onChange={(e) => e.target.value && setSettings({ dailyTime: e.target.value })} className={timeInput} />
            </label>
          ) : (
            <div className="flex flex-col gap-2 px-1">
              <p className="text-xs font-bold text-text-secondary dark:text-text-on-dark/80">بين الساعتين</p>
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-text-muted">من</span>
                  <input type="time" dir="ltr" value={s.windowStart} onChange={(e) => e.target.value && setSettings({ windowStart: e.target.value })} className={timeInput} aria-label="بداية الفترة" />
                </label>
                <label className="flex-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-text-muted">إلى</span>
                  <input type="time" dir="ltr" value={s.windowEnd} onChange={(e) => e.target.value && setSettings({ windowEnd: e.target.value })} className={timeInput} aria-label="نهاية الفترة" />
                </label>
              </div>
              {quiet.quietEnabled ? (
                <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Moon size={12} className="shrink-0" />
                  لا تصل في ساعات الهدوء، من {hhmm12(quiet.quietStart)} إلى {hhmm12(quiet.quietEnd)}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="px-1 text-xs font-bold text-text-secondary dark:text-text-on-dark/80">المحتوى</p>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="radiogroup" aria-label="المحتوى">
              {MIX.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={s.mix === m.id} onClick={() => setSettings({ mix: m.id })} className={chip(s.mix === m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-sm text-text-primary dark:text-text-on-dark">ما يناسب اليوم</p>
              <p className="text-[11px] text-text-muted text-pretty">الجمعة ورمضان وعشر ذي الحجة وعاشوراء وأيام الصيام</p>
            </div>
            <Toggle checked={s.dayAware} onChange={(v) => setSettings({ dayAware: v })} label="ما يناسب اليوم" hideLabel size="sm" />
          </div>

          {upcoming.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="px-1 text-xs font-bold text-text-secondary dark:text-text-on-dark/80">القادم</p>
              <Card variant="plain" className="p-1.5">
                {upcoming.map((p, i) => (
                  <div key={p.id} className={['px-3 py-2.5', i ? 'border-t border-black/[0.05] dark:border-white/[0.06]' : ''].join(' ')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-teal dark:text-teal-light">{notificationTitle(p.item, p.label)}</span>
                      <span className="text-[11px] text-text-muted font-counter tabular-nums">{slotLabel(p.at)}</span>
                    </div>
                    <p className={['mt-1 text-sm text-text-secondary dark:text-text-on-dark/80 line-clamp-2', p.item.kind === 'ayah' ? 'font-quran' : ''].join(' ')}>
                      {p.item.text}
                    </p>
                  </div>
                ))}
              </Card>
            </div>
          ) : null}

          <Button variant="secondary" size="sm" haptic="light" onClick={() => void test()}>
            أرسل إشعاراً تجريبياً
          </Button>
        </>
      ) : null}
    </div>
  );
}
