import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Sun, Moon, Star, Check, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useRamadanState } from '@/hooks/useRamadanState';
import { useRamadanStore } from '@/store/ramadanStore';
import { hapticsService } from '@/services/HapticsService';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { toArabicDigits } from '@/utils/arabicFormat';
import { ArchMotif } from '@/components/ui/Ornament';

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Hero replacement for the next-prayer card during Ramadan. Shows suhoor
 * countdown before Fajr, iftar countdown after.
 */
export function RamadanWidget() {
  const { isActive, currentHijriDay, suhoorEndsAt, iftarAt, taraweehNights, juzCompletedTotal } = useRamadanState();
  const toggleTaraweeh = useRamadanStore((s) => s.toggleTaraweeh);
  const markJuzComplete = useRamadanStore((s) => s.markJuzComplete);
  const taraweehTonight = taraweehNights.includes(currentHijriDay);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isActive) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isActive]);

  if (!isActive || !suhoorEndsAt || !iftarAt) return null;

  const beforeFajr = now < suhoorEndsAt.getTime();
  const target = beforeFajr ? suhoorEndsAt : iftarAt;
  const targetGone = now > target.getTime();
  const seconds = Math.max(0, Math.floor((target.getTime() - now) / 1000));

  const Icon = beforeFajr ? Star : iftarAt.getTime() > now ? Sun : Moon;
  const title = beforeFajr
    ? 'حتى أذان الفجر'
    : iftarAt.getTime() > now
      ? 'حتى الإفطار'
      : 'انتهى صيام اليوم';

  return (
    <Card variant="night" className="p-5">
      <ArchMotif className="absolute -top-6 -start-8 w-44 text-gold opacity-[0.14]" />
      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 text-gold-light">
            <Icon size={16} />
            <span className="text-xs font-bold">رمضان مبارك</span>
          </div>
          <p className="text-2xl font-display font-bold mt-1">{title}</p>
          <p className="text-xs opacity-80 mt-0.5">
            {toArabicDigits(formatPrayerTime(target))} · اليوم {toArabicDigits(currentHijriDay)} من رمضان
          </p>
        </div>
        <ProgressRing
          value={Math.min(100, Math.round((juzCompletedTotal / 30) * 100))}
          size={64}
          strokeWidth={6}
          colorFrom="var(--color-gold-light)"
          colorTo="var(--color-gold)"
          trackColor="color-mix(in srgb, var(--color-text-on-dark) 15%, transparent)"
          label="جزء"
          showPercent={false}
        />
      </div>

      {!targetGone ? (
        <p className="relative text-4xl font-counter font-bold text-gold-light tabular-nums leading-none" dir="ltr">
          {toArabicDigits(formatCountdown(seconds))}
        </p>
      ) : null}

      {/* Tap-to-log tiles. The store actions existed since day one but had NO
          UI callers, so both counters were permanently stuck at 0. */}
      <div className="relative grid grid-cols-2 gap-3 mt-4">
        <button
          onClick={() => {
            toggleTaraweeh(currentHijriDay);
            void hapticsService.impact('light');
          }}
          aria-pressed={taraweehTonight}
          className={[
            'rounded-[var(--radius-inner)] p-2 min-h-[44px] text-center transition-colors active:scale-[0.97]',
            taraweehTonight ? 'bg-gold/25 ring-1 ring-gold-light/60' : 'bg-text-on-dark/10',
          ].join(' ')}
        >
          <p className="text-[10px] opacity-80 flex items-center justify-center gap-1">
            التراويح {taraweehTonight ? <Check size={10} aria-hidden /> : null}
          </p>
          <p className="text-lg font-counter font-bold">{toArabicDigits(taraweehNights.length)} / ٣٠</p>
          <p className="text-[9px] opacity-70">{taraweehTonight ? 'صلّيتها الليلة، تقبّل الله' : 'اضغط بعد صلاتها'}</p>
        </button>
        <button
          onClick={() => {
            if (juzCompletedTotal >= 30) return;
            markJuzComplete(format(new Date(), 'yyyy-MM-dd'), juzCompletedTotal + 1);
            void hapticsService.impact('light');
          }}
          disabled={juzCompletedTotal >= 30}
          className="rounded-[var(--radius-inner)] bg-text-on-dark/10 p-2 min-h-[44px] text-center transition-colors active:scale-[0.97] disabled:opacity-70"
        >
          <p className="text-[10px] opacity-80 flex items-center justify-center gap-1">
            الأجزاء {juzCompletedTotal < 30 ? <Plus size={10} aria-hidden /> : <Check size={10} aria-hidden />}
          </p>
          <p className="text-lg font-counter font-bold">{toArabicDigits(juzCompletedTotal)} / ٣٠</p>
          <p className="text-[9px] opacity-70">
            {juzCompletedTotal >= 30 ? 'ختمت، تقبّل الله' : 'اضغط عند إتمام جزء'}
          </p>
        </button>
      </div>
    </Card>
  );
}
