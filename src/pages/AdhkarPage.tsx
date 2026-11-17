import { DhikrModule } from '@/components/modules/DhikrModule';
import { StatsShortcut } from '@/components/stats/StatsShortcut';

/** The الأذكار tab: page header, then the picker (hero · insights · sets);
 *  an opened set takes over the screen as a focused reader. */
export function AdhkarPage() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-nav">
      <header className="flex items-end justify-between gap-3" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
        <div className="min-w-0">
          <p className="text-xs text-text-muted">حصن المسلم في يومه وليلته</p>
          <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark">الأذكار</h1>
        </div>
        <StatsShortcut to="/stats/dhikr" label="إحصائيات الأذكار" />
      </header>
      <DhikrModule />
    </div>
  );
}
