import { useState, type ReactNode } from 'react';
import { Download, Pause, Play, X, Trash2, Check, RotateCcw, Signal, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { PackState } from '@/store/downloadsStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { formatBytes } from './offlineCore';

export interface PackActions {
  start: () => void;
  pause: () => void;
  resume: (allowCellular?: boolean) => void;
  cancel: () => void;
  remove: () => void;
}

interface Props {
  icon: ReactNode;
  title: string;
  /** What the pack holds («٦٠٤ صفحة بخط المصحف»). */
  detail: string;
  /** Bytes still to download (estimate), shown before starting. */
  estimate: number;
  /** Bytes on disk now. */
  used: number;
  /** Units present / total when no job is running (e.g. pages on disk). */
  have: number;
  total: number;
  unit: string;
  pack?: PackState;
  running: boolean;
  actions: PackActions;
  startLabel?: string;
  /** Extra note under the actions (e.g. a size warning). */
  note?: ReactNode;
  id?: string;
}

/** A downloadable pack: size before starting, progress, pause/resume/cancel, retry, delete. */
export function PackCard(p: Props) {
  const [confirm, setConfirm] = useState(false);
  const st = p.pack?.status ?? 'idle';
  const active = p.running && st === 'downloading';
  const paused = st === 'paused';
  const complete = p.have >= p.total;
  const done = active || paused ? (p.pack?.done ?? 0) : p.have;
  const total = active || paused ? p.pack?.total || p.total : p.total;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const failed = st === 'error' ? (p.pack?.failed ?? 0) : 0;
  const reason = paused ? p.pack?.reason : undefined;

  return (
    <section
      id={p.id}
      className="scroll-mt-24 rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
          {p.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">{p.title}</h3>
          <p className="text-[12px] text-text-muted text-pretty">{p.detail}</p>
        </div>
        {complete && !active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 dark:bg-teal/15 px-2 py-1 text-[11px] font-semibold text-teal dark:text-teal-light shrink-0">
            <Check size={12} aria-hidden /> جاهز
          </span>
        ) : null}
      </div>

      <div>
        <div className="h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-[image:var(--gradient-teal)] transition-[width] duration-300 ease-out-soft motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] font-counter tabular-nums text-text-secondary dark:text-text-on-dark/70">
          <span className="inline-flex items-center gap-1.5">
            {active ? <Loader2 size={12} className="animate-spin text-teal dark:text-teal-light motion-reduce:animate-none" aria-hidden /> : null}
            {toArabicDigits(done)} من {toArabicDigits(total)} {p.unit}
          </span>
          <span>{p.used > 0 ? `على الجهاز ${formatBytes(p.used)}` : complete ? '' : `نحو ${formatBytes(p.estimate)}`}</span>
        </div>
      </div>

      {reason ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-inner)] bg-warning/10 px-3 py-2 text-[12px] leading-relaxed text-text-secondary dark:text-text-on-dark/80">
          {reason === 'cellular' ? <Signal size={14} className="text-warning mt-0.5 shrink-0" /> : <WifiOff size={14} className="text-warning mt-0.5 shrink-0" />}
          {reason === 'cellular'
            ? 'بانتظار شبكة Wi-Fi. يُستأنف التنزيل تلقائياً عند الاتصال بها'
            : 'لا يوجد اتصال. يُستأنف التنزيل تلقائياً عند عودته'}
        </p>
      ) : null}
      {failed > 0 ? (
        <p className="text-[12px] text-danger leading-relaxed">
          تعذّر تنزيل {toArabicDigits(failed)} {p.unit}. أعد المحاولة لتنزيل الناقص فقط.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {active ? (
          <>
            <Button variant="secondary" size="sm" leftIcon={<Pause size={14} />} onClick={p.actions.pause}>
              إيقاف مؤقت
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={p.actions.cancel}>
              إلغاء
            </Button>
          </>
        ) : paused ? (
          <>
            <Button variant="primary" size="sm" leftIcon={<Play size={14} />} onClick={() => p.actions.resume()}>
              متابعة
            </Button>
            {reason === 'cellular' ? (
              <Button variant="secondary" size="sm" leftIcon={<Signal size={14} />} onClick={() => p.actions.resume(true)}>
                نزّل عبر بيانات الجوال
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={p.actions.cancel}>
              إلغاء
            </Button>
          </>
        ) : !complete ? (
          <Button
            variant="primary"
            size="sm"
            leftIcon={failed > 0 ? <RotateCcw size={14} /> : <Download size={14} />}
            onClick={p.actions.start}
          >
            {failed > 0 ? 'إعادة المحاولة' : done > 0 ? 'تنزيل الباقي' : (p.startLabel ?? 'تنزيل')}
          </Button>
        ) : null}
        {!active && p.used > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ms-auto text-text-muted hover:text-danger"
            leftIcon={<Trash2 size={14} />}
            onClick={() => setConfirm(true)}
          >
            حذف
          </Button>
        ) : null}
      </div>
      {p.note}

      <ConfirmDialog
        open={confirm}
        title={`حذف ${p.title}؟`}
        message={`سيُحرَّر ${formatBytes(p.used)} من مساحة الجهاز، ويعود هذا المحتوى إلى الحاجة لاتصال.`}
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          p.actions.remove();
        }}
      />
    </section>
  );
}
