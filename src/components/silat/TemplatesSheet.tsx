import type { ReactNode } from 'react';
import { MessageCircle, Share2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSettingsStore } from '@/store/settingsStore';
import type { ContactType, MessageTemplate } from '@/data/silatContent';
import { displayName, templatesFor, type Person } from '@/store/silatModel';
import { LinkOut, shareMessage, waHref } from './silatUi';

const ROW = 'w-full flex items-start gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-start hover:bg-teal/5 transition-colors duration-200';

function RowBody({ t, icon }: { t: MessageTemplate; icon: ReactNode }) {
  return (
    <>
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark">{t.label}</span>
        <span className="block text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/70 text-pretty line-clamp-2">{t.text}</span>
      </span>
      {icon}
    </>
  );
}

/**
 * «رسالة جاهزة»: a few warm messages (the sick and Friday ones first when they
 * fit — templatesFor). With a number, a tap opens WhatsApp with the text
 * written; without one, the share sheet. Then `onSent` opens the log sheet
 * with what was sent («سجّل رسالة / تهنئة / تعزية»).
 */
export function TemplatesSheet({ person, onClose, onSent }: { person: Person | null; onClose: () => void; onSent: (p: Person, type: ContactType) => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const phone = person && !person.deceased ? person.phone : undefined;
  return (
    <BottomSheet open={!!person} onClose={onClose} title={person ? `رسالة إلى ${displayName(person, gender)}` : ''}>
      {person ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-text-muted text-pretty">
            {phone ? 'يُفتح واتساب والرسالة مكتوبة؛ عدّلها إن شئت ثم أرسلها.' : 'تُفتح المشاركة لترسلها من أي تطبيق.'}
          </p>
          <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05] rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] p-1">
            {templatesFor(person, new Date()).map((t) => (
              <li key={t.id}>
                {phone ? (
                  <LinkOut href={waHref(phone, t.text)} label={`أرسل «${t.label}» على واتساب`} onOpen={() => onSent(person, t.type)} className={ROW}>
                    <RowBody t={t} icon={<MessageCircle size={18} className="mt-1 shrink-0 text-green-700 dark:text-green-400" aria-hidden />} />
                  </LinkOut>
                ) : (
                  <button type="button" onClick={() => void shareMessage(t.text).then((ok) => ok && onSent(person, t.type))} className={ROW}>
                    <RowBody t={t} icon={<Share2 size={17} className="mt-1 shrink-0 text-teal dark:text-teal-light" aria-hidden />} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </BottomSheet>
  );
}
