import { useNavigate } from 'react-router';
import { BarChart3 } from 'lucide-react';

/**
 * Small round icon button that jumps from inside a section to ITS stats page
 * (e.g. الأذكار → /stats/dhikr) — every section exposes its numbers one tap
 * away instead of burying them behind المزيد → الإحصائيات.
 */
export function StatsShortcut({ to, label = 'إحصائيات القسم' }: { to: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      aria-label={label}
      title={label}
      className="p-2 rounded-full hover:bg-teal/10 text-teal dark:text-teal-light transition-colors min-w-10 min-h-10 inline-flex items-center justify-center"
    >
      <BarChart3 size={18} strokeWidth={2.2} />
    </button>
  );
}
