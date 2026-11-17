import type { ComponentProps } from 'react';
import { SectionTitle } from '@/components/ui/Ornament';
import type { InsightDomain } from '@/services/insightsService';
import { InsightList } from './InsightList';
import { StreakPanel } from './StreakPanel';

interface SectionLeadProps {
  domain: InsightDomain;
  streak?: ComponentProps<typeof StreakPanel>;
  limit?: number;
  title?: string;
}

/**
 * The period-independent lead of every section's stats page: the live
 * streak (current vs best) and the engine's insights for that section.
 */
export function SectionLead({ domain, streak, limit = 5, title = 'ما يلفت في أدائك' }: SectionLeadProps) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title={title} subtitle="سلسلتك وملاحظات محرّك الإنجازات" />
      {streak ? <StreakPanel {...streak} /> : null}
      <InsightList domain={domain} limit={limit} />
    </section>
  );
}
