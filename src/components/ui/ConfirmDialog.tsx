import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, type ButtonVariant } from '@/components/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  /** Label for the confirming action (defaults to "تأكيد"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual weight of the confirm button — use `danger` for destructive acts. */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A small yes/no dialog built on {@link Modal}, for guarding irreversible
 *  actions (completing or deleting a goal, etc.). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="flex flex-col gap-5">
        {message ? (
          <p className="text-sm leading-relaxed text-text-secondary dark:text-text-on-dark/80">{message}</p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} fullWidth onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
