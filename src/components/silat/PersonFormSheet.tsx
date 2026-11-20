import { useEffect, useState } from 'react';
import { Lock, Plus, Trash2, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextArea, TextInput } from '@/components/ui/TextInput';
import { Toggle } from '@/components/ui/Toggle';
import { Field, Pill, fieldClass } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import {
  CATEGORIES,
  CATEGORY_SHORT,
  categoryOfRelation,
  isFemaleRelation,
  relationLabel,
  relationOf,
  relationsFor,
  withPronoun,
  type ContactType,
} from '@/data/silatContent';
import { DEFAULT_PREFS, baselineFor, type Occasion, type Person, type SinceChoice } from '@/store/silatModel';
import { dayKey } from '@/store/studyModel';
import { intlPhone } from '@/store/silatPhoneModel';
import { toast } from '@/store/toastStore';
import { TONES } from './silatUi';
import { ChannelChips, PhoneInput, PlanChips, SinceChips } from './PersonFields';

const makeId = () => Math.random().toString(36).slice(2, 9);
/** The kin dropdown's headings, by `Relation.row`. */
const KIN_ROWS = ['الأسرة', 'الأعمام والعمّات والأخوال والخالات', 'أبناء الإخوة والأخوات', 'أبناء العمومة والخؤولة', 'الرضاعة وغيرهم'];

interface Draft {
  relation: string;
  name: string;
  everyDays: number;
  weekday?: number;
  /** Adding only: «متى وصلته آخر مرة؟». */
  since: SinceChoice;
  channels: ContactType[];
  phone: string;
  birthday: string;
  occasions: Occasion[];
  notes: string;
  tone: number;
  deceased: boolean;
  ill: boolean;
  remind: boolean;
  remindTime: string;
}

const fromPerson = (p: Person | null, relation: string, digestTime: string): Draft => ({
  relation: p?.relation ?? relation,
  name: p?.name ?? '',
  everyDays: p?.everyDays ?? relationOf(relation)?.everyDays ?? 30,
  weekday: p?.weekday,
  since: 'soon',
  channels: p?.channels ?? [],
  phone: p?.phone ?? '',
  birthday: p?.birthday ?? '',
  occasions: p?.occasions ?? [],
  notes: p?.notes ?? '',
  tone: p?.tone ?? Math.floor(Math.random() * TONES.length),
  deceased: !!p?.deceased,
  ill: !!p?.ill,
  remind: !!p?.remind,
  remindTime: p?.remindTime ?? digestTime,
});

/**
 * Add or edit a person. `person` = edit; otherwise a new one, its relation
 * preset by `relation` (the rhythm follows the relation until changed).
 */
