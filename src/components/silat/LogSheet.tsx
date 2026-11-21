import { useEffect, useState } from 'react';
import { Plus, Sprout } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { Field, Pill, fieldClass } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import {
  DECEASED_TYPES, LIVING_GROUPS, RECONCILE_POINTS, T, TYPE_TEXT, pointsFor, typeLabel, type ContactType,
} from '@/data/silatContent';
import { displayName, isFemale, reconcileEntry, repairing, type Person } from '@/store/silatModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { TYPE_ICON, logContact, typeTone } from './silatUi';

/** After a call or a WhatsApp opened from a button: what it may really have been. */
const ALSO: Partial<Record<ContactType, ContactType[]>> = { call: ['video'], message: ['voice', 'video'] };

/**
 * «سجّل صلة»: one tap on a kind logs it. The kinds come in groups, the everyday
 * ones first (تواصل · زيارة ولقاء · عطاء وعون · مناسبات وإصلاح · بظهر الغيب);
 * for one who has died, the deeds that reach them. «أمس» and the optional note
 * and minutes ride along with that tap. `suggest` (after a call or a WhatsApp
 * opened from a button) puts its kind first as the main button, with its fadl.
 */
export function LogSheet({ person, suggest, onClose }: { person: Person | null; suggest?: ContactType; onClose: () => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const entries = useSilatStore((s) => s.entries);
  const [note, setNote] = useState('');
  const [mins, setMins] = useState(0);
  const [yesterday, setYesterday] = useState(false);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    if (!person) return;
    setNote('');
    setMins(0);
    setYesterday(false);
    setDetails(false);
  }, [person]);

  const female = person ? isFemale(person, gender) : false;
  const groups = person?.deceased ? [{ id: 'after', label: '', types: DECEASED_TYPES }] : LIVING_GROUPS;
  const bonus = !!person && repairing(person) && !reconcileEntry(person, entries);
  const log = (type: ContactType) => {
    if (!person) return;
    const y = new Date();
    y.setDate(y.getDate() - 1); // local calendar math (DST-safe), same clock time
    const at = yesterday ? y.getTime() : undefined;
    logContact(person, type, { note: note.trim() || undefined, durationMin: mins > 0 ? Math.round(mins) : undefined, at });
    onClose();
  };
  const hint = suggest ? TYPE_TEXT[suggest] : undefined;
  const SuggestIcon = suggest ? TYPE_ICON[suggest] : null;

  const chip = (t: ContactType) => {
    const Icon = TYPE_ICON[t];
    return (
      <button
        key={t}
        type="button"
        onClick={() => log(t)}
        className="inline-flex items-center gap-2 min-h-11 ps-1.5 pe-3 rounded-xl bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] hover:bg-teal/5 active:scale-[0.98] transition-[background-color,transform] duration-200 ease-out-soft"
      >
        <span className={['w-8 h-8 rounded-lg inline-flex items-center justify-center shrink-0', typeTone(t)].join(' ')}>
          <Icon size={16} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="text-[13px] font-semibold text-text-primary dark:text-text-on-dark">{typeLabel(t, female)}</span>
        <span className="font-counter tabular-nums text-[11px] font-bold text-gold-dark dark:text-gold-light">+{ar(pointsFor(t, person?.relation ?? ''))}</span>
      </button>
    );
  };

  return (
    <BottomSheet open={!!person} onClose={onClose} title={person ? `صلة ${displayName(person, gender)}` : ''}>
      {person ? (
        <div className="flex flex-col gap-4">
          {bonus ? (
            <div className="flex gap-2.5 rounded-[var(--radius-inner)] bg-gold/10 p-3">
              <Sprout size={17} className="mt-0.5 shrink-0 text-gold-dark dark:text-gold-light" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-gold-dark dark:text-gold-light">أول صلة بعد القطيعة أعظمها: +{ar(RECONCILE_POINTS)} فوق نقاطها</span>
                <span className="text-[11.5px] text-text-muted text-pretty">{T.wasil.text} — {T.wasil.source}</span>
              </span>
            </div>
          ) : null}

          {suggest ? (
            <div className="flex flex-col gap-2">
              <Button fullWidth leftIcon={SuggestIcon ? <SuggestIcon size={18} /> : undefined} onClick={() => log(suggest)}>
                سجّل {typeLabel(suggest, female)}
              </Button>
              {ALSO[suggest] ? (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[12px] text-text-muted">أو كانت:</span>
                  {ALSO[suggest].map(chip)}
                </div>
              ) : null}
              {hint ? <p className="text-[11.5px] text-text-muted text-center text-pretty">{hint.text} — {hint.source}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <Pill active={!yesterday} onClick={() => setYesterday(false)}>
              اليوم
            </Pill>
            <Pill active={yesterday} onClick={() => setYesterday(true)}>
              أمس
            </Pill>
            <button
              type="button"
              aria-expanded={details}
              onClick={() => setDetails((d) => !d)}
              className="ms-auto inline-flex items-center gap-1 min-h-10 px-2 rounded-xl text-[12.5px] font-semibold text-teal dark:text-teal-light hover:bg-teal/5"
            >
              <Plus size={14} aria-hidden /> ملاحظة أو مدة
            </button>
          </div>
          {details ? (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Field label="ملاحظة (اختياري)">
                  <TextInput value={note} onValueChange={setNote} className={fieldClass} placeholder="سألتُ عن صحته، وعدته بزيارة…" />
                </Field>
                <Field label="المدة (دقيقة)">
                  <NumberInput value={mins} onValueChange={setMins} min={0} max={1440} className={fieldClass} aria-label="المدة بالدقائق" />
                </Field>
              </div>
              <p className="text-[11px] text-text-muted text-pretty">ثم اضغط نوع الصلة، فتُحفظ معها.</p>
            </div>
          ) : null}

          {groups.map((g) => (
            <div key={g.id} role="group" aria-label={g.label || 'أعمال يصله أجرها'} className="flex flex-col gap-1.5">
              {g.label ? <span className="text-[11.5px] font-semibold text-text-muted">{g.label}</span> : null}
              <div className="flex flex-wrap gap-1.5">{g.types.map(chip)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </BottomSheet>
  );
}
