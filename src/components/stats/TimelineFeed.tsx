import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import { ChevronDown } from 'lucide-react';
import { toArabicDigits } from '@/services/statsService';

export interface TimelineEvent {
  icon: ReactNode;
  color: string;
  title: string;
  detail?: ReactNode;
}

export interface TimelineGroup {
  dateKey: string;
  /** Optional Hijri / Gregorian header label. */
  hijriLabel?: string;
  gregorianLabel?: string;
  events: TimelineEvent[];
}

interface TimelineFeedProps {
  groups: TimelineGroup[];
  /** Collapse each day's events behind a tap (for the dense unified feed). */
  collapsible?: boolean;
  emptyLabel?: string;
}

/**
 * Vertical RTL timeline with date headers and per-event rows (domain icon +
 * colour + title + optional detail). Powers milestone lists, badge unlocks,
 * reading-position milestones and the unified /stats/history feed.
 */
export function TimelineFeed({ groups, collapsible = false, emptyLabel = 'لا توجد أحداث بعد' }: TimelineFeedProps) {
  if (groups.length === 0) {
    return <p className="text-sm text-text-muted text-center py-6">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <TimelineDay key={group.dateKey} group={group} collapsible={collapsible} />
      ))}
    </div>
  );
}

function TimelineDay({ group, collapsible }: { group: TimelineGroup; collapsible: boolean }) {
  const [open, setOpen] = useState(!collapsible);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        className="flex items-center justify-between gap-2 w-full text-start"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-teal dark:text-teal-light font-display">
            {group.hijriLabel ?? group.gregorianLabel ?? group.dateKey}
          </span>
          {group.hijriLabel && group.gregorianLabel ? (
            <span className="text-[11px] text-text-muted">{group.gregorianLabel}</span>
          ) : null}
          <span className="text-[10px] text-text-muted font-counter">
            ({toArabicDigits(group.events.length)})
          </span>
        </div>
        {collapsible ? (
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 ps-2 border-s-2 border-teal/15 dark:border-dark-border">
              {group.events.map((ev, i) => (
                <div key={i} className="flex items-start gap-2.5 ps-3 relative">
                  <span
                    className="absolute -start-[7px] top-1.5 w-3 h-3 rounded-full border-2 border-cream dark:border-dark-bg"
                    style={{ background: ev.color }}
                  />
                  <span className="shrink-0 mt-0.5" style={{ color: ev.color }}>
                    {ev.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary dark:text-text-on-dark">{ev.title}</p>
                    {ev.detail ? <div className="text-[12px] text-text-muted mt-0.5">{ev.detail}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
