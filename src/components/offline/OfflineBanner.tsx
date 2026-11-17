import { Link } from 'react-router';
import { Wifi, WifiOff, Signal, Download } from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { useNetworkStatus, type NetStatus } from './useNetworkStatus';
import { downloadsHref, openDownloads, OFFLINE_COPY, type OfflineKind } from './offlineNotice';

/** Small pill: متصل · Wi-Fi / بيانات الجوال / دون اتصال. */
export function NetworkBadge({ status, className = '' }: { status?: NetStatus; className?: string }) {
  const live = useNetworkStatus();
  const st = status ?? live;
  const off = !st.connected;
  const Icon = off ? WifiOff : st.type === 'cellular' ? Signal : Wifi;
  const label = off ? 'دون اتصال' : st.type === 'cellular' ? 'بيانات الجوال' : st.type === 'wifi' ? 'متصل · Wi-Fi' : 'متصل';
  return (
    <span
      role="status"
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
        off ? 'bg-warning/15 text-warning' : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light',
        className,
      ].join(' ')}
    >
      <Icon size={13} aria-hidden />
      {label}
    </span>
  );
}

/**
 * App-wide offline strip. Renders nothing while online. Mount it once in the
 * app shell (top of the page content); it links to the downloads center.
 */
export function OfflineBanner({ className = '' }: { className?: string }) {
  const { connected } = useNetworkStatus();
  return (
    <AnimatePresence>
      {!connected ? (
        <motion.div
          key="offline-banner"
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={[
            'flex items-center gap-2.5 rounded-[var(--radius-inner)] px-3.5 py-2.5',
            'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)]',
            className,
          ].join(' ')}
        >
          <span className="w-8 h-8 rounded-xl bg-warning/15 text-warning inline-flex items-center justify-center shrink-0">
            <WifiOff size={15} aria-hidden />
          </span>
          <p className="flex-1 min-w-0 text-[12.5px] leading-snug text-text-secondary dark:text-text-on-dark/80">
            <span className="font-semibold text-text-primary dark:text-text-on-dark">أنت دون اتصال.</span> الأذكار
            والمواقيت وما نزّلته يعمل كالمعتاد
          </p>
          <Link
            to={downloadsHref()}
            className="shrink-0 min-h-11 inline-flex items-center px-2 text-[12.5px] font-semibold text-teal dark:text-teal-light"
          >
            التنزيلات
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Inline replacement for "check your connection" errors when a resource isn't downloaded. */
export function OfflineHint({ kind, className = '' }: { kind: OfflineKind; className?: string }) {
  const c = OFFLINE_COPY[kind];
  return (
    <div className={['flex flex-col items-center gap-2.5 text-center px-4', className].join(' ')}>
      <span className="w-11 h-11 rounded-2xl bg-warning/15 text-warning inline-flex items-center justify-center">
        <WifiOff size={19} aria-hidden />
      </span>
      <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark text-balance">{c.title}</p>
      <p className="text-[12.5px] text-text-secondary dark:text-text-on-dark/75 text-pretty">{c.body}</p>
      <Button variant="soft" size="sm" leftIcon={<Download size={15} />} onClick={() => openDownloads(kind)}>
        نزّله الآن
      </Button>
    </div>
  );
}
