import { useState } from 'react';
import { Check, MessageCircle, Phone, Plus, Stethoscope } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { toast } from '@/store/toastStore';
import { relationLabel, type ContactType } from '@/data/silatContent';
import { dueText, displayName, isFemale, type Person, type PersonStatus } from '@/store/silatModel';
import { followUpType, pickContact } from '@/services/silatPhone';
import { viaWhatsApp } from '@/store/silatPhoneModel';
import { LinkOut, STATE_TEXT, StatusAvatar, telHref, waHref } from './silatUi';
import { useCanPick } from './PersonFields';
import { PersonFormSheet } from './PersonFormSheet';

const ACTION = 'w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors duration-200';

/**
 * One person on the list: the avatar in its rhythm arc, where they stand, and
 * the quick actions — call and WhatsApp (when there is a number and that is a
 * way you reach them) open the log afterwards (a call not when the call log
 * records it by itself); ✓ logs straight away. Without a number, «أضف رقماً»:
 * the contact picker on Android, the edit sheet elsewhere.
 */
export function PersonRow({
  person,
  status,
  sub,
  onOpen,
  onLog,
}: {
  person: Person;
  status?: PersonStatus;
  /** Replaces the due line (e.g. for the deceased). */
  sub?: string;
  onOpen: () => void;
  onLog: (suggest?: ContactType) => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const canPick = useCanPick();
  // null until first opened, so the sheet mounts only when used (and keeps its exit animation after).
  const [editing, setEditing] = useState<boolean | null>(null);
  const name = displayName(person, gender);
  const rel = relationLabel(person.relation, gender);
  const ch = person.channels ?? [];
  const phone = person.deceased ? '' : (person.phone ?? '');
  const showCall = !!phone && (!ch.length || ch.includes('call'));
  const showWa = !!phone && viaWhatsApp(ch);
  const wantsNumber = !person.deceased && !phone && (ch.includes('call') || viaWhatsApp(ch));

  const addNumber = async () => {
    if (!canPick) return setEditing(true);
    const c = await pickContact();
    if (!c) return;
    useSilatStore.getState().updatePerson(person.id, { phone: c.phone, ...(person.name.trim() || !c.name ? {} : { name: c.name }) });
    toast.success('أُضيف الرقم');
  };

  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-inner)] ps-1.5 pe-1 py-1.5 hover:bg-teal/5 transition-colors duration-200">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-start py-1 rounded-xl">
        <StatusAvatar person={person} status={status} size={50} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{name}</span>
            {person.ill ? <Stethoscope size={13} className="shrink-0 text-danger" aria-label="مريض" /> : null}
          </span>
          <span className="block text-[12px] leading-snug truncate">
            {sub ? (
              <span className="text-text-muted">{sub}</span>
            ) : status ? (
              <span className={['font-semibold', STATE_TEXT[status.state]].join(' ')}>{dueText(status, isFemale(person, gender))}</span>
            ) : null}
            {name !== rel ? <span className="text-text-muted"> · {rel}</span> : null}
          </span>
        </span>
      </button>
      {wantsNumber ? (
        <button
          type="button"
          onClick={() => void addNumber()}
          aria-label={`أضف رقم ${name}`}
          className="min-h-10 px-2.5 rounded-xl inline-flex items-center gap-1 shrink-0 text-[12px] font-semibold text-teal dark:text-teal-light border border-dashed border-teal/35 dark:border-teal-light/30 hover:bg-teal/5 transition-colors duration-200"
        >
          <Plus size={13} aria-hidden />
          أضف رقماً
        </button>
      ) : null}
      {showCall ? (
        <LinkOut
          href={telHref(phone)}
          label={`اتصل ب${name}`}
          onOpen={() => {
            const t = followUpType('call');
            if (t) onLog(t);
          }}
          className={[ACTION, 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light hover:bg-teal/15'].join(' ')}
        >
          <Phone size={17} aria-hidden />
        </LinkOut>
      ) : null}
      {showWa ? (
        <LinkOut
          href={waHref(phone)}
          label={`راسل ${name} على واتساب`}
          onOpen={() => onLog('message')}
          className={[ACTION, 'bg-green-600/12 text-green-700 dark:text-green-400 hover:bg-green-600/20'].join(' ')}
        >
          <MessageCircle size={17} aria-hidden />
        </LinkOut>
      ) : null}
      <button
        type="button"
        onClick={() => onLog()}
        aria-label={`سجّل صلة ${name}`}
        className={[ACTION, status?.state === 'done' ? 'bg-teal text-on-accent' : 'bg-cream-dark/70 dark:bg-white/[0.07] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10 hover:text-teal'].join(' ')}
      >
        <Check size={18} strokeWidth={2.4} aria-hidden />
      </button>
      {editing !== null ? <PersonFormSheet open={editing} person={person} onClose={() => setEditing(false)} /> : null}
    </li>
  );
}
