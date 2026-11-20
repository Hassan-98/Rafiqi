import { useNavigate } from 'react-router';
import { ChevronLeft, NotebookPen, Target } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif } from '@/components/ui/Ornament';
import { useNow } from '@/components/study/studyUi';
import { homeCardState } from '@/services/fridayReview';
import { useFridayReviewStore } from '@/store/fridayReviewStore';

/**
 * Home: «محاسبة الجمعة جاهزة» from Thursday evening through Saturday; the rest
 * of the week, this week's focus (chosen in the last review). Nothing otherwise.
 */
export function FridayReviewHomeCard() {
  const navigate = useNavigate();
  const reviews = useFridayReviewStore((s) => s.reviews);
  const now = useNow(60_000);
  const st = homeCardState({ reviews }, new Date(now));
  if (!st) return null;
  const open = () => navigate('/friday-review');

  if (st.kind === 'ready') {
    return (
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="relative flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center">
            <NotebookPen size={20} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-text-muted">وقفة آخر الأسبوع</p>
            <h3 className="text-[17px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">محاسبة الجمعة جاهزة</h3>
            <p className="mt-1 font-quran text-[15px] leading-loose text-text-secondary dark:text-text-on-dark/80">﴿وَلْتَنظُرْ نَفْسٌ مَّا قَدَّمَتْ لِغَدٍ﴾</p>
          </div>
        </div>
        <Button variant="primary" size="sm" className="relative mt-3" onClick={open}>
          ابدأ المحاسبة
        </Button>
      </Card>
    );
  }

  const text = st.kind === 'focus' ? `عزمك هذا الأسبوع: ${st.focus.text}` : 'أتممت محاسبة هذا الأسبوع — تقبّل الله';
  return (
    <Card pressable onClick={open} className="p-1.5">
      <div className="flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 hover:bg-teal/5">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center">
          {st.kind === 'done' ? <NotebookPen size={18} aria-hidden /> : <Target size={18} aria-hidden />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-text-muted">محاسبة الجمعة</span>
          <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark truncate">{text}</span>
        </span>
        <ChevronLeft size={18} className="text-text-muted shrink-0" aria-hidden />
      </div>
    </Card>
  );
}
