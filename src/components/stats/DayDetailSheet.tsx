import { useMemo, type ReactNode } from 'react';
import {
  Target,
  Sparkles,
  Hand,
  BookOpen,
  Sunrise,
  Utensils,
  Moon,
  Star,
  HandCoins,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useActivityLogStore, type ActivityDomain, type ActivityEvent } from '@/store/activityLogStore';
import { useTargetsStore, TARGET_UNIT_LABEL } from '@/store/targetsStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useQuranStore } from '@/store/quranStore';
import { useProgressStore } from '@/store/progressStore';
import { useSadaqahStore } from '@/store/sadaqahStore';
import { useQiyamStore } from '@/store/qiyamStore';
import { toArabicDigits, WEEKDAY_LABELS_AR, ARABIC_MONTHS, arabicClock } from '@/services/statsService';
import type { PrayerName } from '@/types';

interface DayDetailSheetProps {
  /** The day to inspect, or null to close the sheet. */
  dateKey: string | null;
  onClose: () => void;
}

const DOMAIN_META: Record<ActivityDomain, { label: string; color: string; Icon: LucideIcon }> = {
  awrad: { label: 'الأوراد', color: 'var(--color-teal)', Icon: Target },
  dhikr: { label: 'الأذكار', color: 'var(--color-gold)', Icon: Sparkles },
  tasbih: { label: 'التسبيح', color: 'var(--color-gold-dark)', Icon: Hand },
  quran: { label: 'القرآن', color: 'var(--color-teal-light)', Icon: BookOpen },
  prayer: { label: 'الصلاة', color: 'var(--color-teal)', Icon: Sunrise },
  fasting: { label: 'الصيام', color: 'var(--color-teal-dark)', Icon: Utensils },
  habit: { label: 'العادات', color: 'var(--color-gold)', Icon: Star },
  sadaqah: { label: 'الصدقة', color: 'var(--color-gold-dark)', Icon: HandCoins },
  qiyam: { label: 'قيام الليل', color: 'var(--color-teal-light)', Icon: Moon },
};

const WIRD_UNIT_LABEL: Record<string, string> = {
  page: 'صفحة',
  ayat: 'آية',
  juz: 'جزء',
  hizb: 'حزب',
  surah: 'سورة',
};

const PRAYERS_ORDER: PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABEL: Record<PrayerName, string> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