export function PersonFormSheet({
  open,
  person,
  relation = 'mother',
  onClose,
  onSaved,
}: {
  open: boolean;
  person: Person | null;
  relation?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const digestTime = useSilatStore((s) => s.prefs.digestTime) ?? DEFAULT_PREFS.digestTime;
  const addPerson = useSilatStore((s) => s.addPerson);
  const updatePerson = useSilatStore((s) => s.updatePerson);
  const removePerson = useSilatStore((s) => s.removePerson);
  const [d, setD] = useState<Draft>(() => fromPerson(person, relation, digestTime));
  const [rhythmTouched, setRhythmTouched] = useState(false);
  const [occ, setOcc] = useState({ label: '', date: '', yearly: true });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD(fromPerson(person, relation, digestTime));
    setRhythmTouched(!!person);
    setOcc({ label: '', date: '', yearly: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.id, relation]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const pickRelation = (id: string) =>
    setD((x) => ({
      ...x,
      relation: id,
      everyDays: rhythmTouched ? x.everyDays : relationOf(id)?.everyDays ?? x.everyDays,
    }));
  const setPlan = (everyDays: number, weekday: number | undefined) => {
    setRhythmTouched(true);
    setD((x) => ({ ...x, everyDays, weekday }));
  };
  const addOccasion = () => {
    if (!occ.label.trim() || !occ.date) return;
    set('occasions', [
      ...d.occasions,
      {
        id: makeId(),
        label: occ.label.trim(),
        date: occ.date,
        yearly: occ.yearly,
      },
    ]);
    setOcc({ label: '', date: '', yearly: true });
  };

  const save = () => {
    const everyDays = Math.max(1, Math.round(d.everyDays) || 1);
    const data = {
      relation: d.relation,
      name: d.name.trim(),
      everyDays,
      weekday: everyDays >= 7 ? d.weekday : undefined,
      channels: d.channels.length ? d.channels : undefined,
      phone: d.phone.trim() ? intlPhone(d.phone) : undefined, // Egypt by default: 011… → +2011…
      birthday: d.birthday || undefined,
      occasions: d.occasions.length ? d.occasions : undefined,
      notes: d.notes.trim() || undefined,
      tone: d.tone,
      deceased: d.deceased || undefined,
      ill: (!d.deceased && d.ill) || undefined,
      remind: (!d.deceased && d.remind) || undefined,
      remindTime: d.remind ? d.remindTime : undefined,
    };
    if (person) {
      updatePerson(person.id, data);
      toast.success('حُفظت التعديلات');
      onSaved?.(person.id);
    } else {
      const id = addPerson({
        ...data,
        baseline: d.deceased ? undefined : baselineFor(d.since, dayKey(Date.now()), everyDays),
      });
      toast.success('أُضيف، بارك الله في صلتك');
      onSaved?.(id);
    }
    onClose();
  };

  // A legacy relation shows only on the person who has it (so it reads as picked).
  const rels = relationsFor(gender, person?.relation);
  const label = (id: string) => relationLabel(id, gender);
  const fem = isFemaleRelation(d.relation, gender);

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={person ? 'تعديل' : 'إضافة شخص'}>
        <div className="flex flex-col gap-5">
          {/* Owner 2026-11-19: two dropdowns, so the sheet stays short. */}
          <div role="group" aria-label="صلة القرابة" className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">صلة القرابة</span>
            <div className="grid grid-cols-[2fr_3fr] gap-2">
              <select
                aria-label="الفئة"
                value={categoryOfRelation(d.relation)}
                onChange={(e) => {
                  const first = rels.find((r) => r.category === e.target.value);
                  if (first) pickRelation(first.id);
                }}
                className={fieldClass}
              >
                {CATEGORIES.filter((c) => rels.some((r) => r.category === c)).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_SHORT[c]}
                  </option>
                ))}
              </select>
              <select aria-label="القرابة" value={d.relation} onChange={(e) => pickRelation(e.target.value)} className={fieldClass}>
                {(() => {
                  const inCat = rels.filter((r) => r.category === categoryOfRelation(d.relation));
                  const rows = [...new Set(inCat.map((r) => r.row ?? 0))];
                  const opts = (row: number) =>
                    inCat
                      .filter((r) => (r.row ?? 0) === row)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {label(r.id)}
                        </option>
                      ));
                  return rows.length > 1
                    ? rows.map((row) => (
                        <optgroup key={row} label={KIN_ROWS[row] ?? ''}>
                          {opts(row)}
                        </optgroup>
                      ))
                    : opts(rows[0] ?? 0);
                })()}
              </select>
            </div>
          </div>

          <Field label="الاسم" hint="اتركه فارغاً ليظهر باسم القرابة">
            <TextInput value={d.name} onValueChange={(v) => set('name', v)} className={fieldClass} placeholder={label(d.relation)} />
          </Field>

          <Toggle checked={d.deceased} onChange={(v) => set('deceased', v)} label="انتقل إلى رحمة الله" />

          <div className="flex flex-col gap-4 rounded-[var(--radius-inner)] bg-teal/[0.05] dark:bg-teal/[0.08] p-3">
            <PlanChips
              label={withPronoun(d.deceased ? 'كم مرة تدعو ل{ه} أو تتصدّق عن{ه}؟' : 'خطة الصلة: كم مرة تصل{ه}؟', fem)}
              every={d.everyDays}
              weekday={d.weekday}
              onChange={setPlan}
            />
            {!person && !d.deceased ? (
              <SinceChips label={withPronoun('متى وصلت{ه} آخر مرة؟', fem)} value={d.since} onChange={(v) => set('since', v)} />
            ) : null}
          </div>

          {!d.deceased ? (
            <>
              <ChannelChips label="طريقة الصلة المفضّلة" value={d.channels} onChange={(v) => set('channels', v)} />

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">رقم الهاتف</span>
                {/* The contact's number always; its name only into an empty field (never over what you typed). */}
                <PhoneInput
                  value={d.phone}
                  onChange={(v) => set('phone', v)}
                  onPickedName={(n) => setD((x) => (x.name.trim() ? x : { ...x, name: n }))}
                />
                <span className="text-[11px] text-text-muted">الأرقام المصرية تكفي كما هي (٠١١…)، ولغير مصر اكتب مفتاح الدولة (+٩٦٦…)</span>
              </div>

              {/* Owner 2026-11-19: not when adding (a short sheet) — from «تعديل» later. */}
              {person ? (
                <>
                  <Field label="تاريخ الميلاد (اختياري)">
                    <input type="date" value={d.birthday} onChange={(e) => set('birthday', e.target.value)} className={fieldClass} />
                  </Field>

                  <Field label="مناسبات" hint="عملية جراحية، قدوم مولود، سفر، ذكرى سنوية… يصلك تذكير صباح يومها">
                    <div className="flex flex-col gap-2">
                      {d.occasions.map((o) => (
                        <div key={o.id} className="flex items-center gap-2 rounded-xl bg-cream-dark/40 dark:bg-white/[0.04] ps-3 pe-1 py-1">
                          <span className="flex-1 min-w-0 text-[13px] text-text-primary dark:text-text-on-dark truncate">
                            {o.label} · <span className="text-text-muted font-counter tabular-nums">{o.yearly ? o.date.slice(5) : o.date}</span>
                            {o.yearly ? <span className="text-text-muted"> · كل سنة</span> : null}
                          </span>
                          <button
                            type="button"
                            aria-label={`حذف ${o.label}`}
                            onClick={() =>
                              set(
                                'occasions',
                                d.occasions.filter((x) => x.id !== o.id)
                              )
                            }
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-muted hover:text-danger hover:bg-danger/10"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <TextInput
                          value={occ.label}
                          onValueChange={(v) => setOcc((o) => ({ ...o, label: v }))}
                          className={fieldClass}
                          placeholder="اسم المناسبة"
                          aria-label="اسم المناسبة"
                        />
                        <input
                          type="date"
                          value={occ.date}
                          onChange={(e) => setOcc((o) => ({ ...o, date: e.target.value }))}
                          className={[fieldClass, 'w-40'].join(' ')}
                          aria-label="تاريخ المناسبة"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill active={occ.yearly} onClick={() => setOcc((o) => ({ ...o, yearly: !o.yearly }))}>
                          تتكرر كل سنة
                        </Pill>
                        <Button
                          variant="soft"
                          size="sm"
                          leftIcon={<Plus size={15} />}
                          onClick={addOccasion}
                          disabled={!occ.label.trim() || !occ.date}
                        >
                          أضف المناسبة
                        </Button>
                      </div>
                    </div>
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          <Field label="ملاحظات" hint="صحته، حاجاته، أسماء أولاده، ما يحب…">
            <TextArea value={d.notes} onValueChange={(v) => set('notes', v)} rows={3} className={fieldClass} />
          </Field>

          <Field label="اللون">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="لون الصورة">
              {TONES.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={d.tone === i}
                  aria-label={`لون ${i + 1}`}
                  onClick={() => set('tone', i)}
                  className={[
                    'w-9 h-9 rounded-full',
                    t,
                    d.tone === i ? 'ring-2 ring-offset-2 ring-teal ring-offset-white dark:ring-offset-dark-surface' : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </Field>

          {!d.deceased ? (
            <div className="flex flex-col gap-3 rounded-[var(--radius-inner)] bg-cream-dark/40 dark:bg-white/[0.04] p-3">
              <Toggle checked={d.ill} onChange={(v) => set('ill', v)} label="مريض — ذكّرني بعيادته" />
              <Toggle checked={d.remind} onChange={(v) => set('remind', v)} label="تذكير خاص يوم موعد صلته" />
              {d.remind ? (
                <Field label="وقت التذكير">
                  <input
                    type="time"
                    value={d.remindTime}
                    onChange={(e) => e.target.value && set('remindTime', e.target.value)}
                    className={[fieldClass, 'w-36'].join(' ')}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          <p className="flex items-start gap-1.5 text-[11.5px] text-text-muted text-pretty">
            <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
            الرقم والملاحظات تُحفظ في حسابك الخاص فقط، ولا تُشارك مع أحد.
          </p>

          <Button fullWidth onClick={save}>
            {person ? 'حفظ' : 'إضافة'}
          </Button>
          {person ? (
            <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
              حذف من القائمة
            </Button>
          ) : null}
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف من القائمة؟"
        message="يُحذف هو وتذكيراته. يبقى سجل صلاتك السابقة محفوظاً."
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (person) removePerson(person.id);
          setConfirmDelete(false);
          onClose();
          onSaved?.('');
        }}
      />
    </>
  );
}
