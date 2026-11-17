import { useNavigate } from 'react-router';
import { Trophy } from 'lucide-react';
import { Star8 } from '@/components/ui/Ornament';
import { StatsPanel } from './StatsPanel';

export interface RecordItem {
  id: string;
  label: string;
  value: string;
  when?: string;
  to?: string;
}

interface RecordsPanelProps {
  records: RecordItem[];
  title?: string;
  subtitle?: string;
  emptyText?: string;
  /** Tapping a record opens its section (landing wall). */
  linkable?: boolean;
}

/**
 * Personal bests — a small "records wall": the first record gets the wide
 * gold-rimmed tile, the rest sit in a two-column grid.
 */
export function RecordsPanel({
  records,
  title = 'أرقامك القياسية',
  subtitle = 'أفضل ما حقّقته منذ بدأت',
  emptyText = 'تظهر أرقامك القياسية مع استمرارك.',
  linkable = false,
}: RecordsPanelProps) {
  const navigate = useNavigate();
  return (
    <StatsPanel title={title} subtitle={subtitle} icon={<Trophy size={16} />}>
      {records.length === 0 ? (
        <p className="text-[12px] text-text-muted text-center py-4">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {records.map((r, i) => {
            const wide = i === 0 && records.length % 2 === 1;
            const clickable = linkable && !!r.to;
            return (
              <button
                key={r.id}
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => navigate(r.to!) : undefined}
                className={[
                  'relative text-start rounded-[var(--radius-inner)] p-3 ring-1 overflow-hidden min-w-0',
                  i === 0
                    ? 'bg-[image:var(--gradient-gold-soft)] ring-gold/30'
                    : 'bg-cream-dark/45 dark:bg-dark-surface ring-black/[0.03] dark:ring-white/[0.05]',
                  wide ? 'col-span-2' : '',
                  clickable ? 'hover:ring-gold/40 transition-shadow' : 'cursor-default',
                ].join(' ')}
              >
                <Star8 size={i === 0 ? 34 : 26} className="absolute -top-1.5 -end-1.5 text-gold opacity-15" />
                <span className="block text-[11px] text-text-muted leading-tight">{r.label}</span>
                <span
                  className={[
                    'block mt-1 font-counter font-bold tabular-nums leading-tight',
                    i === 0 ? 'text-xl text-gold-dark dark:text-gold-light' : 'text-base text-text-primary dark:text-text-on-dark',
                  ].join(' ')}
                >
                  {r.value}
                </span>
                {r.when ? <span className="block mt-0.5 text-[10px] text-text-muted">{r.when}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </StatsPanel>
  );
}
