import { useEffect, useState } from 'react';
import { MapPin, Navigation, ChevronLeft, RefreshCw, WifiOff } from 'lucide-react';
import { Mosque as MosqueIcon } from '@/components/icons/Mosque';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { toArabicDigits } from '@/utils/arabicFormat';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { mosquesService, type Mosque } from '@/services/MosquesService';
import { useSettingsStore } from '@/store/settingsStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/store/toastStore';

export function MosquesPage() {
  const coords = useSettingsStore((s) => s.coords);
  const setCoords = useSettingsStore((s) => s.setCoords);
  const geo = useGeolocation();
  const [items, setItems] = useState<Mosque[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    mosquesService
      .getNearby(coords)
      .then((m) => {
        if (!cancelled) setItems(m);
      })
      .catch(() => {
        if (!cancelled) setError('تعذّر تحميل قائمة المساجد. حاول مرة أخرى.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  const openInMaps = async (m: Mosque) => {
    const httpsUrl = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`;
    const geoUrl = `geo:${m.lat},${m.lng}?q=${m.lat},${m.lng}(${encodeURIComponent(m.name)})`;
    try {
      if (Capacitor.isNativePlatform()) {
        // Use a basic window.open which the Android WebView will forward to
        // the system intent resolver for `geo:` URIs.
        window.open(geoUrl, '_system') ?? window.open(httpsUrl, '_system');
      } else {
        window.open(httpsUrl, '_blank');
      }
    } catch {
      toast.error('تعذّر فتح الخرائط');
    }
  };

  if (!coords) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="المساجد القريبة" subtitle="أقرب بيوت الله إليك" showBack />
        <div className="p-6">
          <EmptyState
            illustration={<MapPin size={64} className="text-gold" />}
            title="نحتاج موقعك"
            description="للعثور على المساجد القريبة منك، اسمح بمشاركة موقعك."
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

  const retry = () => {
    setError(null);
    setLoading(true);
    mosquesService
      .getNearby(coords)
      .then(setItems)
      .catch(() => setError('تعذّر تحميل قائمة المساجد. تحقّق من اتصالك وحاول مرة أخرى.'))
      .finally(() => setLoading(false));
  };
  const nearest = items && items.length > 0 ? items[0] : null;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="المساجد القريبة" subtitle="أقرب بيوت الله إليك" showBack />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6">
        {loading ? (
          <Card className="p-3 flex flex-col gap-4" aria-busy>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton width={40} height={40} rounded="lg" />
                <div className="flex-1">
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="35%" height={11} className="mt-2" />
                </div>
              </div>
            ))}
          </Card>
        ) : error ? (
          <Card className="p-5 flex flex-col items-center text-center gap-3">
            <WifiOff size={22} className="text-text-muted" />
            <p className="text-sm text-text-secondary dark:text-text-on-dark/80 leading-relaxed">{error}</p>
            <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={retry}>
              إعادة المحاولة
            </Button>
          </Card>
        ) : items && items.length === 0 ? (
          <EmptyState title="لا توجد مساجد قريبة" description="لم نجد مساجد مسجّلة قرب موقعك. تحقّق من موقعك في الإعدادات." />
        ) : items ? (
          <>
            {nearest ? (
              <Card variant="gradient-edge" className="p-5">
                <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
                <div className="flex items-center gap-4">
                  <Medallion size={64} tone="gold">
                    <MosqueIcon size={24} className="text-gold-dark dark:text-gold-light" />
                  </Medallion>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-text-muted">الأقرب إليك</p>
                    <p className="font-display text-lg font-bold text-text-primary dark:text-text-on-dark truncate">{nearest.name}</p>
                    <p className="text-xs text-text-secondary dark:text-text-on-dark/70 font-counter">{formatDistance(nearest.distanceKm)}</p>
                  </div>
                </div>
                <Button variant="primary" fullWidth className="mt-4" leftIcon={<Navigation size={16} />} onClick={() => openInMaps(nearest)}>
                  الاتجاهات
                </Button>
              </Card>
            ) : null}

            <section className="flex flex-col gap-2.5">
              <SectionTitle title="كل المساجد القريبة" subtitle={`${toArabicDigits(items.length)} مسجداً، الأقرب أولاً`} />
              <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => openInMaps(m)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
                  >
                    <span
                      className="w-10 h-10 rounded-xl bg-teal/10 dark:bg-teal/15 inline-flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <Navigation size={17} className="text-teal dark:text-teal-light" style={{ transform: `rotate(${m.bearing}deg)` }} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{m.name}</span>
                      <span className="block text-[11px] text-text-muted truncate">
                        <span className="font-counter">{formatDistance(m.distanceKm)}</span>
                        {m.address ? `، ${m.address}` : ''}
                      </span>
                    </span>
                    <ChevronLeft size={16} className="text-text-muted shrink-0" />
                  </button>
                ))}
              </Card>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** ٣٥٠ م under a kilometre, otherwise ١٫٢ كم. */
function formatDistance(km: number): string {
  return km < 1 ? `${toArabicDigits(Math.round(km * 1000))} م` : `${toArabicDigits(km.toFixed(1)).replace('.', '٫')} كم`;
}
