import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Mic, Wifi, Check, CircleDashed, MonitorSmartphone, Trash2 } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { NetworkBadge } from '@/components/offline/OfflineBanner';
import { PackCard, type PackActions } from '@/components/offline/PackCard';
import { ADHKAR_BYTES, formatBytes } from '@/components/offline/offlineCore';
import { ALL_ADHKAR_AUDIO_URLS } from '@/data/adhkarAudio';
import { useDownloadsStore, type PackId } from '@/store/downloadsStore';
import { offlineService, type OfflineUsage } from '@/services/offlineService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';

/** Works with no connection at all — computed or bundled on the device. */
const ALWAYS_OFFLINE = [
  'نصوص الأذكار والأدعية',
  'مواقيت الصلاة والقبلة',
  'آية وحديث اليوم',
  'التقويم الهجري',
  'العادات والأوراد والإحصاء',
];

const ADHKAR_TOTAL = ALL_ADHKAR_AUDIO_URLS.length;

function actionsFor(id: PackId, start: () => Promise<void>, remove: () => Promise<void>, doneMsg: string): PackActions {
  return {
    start: () =>
      void start().then(() => {
        if (useDownloadsStore.getState().packs[id]?.status === 'done') toast.success(doneMsg);
      }),
    pause: () => offlineService.pause(id),
    resume: (allowCellular) => void offlineService.resume(id, { allowCellular }),
    cancel: () => offlineService.cancel(id),
    remove: () => void remove().then(() => toast.info('حُذف التنزيل')),
  };
}

