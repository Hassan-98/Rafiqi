import { useState } from 'react';
import { Lock, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SectionTitle } from '@/components/ui/Ornament';
import { TextArea, TextInput } from '@/components/ui/TextInput';
import { Pill, fieldClass } from '@/components/study/studyUi';
import { toArabicDigits } from '@/utils/arabicFormat';
import { CORE_QUESTIONS, QUESTION_BANK, focusSuggestions, type MuhasabaQuestion } from '@/services/fridayReviewContent';
import { questionsFor, type DomainId, type Focus } from '@/services/fridayReview';
import { useFridayReviewStore, type Kept } from '@/store/fridayReviewStore';

const EMPTY = {};

/** «هل وفّيت بعزمك؟» — about the focus chosen in last week's review. */
export function KeptPrompt({ week, focus }: { week: string; focus: Focus }) {
  const kept = useFridayReviewStore((s) => s.reviews[week]?.kept);
  const patch = useFridayReviewStore((s) => s.patch);
  const opts: { v: Kept; l: string }[] = [
    { v: 'yes', l: 'نعم، الحمد لله' },
    { v: 'partly', l: 'بعضه' },
    { v: 'no', l: 'لم أوفَّق' },
  ];
  return (
    <Card variant="gradient-edge" className="p-4">
      <p className="text-[11px] text-text-muted">عزمك للأسبوع الذي مضى</p>
      <p className="mt-1 text-[16px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">«{focus.text}»</p>
      <p className="mt-3 text-[13px] font-semibold text-text-secondary dark:text-text-on-dark/80">هل وفّيت بعزمك؟</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {opts.map((o) => (
          <Pill key={o.v} active={kept === o.v} onClick={() => patch(week, { kept: kept === o.v ? undefined : o.v })}>
            {o.l}
          </Pill>
        ))}
      </div>
      {kept ? (
        <p className="mt-2 text-[12px] text-text-muted text-pretty">
          {kept === 'yes'
            ? 'ثبّتك الله — «أحبّ الأعمال إلى الله أدومها وإن قلّ» (متفق عليه)'
            : 'لا بأس، جدّد العزم — «أحبّ الأعمال إلى الله أدومها وإن قلّ» (متفق عليه)'}
        </p>
      ) : null}
    </Card>
  );
}

function Scale({ q, value, onPick }: { q: MuhasabaQuestion; value: number | undefined; onPick: (v: number | null) => void }) {
  const pick = (v: number) => onPick(value === v ? null : v);
  if (q.kind === 'yesno') {
    return (
      <div className="flex gap-2">
        {[
          { v: 1, l: 'نعم' },
          { v: 0, l: 'لا' },
        ].map((o) => (
          <Pill key={o.v} active={value === o.v} onClick={() => pick(o.v)} className="min-w-16">
            {o.l}
          </Pill>
        ))}
      </div>
    );
  }
  return (
    <div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={q.text}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => pick(v)}
            className={[
              'flex-1 min-h-10 rounded-xl text-[14px] font-counter font-bold transition-colors duration-200',
              value === v
                ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                : value != null && v < value
                  ? 'bg-teal/15 text-teal dark:text-teal-light'
                  : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10',
            ].join(' ')}
          >
            {toArabicDigits(v)}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-text-muted">
        <span>ضعيف</span>
        <span>أحسنت</span>
      </div>
    </div>
  );
}

/** The honest questions — rotated weekly, or the user's own set. */
export function Questions({ week }: { week: string }) {
  const chosen = useFridayReviewStore((s) => s.questionIds);
  const custom = useFridayReviewStore((s) => s.custom);
  const answers = useFridayReviewStore((s) => s.reviews[week]?.answers ?? EMPTY) as Record<string, number>;
  const answer = useFridayReviewStore((s) => s.answer);
  const [editing, setEditing] = useState(false);
  const list = questionsFor(week, chosen, custom);
  const answered = list.filter((q) => answers[q.id] != null).length;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="وقفة صادقة"
        subtitle={`${toArabicDigits(answered)} من ${toArabicDigits(list.length)} — بينك وبين ربك`}
        action={
          <Button variant="ghost" size="sm" leftIcon={<SlidersHorizontal size={15} />} onClick={() => setEditing(true)}>
            الأسئلة
          </Button>
        }
      />
      <Card className="p-1.5">
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {list.map((q) => (
            <li key={q.id} className="px-3 py-3.5 flex flex-col gap-2.5">
              <div>
                <p className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark text-pretty">{q.text}</p>
                {q.source ? <p className="mt-0.5 text-[11px] text-text-muted text-pretty">{q.source}</p> : null}
              </div>
              <Scale q={q} value={answers[q.id]} onPick={(v) => answer(week, q.id, v)} />
            </li>
          ))}
        </ul>
      </Card>
      <QuestionsSheet open={editing} onClose={() => setEditing(false)} />
    </section>
  );
}

function QuestionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chosen = useFridayReviewStore((s) => s.questionIds);
  const custom = useFridayReviewStore((s) => s.custom);
  const setIds = useFridayReviewStore((s) => s.setQuestionIds);
  const addCustom = useFridayReviewStore((s) => s.addCustom);
  const removeCustom = useFridayReviewStore((s) => s.removeCustom);
  const [draft, setDraft] = useState('');
  // The rotation's fixed part stands for "my set" until the user picks.
  const ids = chosen ?? CORE_QUESTIONS;
  const flip = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const add = () => {
    if (!draft.trim()) return;
    addCustom(draft);
    setDraft('');
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="أسئلة المحاسبة">
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center gap-2">
          <Pill active={chosen === null} onClick={() => setIds(null)}>
            تتجدد كل أسبوع
          </Pill>
          <Pill active={chosen !== null} onClick={() => setIds(ids)}>
            أسئلتي أنا
          </Pill>
        </div>
        <p className="text-[12px] text-text-muted text-pretty">
          {chosen === null
            ? 'خمسة أسئلة ثابتة وسؤال يتغيّر كل أسبوع. اضغط سؤالاً لتختار أسئلتك بنفسك.'
            : 'تظهر الأسئلة التي تختارها كل أسبوع، ومعها أسئلتك المكتوبة.'}
        </p>
        <ul className="flex flex-col gap-1.5">
          {QUESTION_BANK.map((q) => {
            const on = ids.includes(q.id);
            return (
              <li key={q.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => flip(q.id)}
                  className={[
                    'w-full text-start rounded-[var(--radius-inner)] px-3 py-2.5 text-[13.5px] transition-colors',
                    on ? 'bg-teal/10 text-teal dark:text-teal-light font-semibold' : 'bg-cream-dark/50 dark:bg-white/[0.04] text-text-secondary dark:text-text-on-dark/80',
                  ].join(' ')}
                >
                  {q.text}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-semibold text-text-secondary dark:text-text-on-dark/75">أسئلتك المكتوبة (من ١ إلى ٥)</p>
          {custom.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-[var(--radius-inner)] bg-cream-dark/50 dark:bg-white/[0.04] ps-3 pe-1 py-1">
              <span className="flex-1 min-w-0 text-[13.5px] text-text-primary dark:text-text-on-dark">{c.text}</span>
              <button
                type="button"
                onClick={() => removeCustom(c.id)}
                aria-label={`احذف «${c.text}»`}
                className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <TextInput
              value={draft}
              onValueChange={setDraft}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="مثلاً: هل أجبت المؤذن؟"
              aria-label="سؤال جديد"
              className={fieldClass}
            />
            <Button variant="soft" size="sm" onClick={add} disabled={!draft.trim()} aria-label="أضف السؤال" leftIcon={<Plus size={15} />}>
              أضف
            </Button>
          </div>
        </div>
        <Button fullWidth onClick={onClose}>
          تم
        </Button>
      </div>
    </BottomSheet>
  );
}

const PROMPTS = [
  { key: 'thanks', label: 'ما أحمد الله عليه هذا الأسبوع', hint: 'نعمة، طاعة يسّرها الله، خير وصلك…' },
  { key: 'istighfar', label: 'ما أستغفر الله منه', hint: 'تقصير، زلّة، حقّ لم تؤدّه…' },
  { key: 'resolve', label: 'عزمي للأسبوع القادم', hint: 'ما تنويه، بعبارتك أنت' },
] as const;

/** The three private notes. */
export function Prompts({ week }: { week: string }) {
  const entry = useFridayReviewStore((s) => s.reviews[week]);
  const patch = useFridayReviewStore((s) => s.patch);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="خواطرك" subtitle="لا يراها أحد غيرك" action={<Lock size={14} className="text-text-muted" aria-hidden />} />
      <Card className="p-4 flex flex-col gap-4">
        {PROMPTS.map((p) => (
          <label key={p.key} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-text-secondary dark:text-text-on-dark/80">{p.label}</span>
            <TextArea
              value={entry?.[p.key] ?? ''}
              onValueChange={(v) => patch(week, { [p.key]: v })}
              rows={3}
              placeholder={p.hint}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
          </label>
        ))}
      </Card>
    </section>
  );
}

/** ONE focus for next week: suggested from the weakest door, or the user's own words. */
export function FocusPicker({
  week,
  weak,
  weakLabel,
  extra,
  male,
}: {
  week: string;
  weak: DomainId | null;
  weakLabel?: string;
  /** Suggestions of a plug-in section when it is the weakest. */
  extra?: string[];
  male: boolean;
}) {
  const focus = useFridayReviewStore((s) => s.reviews[week]?.focus);
  const patch = useFridayReviewStore((s) => s.patch);
  const suggestions = extra?.length ? extra : focusSuggestions(weak, male);
  const own = focus && !suggestions.includes(focus.text) ? focus.text : '';

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="تركيزك للأسبوع القادم"
        subtitle={weakLabel ? `أمر واحد تثبت عليه — اقتراحات من «${weakLabel}»` : 'أمر واحد تثبت عليه'}
      />
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((t) => (
            <Pill
              key={t}
              active={focus?.text === t}
              onClick={() => patch(week, { focus: focus?.text === t ? undefined : { text: t, domain: weak ?? undefined } })}
              className="whitespace-normal text-start py-1.5"
            >
              {t}
            </Pill>
          ))}
        </div>
        <TextInput
          value={own}
          onValueChange={(v) => patch(week, { focus: v.trim() ? { text: v } : undefined })}
          placeholder="أو اكتب عزمك بنفسك"
          aria-label="عزم من عندك"
          className={fieldClass}
        />
        {focus ? (
          <p className="text-[12px] text-teal dark:text-teal-light text-pretty">
            سيظهر لك طوال الأسبوع القادم، وتسألك محاسبة الجمعة القادمة: هل وفّيت به؟
          </p>
        ) : null}
      </Card>
    </section>
  );
}
