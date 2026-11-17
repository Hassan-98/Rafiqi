import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from '@/lib/motion';
import { BookOpen, BarChart3, ChevronLeft, Hand, HandHeart, LayoutGrid, Library, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { PrayerHero, PrayerStrip } from '@/components/home/PrayerHero';
import { FeatureSpotlight, FeatureRow } from '@/components/home/FeatureCard';
import { useHomeFeatures } from '@/components/home/useHomeFeatures';
import { daySlot, orderFeatures, type DaySlot } from '@/components/home/dayTime';
import { TodayGlance } from '@/components/home/TodayGlance';
import { CalendarTodayCard } from '@/components/home/CalendarTodayCard';
import { AttentionCard } from '@/components/home/AttentionCard';
import { AchievementsStrip } from '@/components/home/AchievementsStrip';
import { BadgesHomeCard } from '@/components/badges/BadgesHomeCard';
import { LeaderboardHomeCard, StandingChip } from '@/components/leaderboard/LeaderboardCards';
import { StreakRescueCard } from '@/components/home/StreakRescueCard';
import { ReflectionCard } from '@/components/home/ReflectionCard';
import { PrayerStreaksStrip } from '@/components/home/PrayerStreaksStrip';
import { RamadanWidget } from '@/components/ramadan/RamadanWidget';
import { useRamadanState } from '@/hooks/useRamadanState';
import { usePrayerTimes } from '@/hooks/usePrayerTimes';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { reverseGeocode } from '@/services/geocodeService';
import { toArabicDigits } from '@/utils/arabicFormat';

const SPOTLIGHT_HINT: Record<DaySlot, string> = {
  night: 'في هدأة الليل',
  morning: 'بداية يومك',
  midday: 'في وسط النهار',
  evening: 'قبل أن يُطوى يومك',
};

export function HomePage() {
  const navigate = useNavigate();
  const { times, nextPrayer } = usePrayerTimes();
  const userName = useSettingsStore((s) => s.userName);
  const coords = useSettingsStore((s) => s.coords);
  const city = useSettingsStore((s) => s.city);
  const country = useSettingsStore((s) => s.country);
  const setCity = useSettingsStore((s) => s.setCity);
  const setCountry = useSettingsStore((s) => s.setCountry);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const computeOverallStreak = useProgressStore((s) => s.computeOverallStreak);
  const ramadan = useRamadanState();


  useEffect(() => {
    if (!coords || city) return;
    reverseGeocode(coords).then((p) => {
      if (p?.city) setCity(p.city);
      if (p?.country) setCountry(p.country);
    }).catch(() => undefined);
  }, [coords, city, setCity, setCountry]);

  // `usePrayerTimes` ticks every second, so the slot follows the clock.
  const now = new Date();
  const slot = daySlot(now, times);
  const features = useHomeFeatures(slot, times);
  const order = orderFeatures(slot, {
    adhkar: features.adhkar.done || !!features.adhkar.idle,
    duha: features.duha.done || !!features.duha.idle,
    qiyam: features.qiyam.done || !!features.qiyam.idle,
    awrad: features.awrad.done || !!features.awrad.idle,
    quran: features.quran.done || !!features.quran.idle,
  });
  const [spotlight, ...rest] = order.map((k) => features[k]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- dailyProgress is the change trigger
  const streak = useMemo(() => computeOverallStreak(), [dailyProgress, computeOverallStreak]);

  const place = [city, country].filter(Boolean).join('، ');

  const quick: { label: string; Icon: LucideIcon; to: string; badge?: number }[] = [
    { label: 'مصحفي', Icon: BookOpen, to: '/quran' },
    { label: 'التسبيح', Icon: Hand, to: '/tasbih' },
    { label: 'الأدعية', Icon: HandHeart, to: '/duaa-library' },
    { label: 'الحديث', Icon: Library, to: '/sunnah' },
    { label: 'الإحصاء', Icon: BarChart3, to: '/stats' },
    { label: 'المزيد', Icon: LayoutGrid, to: '/more' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-6 px-4 pb-nav"
      style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-muted">السلام عليكم ورحمة الله وبركاته</p>
          <h1 className="mt-0.5 text-[26px] font-display font-bold leading-tight text-text-primary dark:text-text-on-dark truncate">
            {userName || 'أهلاً بك'}
          </h1>
          {place ? (
            <p className="mt-1.5 inline-flex items-center gap-1 min-w-0 text-xs text-text-muted">
              <MapPin size={12} className="text-teal dark:text-teal-light shrink-0" />
              <span className="truncate max-w-[60vw]">{place}</span>
            </p>
          ) : null}
          {/* «الترتيب»: today's place, a crown / medal when it is a good one. */}
          <div className="mt-1.5 empty:hidden flex">
            <StandingChip rank />
          </div>
        </div>
        <HapticPressable
          onClick={() => navigate('/stats')}
          aria-label={`سلسلة العبادة: ${toArabicDigits(streak)} يوماً`}
          className="shrink-0 flex flex-col items-center gap-1 pt-1"
        >
          <Medallion size={54} tone="gold">
            <span className="text-lg text-gold-dark dark:text-gold-light">{toArabicDigits(streak)}</span>
          </Medallion>
          <span className="text-[10.5px] font-semibold text-text-muted leading-none">يوماً متتالياً</span>
        </HapticPressable>
      </header>

      {/* ── Today in the calendar: after the greeting, before the prayers (owner request) ── */}
      <CalendarTodayCard />

      {/* ── Missed, running out, or a sunnah seldom done — only when there is something ── */}
      <AttentionCard times={times} />

      {/* ── Prayers: the anchor of the day ───────────────────── */}
      {ramadan.isActive ? (
        <div className="flex flex-col gap-2.5">
          <RamadanWidget />
          <PrayerStrip times={times} nextPrayer={nextPrayer} />
        </div>
      ) : (
        <PrayerHero times={times} nextPrayer={nextPrayer} />
      )}
      <PrayerStreaksStrip />

      {/* ── «المتنافسون»: today's points, places and first three — up front (owner request) ── */}
      <LeaderboardHomeCard />

      {/* ── A broken streak still inside its week: the recovery offer ── */}
      <StreakRescueCard />

      {/* ── Badges: level, today's combined-day challenge, the closest badge (owner: above the Sunnah) ── */}
      <BadgesHomeCard />

      {/* ── What fits this moment — above the Sunnah (owner request) ────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الآن" subtitle={SPOTLIGHT_HINT[slot]} />
        <FeatureSpotlight view={spotlight} />
      </section>

      {/* ── The Sunnah up front (owner request): hadith of the day + the library ── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="من السنة النبوية"
          subtitle="حديث وآية لكل يوم"
          action={
            <button
              type="button"
              onClick={() => navigate('/sunnah')}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
            >
              مكتبة الحديث <ChevronLeft size={14} />
            </button>
          }
        />
        <ReflectionCard />
      </section>

      {/* ── Prayer badges, records and streak events — up front ── */}
      <AchievementsStrip />



      {/* ── The rest of today's worship, live ────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="عباداتك اليوم" />
        <Card className="p-1.5">
          {rest.map((v, i) => (
            <FeatureRow key={v.key} view={v} first={i === 0} />
          ))}
        </Card>
        <TodayGlance />
      </section>


      {/* ── Everything else, one tap away ────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="وصول سريع" />
        <Card className="p-2 grid grid-cols-3 gap-1">
          {quick.map(({ label, Icon, to, badge }) => (
            <HapticPressable
              key={to}
              onClick={() => navigate(to)}
              className="relative flex flex-col items-center gap-1.5 rounded-[var(--radius-inner)] py-3 hover:bg-teal/5 transition-colors"
            >
              <span className="w-11 h-11 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center">
                <Icon size={20} strokeWidth={1.9} />
              </span>
              <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/80">{label}</span>
              {badge ? (
                <span className="absolute top-1.5 end-4 min-w-5 h-5 px-1 rounded-full bg-gold-dark text-on-accent text-[10px] font-counter font-bold inline-flex items-center justify-center">
                  {toArabicDigits(badge)}
                </span>
              ) : null}
            </HapticPressable>
          ))}
        </Card>
      </section>
    </motion.div>
  );
}