/** "الخميس ٢٥ يوليو ٢٠٢٦" from a yyyy-MM-dd key (parsed at noon → no TZ drift). */
function fullArabicDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${WEEKDAY_LABELS_AR[d.getDay()]} ${toArabicDigits(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicDigits(d.getFullYear())}`;
}


function SummaryCard({
  icon,
  color,
  title,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-inner)] bg-cream-dark/40 dark:bg-dark-surface ring-1 ring-black/[0.03] dark:ring-white/[0.05] p-3.5 flex flex-col gap-2.5">
      <header className="flex items-center gap-2" style={{ color }}>
        <span className="shrink-0">{icon}</span>
        <h3 className="text-sm font-bold">{title}</h3>
      </header>
      {children}
    </section>
  );
}

export function DayDetailSheet({ dateKey, onClose }: DayDetailSheetProps) {
  const events = useActivityLogStore((s) => s.events);
  const history = useTargetsStore((s) => s.history);
  const prayerLog = usePrayerLogStore((s) => s.log);
  const wirdHistory = useQuranStore((s) => s.wirdHistory);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const sadaqahEntries = useSadaqahStore((s) => s.entries);
  const qiyamNight = useQiyamStore((s) => (dateKey ? s.nights[dateKey] : undefined));

  const dayEvents = useMemo<ActivityEvent[]>(() => {
    if (!dateKey) return [];
    return events.filter((e) => e.dateKey === dateKey).sort((a, b) => a.ts - b.ts);
  }, [events, dateKey]);

  const awrad = useMemo(() => {
    if (!dateKey) return [];
    // endedAt is epoch ms — bucket by LOCAL day to match how dateKeys are built.
    return history.filter((r) => localDateKey(r.endedAt) === dateKey);
  }, [history, dateKey]);

  const prayers = dateKey ? prayerLog[dateKey] : undefined;
  const fardCount = prayers
    ? PRAYERS_ORDER.reduce((a, p) => a + (prayers[p]?.fard ? 1 : 0), 0)
    : 0;
  const sunnahCount = prayers
    ? PRAYERS_ORDER.reduce((a, p) => {
        const e = prayers[p];
        return a + (e?.sunnahBefore ? 1 : 0) + (e?.sunnahAfter ? 1 : 0) + (e?.witr ? 1 : 0);
      }, 0)
    : 0;

  const wird = dateKey ? wirdHistory[dateKey] : undefined;
  const day = dateKey ? dailyProgress[dateKey] : undefined;
  const modDone = (id: string) => day?.modules.find((m) => m.moduleId === id)?.completed ?? false;
  const sadaqahToday = useMemo(
    () => (dateKey ? sadaqahEntries.filter((e) => e.date === dateKey) : []),
    [sadaqahEntries, dateKey],
  );

  const hasSummary =
    awrad.length > 0 || fardCount > 0 || !!wird || modDone('dhikr') || modDone('fasting') ||
    modDone('qiyam') || sadaqahToday.length > 0 || !!qiyamNight;

  const totalActions = dayEvents.length;

  return (
    <BottomSheet open={!!dateKey} onClose={onClose} title={dateKey ? fullArabicDate(dateKey) : undefined}>
      {!dateKey ? null : (
        <div className="flex flex-col gap-4">
          {/* Headline count */}
          <p className="text-[12px] text-text-muted -mt-1">
            {totalActions > 0
              ? `${toArabicDigits(totalActions)} نشاطاً مُسجَّلاً بالوقت`
              : hasSummary
                ? 'ملخّص اليوم من سجلّاتك'
                : 'لا يوجد نشاط مُسجَّل في هذا اليوم'}
          </p>

          {/* ── Precise timeline (from the activity log) ─────────────────── */}
          {dayEvents.length > 0 ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-teal dark:text-teal-light">
                <Clock size={16} />
                <h3 className="text-sm font-bold">الخط الزمني</h3>
              </div>
              <div className="flex flex-col gap-1.5 ps-1 border-s-2 border-teal/12 dark:border-dark-border">
                {dayEvents.map((ev) => {
                  const meta = DOMAIN_META[ev.domain];
                  const { Icon } = meta;
                  return (
                    <div key={ev.id} className="flex items-start gap-2.5 ps-3 relative">
                      <span
                        className="absolute -start-[7px] top-2 w-3 h-3 rounded-full border-2 border-white dark:border-dark-surface"
                        style={{ background: meta.color }}
                      />
                      <span className="shrink-0 mt-1.5" style={{ color: meta.color }}>
                        <Icon size={15} />
                      </span>
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">
                            {ev.title}
                          </p>
                          <span className="shrink-0 text-[10px] font-counter text-text-muted tabular-nums">
                            {arabicClock(ev.ts)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {ev.detail ? (
                            <p className="text-[11px] text-text-muted truncate max-w-[60%]">{ev.detail}</p>
                          ) : null}
                          <span className="text-[11px] font-counter font-bold" style={{ color: meta.color }}>
                            {ev.kind === 'complete' && ev.amount <= 1
                              ? 'تمّت'
                              : `×${toArabicDigits(ev.amount)}${ev.unit ? ` ${ev.unit}` : ''}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ── Summary from daily records (covers days before logging) ──── */}
          {hasSummary ? (
            <div className="flex flex-col gap-3">
              {fardCount > 0 ? (
                <SummaryCard icon={<Sunrise size={16} />} color={DOMAIN_META.prayer.color} title="الصلوات">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRAYERS_ORDER.map((p) => {
                      const done = !!prayers?.[p]?.fard;
                      return (
                        <span
                          key={p}
                          className={[
                            'text-[11px] font-semibold rounded-full px-2 py-1',
                            done
                              ? 'bg-teal/12 text-teal dark:text-teal-light'
                              : 'bg-cream-dark dark:bg-dark-card text-text-muted',
                          ].join(' ')}
                        >
                          {PRAYER_LABEL[p]}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    <span className="font-counter">{toArabicDigits(fardCount)}/{toArabicDigits(5)}</span> فرائض
                    {sunnahCount > 0 ? ` · ${toArabicDigits(sunnahCount)} سنن` : ''}
                  </p>
                </SummaryCard>
              ) : null}

              {awrad.length > 0 ? (
                <SummaryCard icon={<Target size={16} />} color={DOMAIN_META.awrad.color} title="الأوراد">
                  <div className="flex flex-col gap-2">
                    {awrad.map((r, i) => {
                      const total = r.done + r.extra;
                      const pct = r.goal > 0 ? Math.min(100, Math.round((r.done / r.goal) * 100)) : 0;
                      return (
                        <div key={`${r.targetId}-${i}`} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-text-primary dark:text-text-on-dark truncate flex items-center gap-1">
                              {r.completed ? (
                                <CheckCircle2 size={13} className="text-gold-dark dark:text-gold-light shrink-0" />
                              ) : null}
                              {r.title}
                            </span>
                            <span className="text-[11px] font-counter text-text-muted shrink-0">
                              {toArabicDigits(total)} / {toArabicDigits(r.goal)} {TARGET_UNIT_LABEL[r.unit]}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-cream-dark dark:bg-dark-card overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: r.completed ? 'var(--color-gold)' : 'var(--color-teal)' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SummaryCard>
              ) : null}

              {wird && wird.achieved > 0 ? (
                <SummaryCard icon={<BookOpen size={16} />} color={DOMAIN_META.quran.color} title="وِرد القرآن">
                  <p className="text-xs text-text-secondary dark:text-text-on-dark/80 font-counter">
                    {toArabicDigits(wird.achieved)}
                    {wird.amount > 0 ? ` / ${toArabicDigits(wird.amount)}` : ''}{' '}
                    {WIRD_UNIT_LABEL[wird.unit] ?? ''}
                    {wird.amount > 0 && wird.achieved >= wird.amount ? ' · اكتمل الورد' : ''}
                  </p>
                </SummaryCard>
              ) : null}

              {modDone('dhikr') || modDone('fasting') || modDone('qiyam') ? (
                <SummaryCard icon={<Sparkles size={16} />} color={DOMAIN_META.dhikr.color} title="عبادات اليوم">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {modDone('dhikr') ? <DoneChip icon={<Sparkles size={12} />} label="أذكار مكتملة" /> : null}
                    {modDone('qiyam') ? <DoneChip icon={<Moon size={12} />} label="قيام الليل" /> : null}
                    {modDone('fasting') ? <DoneChip icon={<Utensils size={12} />} label="صيام" /> : null}
                  </div>
                </SummaryCard>
              ) : null}

              {qiyamNight ? (
                <SummaryCard icon={<Moon size={16} />} color={DOMAIN_META.qiyam.color} title="قيام الليل">
                  <p className="text-xs text-text-secondary dark:text-text-on-dark/80 font-counter">
                    {qiyamNight.rakaat > 0 ? `${toArabicDigits(qiyamNight.rakaat)} ركعات` : 'سُجّل القيام'}
                    {qiyamNight.witr ? ' · مع الوتر' : ''}
                    {qiyamNight.minutes ? ` · ${toArabicDigits(qiyamNight.minutes)} دقيقة` : ''}
                    {' · '}سُجّل {arabicClock(qiyamNight.loggedAt)}
                  </p>
                </SummaryCard>
              ) : null}

              {sadaqahToday.length > 0 ? (
                <SummaryCard icon={<HandCoins size={16} />} color={DOMAIN_META.sadaqah.color} title="الصدقة">
                  <div className="flex flex-col gap-1">
                    {sadaqahToday.map((e) => (
                      <p key={e.id} className="text-xs text-text-secondary dark:text-text-on-dark/80">
                        <span className="font-counter font-semibold">{toArabicDigits(e.amount)}</span> {e.currency}
                        {e.cause ? ` · ${e.cause}` : ''}
                      </p>
                    ))}
                  </div>
                </SummaryCard>
              ) : null}
            </div>
          ) : null}

          {totalActions === 0 && !hasSummary ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-teal/8 dark:bg-dark-border grid place-items-center text-teal dark:text-teal-light">
                <Clock size={22} />
              </div>
              <p className="text-sm text-text-secondary">لم يُسجَّل نشاط في هذا اليوم</p>
              <p className="text-[12px] text-text-muted max-w-[15rem]">
                سجِّل أورادك وأذكارك وصلواتك ليظهر تفصيل يومك هنا بالوقت والعدد.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}

function DoneChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-1 bg-teal/12 text-teal dark:text-teal-light">
      {icon}
      {label}
    </span>
  );
}

/** Local (not UTC) yyyy-MM-dd for an epoch — matches how dateKeys are built. */
function localDateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
