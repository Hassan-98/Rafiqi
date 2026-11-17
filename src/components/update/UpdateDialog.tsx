import { CheckCircle2, Download, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Medallion } from '@/components/ui/Ornament';
import { BUNDLE_VERSION, startUpdate, useUpdateStore, type UpdatePhase } from '@/services/appUpdate';
import { toArabicDigits } from '@/utils/arabicFormat';

const TITLE: Record<UpdatePhase, string> = {
  available: 'تحديث جديد متاح',
  downloading: 'جارٍ تنزيل التحديث',
  installing: 'جارٍ التحقق والتثبيت',
  restarting: 'اكتمل التحديث',
  error: 'تعذّر التحديث',
  done: 'تم التحديث بنجاح',
};

const mb = (bytes: number) => toArabicDigits((bytes / 1048576).toFixed(1));

/** «إصلاحات، تحسينات» or one per line → list items. */
function noteItems(notes: string | undefined): string[] {
  return (notes ?? '')
    .split(/\n|•|؛|;/)
    .map((s) => s.replace(/^[-–*\s]+/, '').trim())
    .filter(Boolean);
}

/**
 * The OTA update screen — a real dialog, not a passing toast: what's new and
 * how big it is, then live download progress (bytes from the native side;
 * a moving bar on shells too old to report it), verify/install, restart.
 * It can't be dismissed mid-update. After the reload the new bundle shows
 * «تم التحديث» with the same notes (appUpdate.showWhatsNew).
 */
export function UpdateDialog() {
  const { open, phase, manifest, loaded, total, error } = useUpdateStore();
  if (!phase || !manifest) return null;

  const busy = phase === 'downloading' || phase === 'installing' || phase === 'restarting';
  const close = () => {
    if (!busy) useUpdateStore.setState({ open: false });
  };
  const pct = phase === 'downloading' && total > 0 && loaded > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  const notes = noteItems(manifest.notes);
  const Icon = phase === 'error' ? TriangleAlert : phase === 'done' || phase === 'restarting' ? CheckCircle2 : phase === 'available' ? Sparkles : Download;

  return (
    <Modal open={open} onClose={close} hideClose={busy} size="sm">
      <div className="flex flex-col items-center text-center gap-4 pt-1" aria-live="polite">
        <Medallion size={76} tone={phase === 'error' ? 'teal' : 'gold'}>
          <Icon
            size={28}
            className={[
              phase === 'error' ? 'text-danger' : 'text-gold-dark dark:text-gold-light',
              phase === 'downloading' ? 'animate-pulse-soft' : '',
            ].join(' ')}
          />
        </Medallion>

        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark">{TITLE[phase]}</h2>
          <p className="text-[12px] text-text-muted">
            {phase === 'done' ? 'أنت الآن على الإصدار ' : 'الإصدار '}
            <span className="font-counter font-bold text-text-secondary dark:text-text-on-dark/80">{toArabicDigits(manifest.version)}</span>
            {phase === 'available' ? (
              <>
                {'، ولديك '}
                <span className="font-counter">{toArabicDigits(BUNDLE_VERSION)}</span>
              </>
            ) : null}
          </p>
        </div>

        {/* What's new */}
        {(phase === 'available' || phase === 'done') && notes.length > 0 ? (
          <div className="w-full rounded-[var(--radius-inner)] bg-cream-dark/50 dark:bg-dark-surface px-4 py-3 text-start">
            <p className="text-[12px] font-bold text-gold-dark dark:text-gold-light mb-1.5">ما الجديد</p>
            <ul className="flex flex-col gap-1">
              {notes.map((n) => (
                <li key={n} className="flex items-start gap-2 text-[13px] leading-relaxed text-text-primary dark:text-text-on-dark">
                  <span aria-hidden className="mt-2 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                  <span className="text-pretty">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {phase === 'available' ? (
          <p className="text-[12px] text-text-secondary dark:text-text-on-dark/75 text-pretty leading-relaxed">
            {manifest.size ? `حجم التحديث ${mb(manifest.size)} ميغابايت. ` : ''}
            يُنزَّل ثم يُعاد تشغيل التطبيق تلقائياً، وتبقى بياناتك كما هي.
          </p>
        ) : null}

        {/* Progress */}
        {busy ? (
          <div className="w-full flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-semibold text-text-secondary dark:text-text-on-dark/80">
                {phase === 'downloading' ? 'التنزيل' : phase === 'installing' ? 'التحقق من الملف وتثبيته' : 'جارٍ إعادة التشغيل…'}
              </span>
              {pct != null ? (
                <span className="font-counter font-bold text-teal dark:text-teal-light">{toArabicDigits(pct)}٪</span>
              ) : null}
            </div>
            <div
              className="relative h-2.5 rounded-full bg-track overflow-hidden"
              role="progressbar"
              aria-label="تقدّم التحديث"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct ?? undefined}
            >
              {pct != null || phase === 'restarting' ? (
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-teal)] transition-[width] duration-300 ease-out"
                  style={{ width: `${phase === 'restarting' ? 100 : Math.max(3, pct ?? 0)}%` }}
                />
              ) : (
                <div className="update-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-[image:var(--gradient-teal)]" />
              )}
            </div>
            <p className="text-[11.5px] text-text-muted font-counter">
              {phase === 'downloading'
                ? total > 0 && loaded > 0
                  ? `${mb(loaded)} من ${mb(total)} ميغابايت`
                  : total > 0
                    ? `حجم التحديث ${mb(total)} ميغابايت`
                    : 'جارٍ التنزيل…'
                : phase === 'installing'
                  ? 'لحظات وينتهي…'
                  : 'سيُفتح التطبيق بالإصدار الجديد'}
            </p>
            <p className="text-[11.5px] text-text-secondary dark:text-text-on-dark/70">لا تغلق التطبيق حتى يكتمل التحديث.</p>
          </div>
        ) : null}

        {phase === 'error' && error ? (
          <p className="w-full rounded-[var(--radius-inner)] bg-danger/10 text-danger px-4 py-3 text-[13px] leading-relaxed text-pretty">{error}</p>
        ) : null}

        {/* Actions */}
        {phase === 'available' ? (
          <div className="w-full flex flex-col gap-2">
            <Button fullWidth haptic="medium" leftIcon={<Download size={16} />} onClick={() => void startUpdate()}>
              تحديث الآن
            </Button>
            <Button fullWidth variant="ghost" onClick={close}>
              لاحقاً
            </Button>
          </div>
        ) : phase === 'error' ? (
          <div className="w-full flex flex-col gap-2">
            <Button fullWidth leftIcon={<RefreshCw size={16} />} onClick={() => void startUpdate()}>
              إعادة المحاولة
            </Button>
            <Button fullWidth variant="ghost" onClick={close}>
              إغلاق
            </Button>
          </div>
        ) : phase === 'done' ? (
          <Button fullWidth onClick={close}>
            حسناً
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
