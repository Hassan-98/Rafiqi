import { useEffect, useMemo, useState } from 'react';
import { Check, Users } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Field, Pill, fieldClass } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { CATEGORIES, CATEGORY_SHORT, closenessOf, gatheringPoints } from '@/data/silatContent';
import { categoryOf, displayName, isLive } from '@/store/silatModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { Avatar, logGathering } from './silatUi';

/**
 * «اجتماع عائلي»: tick who was there; each gets a 'gathering' contact (their
 * rhythm is kept) worth gatheringPoints — the parents 5, uncles/aunts 4, siblings 3, the rest 1.
 */
export function GatheringSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const people = useSilatStore((s) => s.people);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [yesterday, setYesterday] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setYesterday(false);
    setNote('');
  }, [open]);

  const groups = useMemo(() => {
    const live = people.filter((p) => isLive(p) && !p.deceased).sort((a, b) => closenessOf(a.relation) - closenessOf(b.relation));
    return CATEGORIES.map((c) => ({ c, list: live.filter((p) => categoryOf(p) === c) })).filter((g) => g.list.length);
  }, [people]);
  const chosen = groups.flatMap((g) => g.list).filter((p) => picked.has(p.id));
  const total = chosen.reduce((n, p) => n + gatheringPoints(p.relation), 0);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const save = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1); // local calendar math (DST-safe), same clock time
    logGathering(chosen, { note: note.trim() || undefined, at: yesterday ? y.getTime() : undefined });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="اجتماع عائلي">
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-text-muted text-pretty">
          اختر من لقيتَ، فتُحسب صلةً لكلٍّ منهم: الوالدان +{ar(4)}، الإخوة +{ar(3)}، وباقي الأرحام +{ar(1)} لكل واحد.
        </p>

        {groups.map(({ c, list }) => (
          <div key={c} role="group" aria-label={CATEGORY_SHORT[c]} className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold text-text-muted">{CATEGORY_SHORT[c]}</span>
            <div className="flex flex-wrap gap-1.5">
              {list.map((p) => {
                const on = picked.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={[
                      'inline-flex items-center gap-2 min-h-11 ps-1.5 pe-3 rounded-xl ring-1 transition-[background-color,box-shadow] duration-200 ease-out-soft',
                      on
                        ? 'bg-teal/10 ring-teal/50 dark:bg-teal/15 dark:ring-teal-light/50'
                        : 'bg-white dark:bg-dark-card ring-black/[0.05] dark:ring-white/[0.07] hover:bg-teal/5',
                    ].join(' ')}
                  >
                    <span className="relative inline-flex">
                      <Avatar person={p} size={30} />
                      {on ? (
                        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-teal text-on-accent inline-flex items-center justify-center ring-2 ring-white dark:ring-dark-card" aria-hidden>
                          <Check size={10} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[13px] font-semibold text-text-primary dark:text-text-on-dark">{displayName(p, gender)}</span>
                    <span className="font-counter tabular-nums text-[11px] font-bold text-gold-dark dark:text-gold-light">+{ar(gatheringPoints(p.relation))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-1.5">
          <Pill active={!yesterday} onClick={() => setYesterday(false)}>
            اليوم
          </Pill>
          <Pill active={yesterday} onClick={() => setYesterday(true)}>
            أمس
          </Pill>
        </div>
        <Field label="ملاحظة (اختياري)">
          <TextInput value={note} onValueChange={setNote} className={fieldClass} placeholder="عند جدّتي، عزومة العيد…" />
        </Field>

        <Button fullWidth disabled={!chosen.length} leftIcon={<Users size={18} />} onClick={save}>
          {chosen.length ? `سجّل الاجتماع (+${ar(total)})` : 'اختر من حضر'}
        </Button>
      </div>
    </BottomSheet>
  );
}