export function DownloadsPage() {
  const [params] = useSearchParams();
  const packs = useDownloadsStore((s) => s.packs);
  const wifiOnly = useDownloadsStore((s) => s.wifiOnly);
  const setWifiOnly = useDownloadsStore((s) => s.setWifiOnly);
  // Dev-only: preview the native packs UI in a desktop browser.
  const canDownload = offlineService.supported || (import.meta.env.DEV && params.has('preview'));

  const [usage, setUsage] = useState<OfflineUsage>({ mushaf: 0, tafsir: 0, adhkar: 0, audio: {} });
  const [adhkarHave, setAdhkarHave] = useState(0);
  // Re-measure disk use when a pack changes state or a surah's audio appears /
  // goes — not on every ayah (readdir of thousands of files).
  const statuses = Object.values(packs).map((p) => p?.status).join();
  const [cleaned, setCleaned] = useState(0);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void offlineService.usage().then((u) => alive && setUsage(u));
      void offlineService.adhkarOnDisk().then((n) => alive && setAdhkarHave(n));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [statuses, cleaned]);

  const adhkarDone = Math.max(adhkarHave, packs.adhkar?.status === 'done' ? ADHKAR_TOTAL : 0);
  // The Quran moved to «مصحفي»: what the old reader downloaded is dead weight now.
  const legacyUsed = usage.mushaf + usage.tafsir + Object.values(usage.audio).reduce((a, b) => a + b, 0);
  const totalUsed = usage.adhkar + legacyUsed;
  const [clearing, setClearing] = useState(false);
  const clearLegacy = async () => {
    setClearing(true);
    try {
      await offlineService.deleteMushaf();
      await offlineService.deleteTafsir();
      for (const qari of Object.keys(usage.audio)) await offlineService.deleteAudio(qari as never);
      toast.info('حُذفت ملفات المصحف القديمة');
    } finally {
      setClearing(false);
      setCleaned((n) => n + 1);
    }
  };

  const needs = [{ label: 'تلاوة الأذكار', ready: adhkarDone >= ADHKAR_TOTAL }];
  const readyCount = needs.filter((n) => n.ready).length;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="التنزيلات" subtitle="الاستماع دون إنترنت" showBack />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* ── Overview ─────────────────────────────── */}
        <Card variant="gradient-edge" className="p-5">
          <ArchMotif className="absolute -top-6 -end-6 w-36 text-gold opacity-20" />
          <div className="relative flex items-center gap-4">
            <Medallion size={68} tone="teal" className="text-teal dark:text-teal-light">
              <span className="text-[15px] font-counter tabular-nums">
                {toArabicDigits(readyCount)}
                <span className="text-[11px] opacity-70">/{toArabicDigits(needs.length)}</span>
              </span>
            </Medallion>
            <div className="min-w-0 flex-1">
              <NetworkBadge className="mb-1.5" />
              <h2 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark text-balance">
                {readyCount === needs.length ? 'رفيقك جاهز دون إنترنت' : 'اجعل رفيقك يعمل دون إنترنت'}
              </h2>
              <p className="text-[12px] font-counter tabular-nums text-text-secondary dark:text-text-on-dark/70">
                {canDownload
                  ? totalUsed > 0
                    ? `التنزيلات تشغل ${formatBytes(totalUsed)} على جهازك`
                    : 'لا تنزيلات بعد'
                  : 'التنزيل متاح في تطبيق الجوال'}
              </p>
            </div>
          </div>

          <div className="relative mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11.5px] font-semibold text-text-muted mb-1.5">يعمل دائماً دون اتصال</p>
              <ul className="flex flex-wrap gap-1.5">
                {ALWAYS_OFFLINE.map((t) => (
                  <li
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-teal/10 dark:bg-teal/15 px-2.5 py-1 text-[11.5px] text-teal dark:text-teal-light"
                  >
                    <Check size={11} aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11.5px] font-semibold text-text-muted mb-1.5">يحتاج تنزيلاً مرة واحدة</p>
              <ul className="flex flex-wrap gap-1.5">
                {needs.map((n) => (
                  <li
                    key={n.label}
                    className={[
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px]',
                      n.ready
                        ? 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light'
                        : 'bg-cream-dark/60 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/70',
                    ].join(' ')}
                  >
                    {n.ready ? <Check size={11} aria-hidden /> : <CircleDashed size={11} aria-hidden />} {n.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {!canDownload ? (
          <Card className="p-4 flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <MonitorSmartphone size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">على الحاسوب</h3>
              <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
                تلاوة الأذكار تحتاج هنا إلى اتصال. لتنزيلها والعمل دون إنترنت استخدم تطبيق رفيقي على الجوال. الأذكار
                والمواقيت والتقويم تعمل هنا دون اتصال. والقرآن في تطبيق مصحفي، يعمل دون إنترنت.
              </p>
            </div>
          </Card>
        ) : (
          <>
            {/* ── Packs ────────────────────────────── */}
            <section className="flex flex-col gap-3">
              <SectionTitle title="الحِزم" subtitle="نزّل مرة واحدة، واستمع في أي مكان" />

              <div className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                    <Wifi size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">التنزيل عبر Wi-Fi فقط</span>
                    <span className="block text-[11px] text-text-muted">توفيراً لباقة بيانات الجوال</span>
                  </span>
                </span>
                <Toggle checked={wifiOnly} onChange={setWifiOnly} size="sm" label="التنزيل عبر Wi-Fi فقط" hideLabel />
              </div>

              <PackCard
                id="pack-adhkar"
                icon={<Mic size={18} />}
                title="الأذكار الصوتية"
                detail="تلاوة أذكار الصباح والمساء والنوم وبعد الصلاة، لوضع الاستماع"
                estimate={Math.round(ADHKAR_BYTES * (1 - adhkarDone / ADHKAR_TOTAL))}
                used={usage.adhkar}
                have={adhkarDone}
                total={ADHKAR_TOTAL}
                unit="مقطع"
                pack={packs.adhkar}
                running={offlineService.isRunning('adhkar')}
                actions={actionsFor(
                  'adhkar',
                  () => offlineService.downloadAdhkar(),
                  () => offlineService.deleteAdhkar(),
                  'الأذكار الصوتية متاحة دون إنترنت',
                )}
                startLabel="تنزيل الأذكار الصوتية"
              />
            </section>

            {legacyUsed > 0 ? (
              <Card className="p-4 flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-gold/12 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">ملفات المصحف القديم</h3>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
                    القرآن صار في تطبيق مصحفي. صفحات المصحف والتفسير والتلاوات التي نزّلتها هنا تشغل {formatBytes(legacyUsed)} ولا حاجة لها.
                  </p>
                  <Button className="mt-3" variant="secondary" size="sm" loading={clearing} onClick={() => void clearLegacy()}>
                    احذفها
                  </Button>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
