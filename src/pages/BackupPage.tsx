import { useRef, useState } from 'react';
import { motion } from '@/lib/motion';
import {
  ShieldCheck,
  Download,
  Upload,
  AlertTriangle,
  Clock,
  Settings,
  TrendingUp,
  BookOpen,
  Bookmark,
  CircleDot,
  Moon,
  HandCoins,
  Award,
  Sparkles,
  BookMarked,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Medallion, ArchMotif } from '@/components/ui/Ornament';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { backupService } from '@/services/BackupService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

const LAST_BACKUP_KEY = 'myzikr-last-backup-at';

/** What the backup envelope carries — shown to the user as chips.
 *  Keep in sync with `STORE_GETTERS` in BackupService (18 stores): the chip
 *  list used to advertise 11 while 18 were exported, hiding exactly the
 *  stores users care most about losing (prayer log, hifz, awrad). */
const INCLUDED: { label: string; icon: LucideIcon }[] = [
  { label: 'الإعدادات', icon: Settings },
  { label: 'التقدم والسلاسل', icon: TrendingUp },
  { label: 'سجل الصلوات', icon: CircleDot },
  { label: 'القرآن ومواضع القراءة', icon: BookOpen },
  { label: 'الحفظ والمراجعة', icon: BookMarked },
  { label: 'الأوراد والأهداف', icon: TrendingUp },
  { label: 'الإشارات المرجعية', icon: Bookmark },
  { label: 'التسبيح', icon: CircleDot },
  { label: 'أذكاري المخصّصة', icon: Sparkles },
  { label: 'جلسات الأذكار', icon: Sparkles },
  { label: 'التذكيرات', icon: Clock },
  { label: 'رمضان', icon: Moon },
  { label: 'الصدقات', icon: HandCoins },
  { label: 'الأوسمة', icon: Award },
  { label: 'الأسماء الحسنى', icon: Sparkles },
  { label: 'الأدعية', icon: BookMarked },
  { label: 'الأحاديث', icon: ScrollText },
];

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function formatBackupDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} — ${time}`;
  } catch {
    return '';
  }
}

export function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(() => readLastBackup());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBusy(true);
    try {
      await backupService.export();
      const now = new Date().toISOString();
      try {
        localStorage.setItem(LAST_BACKUP_KEY, now);
      } catch {
        /* storage may be unavailable — non-fatal */
      }
      setLastBackup(now);
      toast.success('تم تصدير النسخة الاحتياطية');
    } catch (e) {
      toast.error('تعذّر التصدير', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Restore is destructive (full replace + reload), so it must never fire
  // straight off the file picker: validate + preview first, then confirm.
  const [pendingRestore, setPendingRestore] = useState<{
    text: string;
    exportedAt: string | null;
    storeCount: number;
  } | null>(null);

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const preview = backupService.inspectJson(text);
      setPendingRestore({ text, ...preview });
    } catch (e) {
      toast.error('تعذّرت قراءة الملف', (e as Error).message);
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      // Safety net: stash the CURRENT data first so one wrong tap is recoverable.
      backupService.stashSafetySnapshot();
      const count = await backupService.restoreFromJson(pendingRestore.text);
      setPendingRestore(null);
      toast.success('تمت الاستعادة', `${toArabicDigits(count)} مخزن`);
      // Reload to ensure all React subscribers see the new state.
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e) {
      toast.error('تعذّرت الاستعادة', (e as Error).message);
      setPendingRestore(null);
    } finally {
      setBusy(false);
    }
  };

  const lastBackupLabel = lastBackup ? formatBackupDate(lastBackup) : '';

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="النسخ الاحتياطي" subtitle="صدّر بياناتك في ملف واستعدها متى شئت" showBack />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6">
        {/* Ornamented status hero */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        >
          <Card variant="gradient-edge" className="p-5">
            <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
            <div className="flex items-center gap-4">
              <Medallion size={60} tone="gold">
                <ShieldCheck size={22} className="text-gold-dark dark:text-gold-light" />
              </Medallion>
              <div className="min-w-0">
                <h1 className="font-display text-xl text-text-primary dark:text-text-on-dark leading-tight">
                  نسخة آمنة لبياناتك
                </h1>
                <p className="text-xs text-text-secondary dark:text-text-on-dark/70 mt-0.5 leading-relaxed">
                  صدّر كل ما يخصّك في ملف واحد، واستعده متى شئت.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-inner)] bg-white/60 dark:bg-dark-surface ring-1 ring-gold/25 px-3 py-2.5">
              <Clock size={16} className="shrink-0 text-gold-dark dark:text-gold-light" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-text-muted">
                  آخر نسخة احتياطية
                </p>
                {lastBackupLabel ? (
                  <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark tabular-nums truncate">
                    {lastBackupLabel}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-text-secondary truncate">
                    لم تُنشئ نسخة بعد
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button
                variant="primary"
                fullWidth
                onClick={handleExport}
                loading={busy}
                leftIcon={<Download size={16} />}
              >
                تصدير
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = '';
                }}
              />
              <Button
                variant="secondary"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                leftIcon={<Upload size={16} />}
              >
                استعادة
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* What is included */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.06 }}
        >
          <Card variant="plain" className="p-5">
            <div className="flex items-center gap-2 text-teal dark:text-teal-light mb-3">
              <BookOpen size={16} />
              <p className="text-xs font-bold">المحتويات المحفوظة</p>
            </div>
            <p className="text-sm text-text-primary dark:text-text-on-dark leading-relaxed mb-4">
              تشمل النسخة الاحتياطية كل ما يلي في ملف{' '}
              <span className="font-semibold">JSON</span> واحد:
            </p>
            <ul className="flex flex-wrap gap-2">
              {INCLUDED.map(({ label, icon: Icon }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal/8 dark:bg-teal/15 text-teal dark:text-teal-light border border-teal/10 dark:border-dark-border px-3 py-1.5 text-xs font-semibold"
                >
                  <Icon size={13} className="shrink-0" />
                  {label}
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>

        {/* Restore caution */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.12 }}
        >
          <Card variant="plain" className="p-4 flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-warning/12 text-warning inline-flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </span>
            <p className="text-xs text-text-secondary leading-relaxed">
              استعادة نسخة احتياطية تستبدل البيانات الحالية، وسيُعاد تحميل التطبيق بعدها.
              احتفظ بالملف في مكان آمن.
            </p>
          </Card>
        </motion.div>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="استعادة النسخة الاحتياطية؟"
        message={
          pendingRestore ? (
            <>
              ستُستبدل بياناتك الحالية بمحتوى هذه النسخة
              {pendingRestore.exportedAt ? (
                <>
                  {' '}
                  (أُنشئت في{' '}
                  <span className="font-semibold tabular-nums">
                    {formatBackupDate(pendingRestore.exportedAt)}
                  </span>
                  )
                </>
              ) : null}
              ، وتشمل {toArabicDigits(pendingRestore.storeCount)} قسمًا. سنحتفظ بنسخة أمان من
              بياناتك الحالية قبل الاستعادة، وسيُعاد تشغيل التطبيق بعدها.
            </>
          ) : undefined
        }
        confirmLabel="استعادة"
        confirmVariant="danger"
        onConfirm={() => void confirmRestore()}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
}
