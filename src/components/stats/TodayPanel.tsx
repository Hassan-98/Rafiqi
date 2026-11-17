import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Star8 } from '@/components/ui/Ornament';
import { toArabicDigits, ARABIC_MONTHS, WEEKDAY_LABELS_AR } from '@/services/statsService';

interface TodayPanelProps {
  children: ReactNode;
  /** Optional small node on the end of the header row (e.g. a live chip). */
  badge?: ReactNode;
  /** Override the eyebrow (default «اليوم»). */
  title?: string;
}

/**
 * The "اليوم أولاً" snapshot card every stats sub-page leads with: the warm
 * ornate panel (gold ring + lattice) + today's Arabic date, content fully
 * custom per domain (prayer chips, live wird bars, set rings…).
 */
export function TodayPanel({ children, badge, title = 'اليوم' }: TodayPanelProps) {
  const now = new Date();
  const dateLabel = `${WEEKDAY_LABELS_AR[now.getDay()]} ${toArabicDigits(now.getDate())} ${ARABIC_MONTHS[now.getMonth()]}`;
  return (
    <Card variant="gradient-edge" className="p-4">
      <div className="relative flex items-center gap-2 mb-3">
        <Star8 size={12} className="text-gold shrink-0" />
        <span className="text-sm font-display font-bold text-teal dark:text-teal-light">{title}</span>
        <span className="text-[11px] text-text-muted">{dateLabel}</span>
        <span className="flex-1" />
        {badge}
      </div>
      <div className="relative">{children}</div>
    </Card>
  );
}
