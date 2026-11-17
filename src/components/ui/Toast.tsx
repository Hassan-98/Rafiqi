import { useEffect } from 'react';
import { AnimatePresence, motion } from '@/lib/motion';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type ToastEntry, type ToastKind } from '@/store/toastStore';

const KIND_ICON: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'bg-teal text-on-accent',
  error: 'bg-red-600 text-white',
  info: 'bg-gold text-text-primary',
  warning: 'bg-amber-500 text-white',
};

function ToastCard({ entry }: { entry: ToastEntry }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = KIND_ICON[entry.kind];

  useEffect(() => {
    const dur = entry.durationMs ?? 3000;
    if (!dur) return undefined;
    const timer = setTimeout(() => dismiss(entry.id), dur);
    return () => clearTimeout(timer);
  }, [dismiss, entry.durationMs, entry.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={[
        'pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-[var(--shadow-lg)] min-w-[260px] max-w-[420px]',
        KIND_STYLES[entry.kind],
      ].join(' ')}
      role="status"
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0 opacity-95" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{entry.title}</p>
        {entry.body ? (
          <p className="text-xs opacity-90 mt-0.5 leading-snug">{entry.body}</p>
        ) : null}
        {entry.action ? (
          <button
            type="button"
            onClick={() => {
              entry.action?.onPress();
              dismiss(entry.id);
            }}
            className="text-xs font-bold underline mt-2 opacity-95"
          >
            {entry.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="إغلاق"
        onClick={() => dismiss(entry.id)}
        className="opacity-80 hover:opacity-100 shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

/**
 * Toaster container — render once at the App root. Reads from `useToastStore`.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      className="fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} entry={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
