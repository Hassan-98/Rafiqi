import { useMemo, useEffect, useState } from 'react';
import { motion } from '@/lib/motion';
import { MapPin, RefreshCw, Compass } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Star8 } from '@/components/ui/Ornament';
import { toArabicDigits } from '@/utils/arabicFormat';
import { useDeviceHeading } from '@/hooks/useDeviceHeading';
import { useSettingsStore } from '@/store/settingsStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { bearingToKaaba, distanceKm, KAABA } from '@/services/QiblaService';

const CARDINALS_AR = ['ش', 'شغ', 'غ', 'جغ', 'ج', 'جق', 'ق', 'شق'];

export function QiblaPage() {
  const coords = useSettingsStore((s) => s.coords);
  const setCoords = useSettingsStore((s) => s.setCoords);
  const geo = useGeolocation();
  const { heading, accuracy, permissionState, request, supported } = useDeviceHeading();

  const [needsPermission, setNeedsPermission] = useState(false);

  useEffect(() => {
    if (permissionState === 'unknown' && supported) setNeedsPermission(true);
    if (permissionState === 'granted') setNeedsPermission(false);
  }, [permissionState, supported]);

  const bearing = useMemo(() => (coords ? bearingToKaaba(coords) : null), [coords]);
  const distance = useMemo(() => (coords ? distanceKm(coords, KAABA) : null), [coords]);

  // Rotation of the compass ring is opposite to device heading so the
  // top always indicates where the device is facing.
  const ringRotation = heading != null ? -heading : 0;
  // The Kaaba pointer lives INSIDE the rotating ring, so its rotation is
  // expressed in the ring's (geographic) frame — simply the qibla bearing. The
  // ring's own `-heading` rotation then renders it at screen angle
  // `bearing - heading`, i.e. straight up exactly when the device faces the
  // qibla. (Previously it added the heading/ring offset a SECOND time, so the
  // arrow drifted the wrong way as the phone turned.)
  const pointerRotation = bearing ?? 0;

  if (!coords) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="القبلة" showBack />
        <div className="p-6">
          <EmptyState
            title="نحتاج موقعك أولاً"
            description="لحساب اتجاه القبلة بدقة، اسمح للتطبيق بالوصول إلى موقعك."
            cta={{
              label: 'تحديد موقعي',
              onClick: async () => {
                // Use the RETURNED coords — `geo.coords` is the stale value
                // captured by this render (null), so the first tap did nothing.
                const fresh = await geo.request();
                if (fresh) setCoords(fresh);
              },
            }}
          />
        </div>
      </div>
    );
  }

  // Facing the qibla (within ±5°) — the ring glows and the copy confirms it.
  const offset = heading != null && bearing != null ? ((bearing - heading + 540) % 360) - 180 : null;
  const facing = offset != null && Math.abs(offset) <= 5;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="القبلة" subtitle={distance ? `تبعد مكة ${toArabicDigits(Math.round(distance))} كم عنك` : undefined} showBack />
      <div className="px-4 pt-4 pb-28 flex flex-col items-center gap-6">
        {needsPermission ? (
          <Card variant="gradient-edge" className="p-4 w-full flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
              <Compass size={18} />
            </span>
            <p className="flex-1 text-sm text-text-primary dark:text-text-on-dark">للوصول إلى البوصلة نحتاج إذن الحركة من جهازك.</p>
            <Button variant="primary" size="sm" onClick={() => request()}>
              منح الإذن
            </Button>
          </Card>
        ) : null}

        {/* Compass */}
        <div className="relative w-72 h-72 mt-2">
          <div
            aria-hidden
            className={[
              'absolute -inset-3 rounded-full transition-shadow duration-300',
              facing ? 'shadow-[var(--shadow-glow-gold)] ring-2 ring-gold/60' : 'ring-1 ring-gold/25',
            ].join(' ')}
          />
          {/* Rotating compass ring */}
          <motion.div
            className="absolute inset-0 rounded-full bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] shadow-[var(--shadow-lg)]"
            animate={{ rotate: ringRotation }}
            transition={{ type: 'tween', duration: 0.18, ease: 'linear' }}
          >
            {/* Tick marks every 15°, longer each 45° */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full text-text-muted" aria-hidden>
              {Array.from({ length: 24 }).map((_, i) => (
                <line
                  key={i}
                  x1="50"
                  y1={i % 3 === 0 ? 3.5 : 4.5}
                  x2="50"
                  y2={i % 3 === 0 ? 8.5 : 7}
                  stroke="currentColor"
                  strokeOpacity={i % 3 === 0 ? 0.7 : 0.35}
                  strokeWidth={i % 3 === 0 ? 0.9 : 0.6}
                  strokeLinecap="round"
                  transform={`rotate(${i * 15} 50 50)`}
                />
              ))}
              <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.5} />
            </svg>
            {/* Cardinal markers */}
            {CARDINALS_AR.map((c, i) => {
              const angle = (i / CARDINALS_AR.length) * 360;
              const x = 50 + 38 * Math.sin((angle * Math.PI) / 180);
              const y = 50 - 38 * Math.cos((angle * Math.PI) / 180);
              return (
                <span
                  key={c}
                  className={`absolute text-xs font-bold font-display ${i === 0 ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light'}`}
                  style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {c}
                </span>
              );
            })}

            {/* Kaaba pointer (nested in the ring → rotates in geographic frame) */}
            <motion.div
              className="absolute inset-0 flex items-start justify-center pointer-events-none"
              animate={{ rotate: pointerRotation }}
              transition={{ type: 'tween', duration: 0.18, ease: 'linear' }}
            >
              <div className="mt-6 flex flex-col items-center">
                <span className="text-2xl" aria-hidden>🕋</span>
                <div className="w-1.5 h-[4.5rem] bg-[image:var(--gradient-gold)] rounded-full -mt-0.5" />
              </div>
            </motion.div>
          </motion.div>

          {/* Static centre seal + the device's facing mark at the top */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Star8 size={28} className={facing ? 'text-gold' : 'text-teal dark:text-teal-light'} />
          </div>
          <span aria-hidden className="absolute -top-5 left-1/2 -translate-x-1/2 w-0 h-0 border-x-[7px] border-x-transparent border-t-[10px] border-t-teal dark:border-t-teal-light" />
        </div>

        {/* Info */}
        <Card variant={facing ? 'gold-rim' : 'plain'} className="p-4 w-full text-center" as="section">
          <p className="text-xs text-text-muted">اتجاه القبلة من موقعك</p>
          <p className="text-3xl font-counter font-bold text-teal dark:text-teal-light mt-1 tabular-nums">
            {bearing != null ? `${toArabicDigits(bearing.toFixed(1))}°` : '—'}
          </p>
          <p aria-live="polite" className={['text-sm mt-1.5', facing ? 'font-bold text-gold-dark dark:text-gold-light' : 'text-text-secondary dark:text-text-on-dark/75'].join(' ')}>
            {heading == null
              ? 'حرّك جهازك ببطء لتبدأ البوصلة'
              : facing
                ? 'أنت متّجه إلى القبلة'
                : `أدِر جهازك ${offset! > 0 ? 'يميناً' : 'يساراً'} ${toArabicDigits(Math.round(Math.abs(offset!)))}°`}
          </p>
          {accuracy != null && accuracy > 25 ? (
            <p className="text-xs text-warning mt-2 leading-relaxed">دقة البوصلة منخفضة. حرّك هاتفك على شكل الرقم ٨ لمعايرتها.</p>
          ) : null}
        </Card>

        <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => request()}>
          إعادة المعايرة
        </Button>

        <p className="text-[11px] text-text-muted text-center flex items-center gap-1 font-counter" dir="ltr">
          <MapPin size={11} />
          {toArabicDigits(coords.latitude.toFixed(3))}°, {toArabicDigits(coords.longitude.toFixed(3))}°
        </p>
      </div>
    </div>
  );
}
