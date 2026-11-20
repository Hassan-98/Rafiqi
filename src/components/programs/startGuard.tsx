import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/store/toastStore';
import { MAX_RUNNING, WARN_RUNNING } from '@/store/programsModel';
import { STEADY_HADITH } from '@/data/programsCatalog';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { isRunning, useProgramEvals } from './programsUi';

/**
 * Taking on too much: past MAX_RUNNING a new program is refused; from
 * WARN_RUNNING on, starting one asks first.
 */
export function useStartGuard() {
  const { runs, evals } = useProgramEvals();
  const running = runs.filter((r) => isRunning(r.status, evals.get(r.id)));
  const [pending, setPending] = useState<null | (() => void)>(null);
  const blocked =
    running.length >= MAX_RUNNING ? `تحمل ${ar(running.length)} برامج، وهذا أقصى ما يحمله رفيقي معاً. أتمّ أحدها أو أوقفه أولاً.` : null;

  const request = (go: () => void) => {
    if (blocked) {
      toast.warning('برامجك كثيرة الآن', blocked);
      return;
    }
    if (running.length >= WARN_RUNNING) setPending(() => go);
    else go();
  };

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      title={`معك ${ar(running.length)} برامج جارية`}
      message={
        <span className="text-pretty">
          «{STEADY_HADITH.text}» ({STEADY_HADITH.ref}). ابدأ الجديد إن كنت تقدر على الثبات عليه مع ما بدأت، وإلا فأتمّ ما بين يديك أولاً.
        </span>
      }
      confirmLabel="ابدأ على بركة الله"
      cancelLabel="ليس الآن"
      onConfirm={() => {
        const go = pending;
        setPending(null);
        go?.();
      }}
      onCancel={() => setPending(null)}
    />
  );

  return { running, blocked, request, dialog };
}
