import { useMemo } from 'react';
import { useEngagementStore } from '@/store/engagementStore';
import { easing, topicLabel } from '@/services/engagement';
import { rescheduleSmartNotifications } from '@/services/smartNotifications';

/**
 * «رفيقك اليومي» settings: the kinds it eased off because they went unanswered
 * (services/engagement.ts), each with «إعادته». Nothing when none is eased.
 */
export function CompanionEase() {
  const outcomes = useEngagementStore((s) => s.outcomes);
  const labels = useEngagementStore((s) => s.labels);
  const restore = useEngagementStore((s) => s.restore);
  const eased = useMemo(() => Object.keys(outcomes).filter((t) => easing(outcomes[t]) > 0), [outcomes]);
  if (!eased.length) return null;
  return (
    <ul className="flex flex-col" aria-label="تذكيرات خفّفها الرفيق">
      {eased.map((t) => {
        const label = topicLabel(t, labels);
        return (
          <li key={t} className="flex items-center gap-3 px-3 py-2">
            <p className="min-w-0 flex-1 ps-12 text-[11px] leading-relaxed text-text-muted text-pretty">
              خفّفتُ تذكير {label} لأنك لم تتفاعل معه مؤخراً
            </p>
            <button
              type="button"
              onClick={() => {
                restore(t);
                void rescheduleSmartNotifications();
              }}
              aria-label={`إعادة تذكير ${label}`}
              className="shrink-0 min-h-9 px-2 text-xs font-semibold text-teal dark:text-teal-light"
            >
              إعادته
            </button>
          </li>
        );
      })}
    </ul>
  );
}
