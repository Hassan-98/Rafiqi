import { useSearchParams } from 'react-router';
import { motion } from '@/lib/motion';
import { Target as TargetIcon, MoonStar } from 'lucide-react';
import { AwradPanel } from '@/components/targets/AwradPanel';
import { QiyamModule } from '@/components/modules/QiyamModule';
import { isQiyamTime } from '@/components/qiyam/nightWindow';

type Tab = 'awrad' | 'qiyam';
const TABS: { id: Tab; label: string; Icon: typeof MoonStar }[] = [
  { id: 'awrad', label: 'الأوراد', Icon: TargetIcon },
  { id: 'qiyam', label: 'قيام الليل', Icon: MoonStar },
];
const dateFmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * «وِرد وقيام» tab: the user's أوراد and قيام الليل in one hub. The segment
 * lives in the URL (?tab=qiyam); without it the tab opens on قيام between
 * Isha and Fajr, on الأوراد otherwise.
 */
export function TargetsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'qiyam' || raw === 'awrad' ? raw : isQiyamTime() ? 'qiyam' : 'awrad';

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-xs text-text-muted">{dateFmt.format(new Date())}</p>
        <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark">وِرد وقيام</h1>
        <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
          أورادك اليومية وقيام ليلك، في مكان واحد
        </p>
      </header>

      <div role="tablist" aria-label="القسم" className="grid grid-cols-2 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 -mt-2">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams({ tab: id }, { replace: true })}
              className={[
                'min-h-11 rounded-xl inline-flex items-center justify-center gap-2 text-sm font-bold transition-[background-color,color,box-shadow] duration-200',
                on
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              <Icon size={16} /> {label}
            </button>
          );
        })}
      </div>

      <motion.div
        key={tab}
        role="tabpanel"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        {tab === 'qiyam' ? <QiyamModule /> : <AwradPanel />}
      </motion.div>
    </div>
  );
}
