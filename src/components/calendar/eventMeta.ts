import { Sparkles, Moon, Utensils, BookOpen, Target, ListChecks, GraduationCap, CheckCircle2, type LucideIcon } from 'lucide-react';
import type { CalendarEventType } from '@/services/calendarEvents';

/** Per-type label, icon and chip colours (tokens only). */
export const EVENT_META: Record<CalendarEventType, { label: string; Icon: LucideIcon; chip: string }> = {
  occasion: { label: 'مناسبة', Icon: Sparkles, chip: 'bg-gold/15 text-gold-dark dark:bg-gold/20 dark:text-gold-light' },
  season: { label: 'موسم', Icon: Moon, chip: 'bg-gold/10 text-gold-dark dark:bg-gold/15 dark:text-gold-light' },
  fasting: { label: 'صيام مستحب', Icon: Utensils, chip: 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-light' },
  friday: { label: 'الجمعة', Icon: BookOpen, chip: 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-light' },
  wird: { label: 'وِرد', Icon: Target, chip: 'bg-cream-dark/70 text-text-secondary dark:bg-dark-surface dark:text-text-on-dark/80' },
  task: { label: 'مهمة', Icon: ListChecks, chip: 'bg-cream-dark/70 text-text-secondary dark:bg-dark-surface dark:text-text-on-dark/80' },
  study: { label: 'درس', Icon: GraduationCap, chip: 'bg-cream-dark/70 text-text-secondary dark:bg-dark-surface dark:text-text-on-dark/80' },
  worship: { label: 'سجلّك', Icon: CheckCircle2, chip: 'bg-teal/10 text-teal dark:bg-teal/20 dark:text-teal-light' },
};
