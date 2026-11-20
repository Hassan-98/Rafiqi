import { Share2, TrendingUp } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Medallion, OrnamentRule } from '@/components/ui/Ornament';
import { Sparkle } from '@/components/ui/Sparkle';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from '@/store/toastStore';
import { lengthText, shareText, type RunEval } from '@/store/programsModel';
import { COMPLETION_DUAS, daysAr } from '@/data/programsCatalog';
import { ProgramGlyph, SourceQuote } from './programsUi';

/** navigator.share, else the clipboard. */
export async function shareRun(ev: RunEval): Promise<void> {
  const text = shareText(ev);
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success('نُسخ نص الإنجاز', 'الصقه حيث تشاء');
  } catch {
    toast.info('تعذّرت المشاركة', text);
  }
}

/** The finish: a medallion, the numbers, a du'a, share and the next level. */
export function CompletionModal({
  ev,
  open,
  onClose,
  onNext,
}: {
  ev: RunEval | null;
  open: boolean;
  onClose: () => void;
  onNext: () => void;
}) {
  const female = useSettingsStore((s) => s.gender) === 'female';
  if (!ev) return null;
  const spent = ev.days.filter((d) => d.state === 'done' || d.state === 'missed').length;
  const missed = ev.days.filter((d) => d.state === 'missed').length;

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center gap-3 pt-2">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <Sparkle show={open} count={12} />
          <Medallion size={104} tone="gold">
            <ProgramGlyph icon={ev.def.icon} size={34} className="text-gold-dark dark:text-gold-light" />
          </Medallion>
        </div>
        <p className="text-xs text-text-muted">{female ? 'أتممتِ' : 'أتممتَ'} بفضل الله</p>
        <h2 className="text-xl font-display font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">{ev.def.title}</h2>

        <div className="grid grid-cols-3 gap-2 w-full">
          {[
            { v: lengthText(ev.def), l: 'البرنامج' },
            { v: daysAr(spent), l: 'أتممته في' },
            { v: missed ? daysAr(missed) : 'لا شيء', l: 'فاتك' },
          ].map((x) => (
            <div key={x.l} className="rounded-2xl bg-cream-dark/55 dark:bg-dark-surface px-2 py-2.5">
              <p className="text-[10.5px] text-text-muted">{x.l}</p>
              <p className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark text-balance">{x.v}</p>
            </div>
          ))}
        </div>

        <OrnamentRule className="w-full my-1" />
        <p className="text-[12.5px] text-text-secondary dark:text-text-on-dark/80">ادعُ بما دعا به الصالحون بعد العمل:</p>
        <div className="w-full flex flex-col gap-2 text-start">
          {COMPLETION_DUAS.slice(0, 2).map((d) => (
            <SourceQuote key={d.text} source={d} />
          ))}
        </div>

        <div className="w-full flex flex-col gap-2 mt-2">
          <Button variant="primary" fullWidth leftIcon={<TrendingUp size={16} />} onClick={onNext}>
            ابدأ المستوى التالي
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" leftIcon={<Share2 size={15} />} onClick={() => void shareRun(ev)}>
              شارك
            </Button>
            <Button variant="ghost" onClick={onClose}>
              الحمد لله
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
