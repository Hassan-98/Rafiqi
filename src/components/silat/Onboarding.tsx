import { useState } from 'react';
import { BellRing, HeartHandshake, Lock, Plus, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif } from '@/components/ui/Ornament';
import { TextInput } from '@/components/ui/TextInput';
import { Toggle } from '@/components/ui/Toggle';
import { Field, Pill, fieldClass } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { T, isFemaleRelation, relationLabel, relationOf, withPronoun, type ContactType } from '@/data/silatContent';
import { baselineFor, type SinceChoice } from '@/store/silatModel';
import { dayKey } from '@/store/studyModel';
import { toast } from '@/store/toastStore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { Quote } from './silatUi';
import { ChannelChips, PhoneInput, PlanChips, SinceChips } from './PersonFields';

type ParentState = 'alive' | 'gone' | 'skip';
/** Each person's plan, preset from the relation (silatContent), and «متى وصلته آخر مرة؟». */
interface Plan {
  every: number;
  weekday?: number;
  since: SinceChoice;
}
interface ParentDraft extends Plan {
  state: ParentState;
  name: string;
  phone: string;
}
interface Row extends Plan {
  key: string;
  relation: string;
  name: string;
  phone: string;
  channels: ContactType[];
}

const planFor = (relation: string): Plan => ({ every: relationOf(relation)?.everyDays ?? 30, since: 'soon' });

/** The relations offered as one-tap chips on step 2, nearest first. */
const QUICK = ['brother', 'sister', 'grandmother', 'grandfather', 'son', 'daughter', 'uncleP', 'auntP', 'uncleM', 'auntM', 'neighbor'];

/**
 * First run: why (the texts) → the parents (alive / رحمه الله / skip, a name,
 * a number, a plan, when last reached) → a few kin, neighbours and friends
 * (the same, plus the ways you reach them) → the daily reminder.
 */
export function Onboarding() {
  const gender = useSettingsStore((s) => s.gender);
  const addPerson = useSilatStore((s) => s.addPerson);
  const setPrefs = useSilatStore((s) => s.setPrefs);
  const prefs = useSilatStore((s) => s.prefs);
  const setOnboarded = useSilatStore((s) => s.setOnboarded);
  const [step, setStep] = useState(0);
  const [parents, setParents] = useState<Record<'mother' | 'father', ParentDraft>>({
    mother: { state: 'alive', name: '', phone: '', ...planFor('mother') },
    father: { state: 'alive', name: '', phone: '', ...planFor('father') },
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [digest, setDigest] = useState(prefs.digest);
  const [time, setTime] = useState(prefs.digestTime);
  const friend = gender === 'female' ? 'sisterInAllah' : 'brotherInAllah';

  const addRow = (relation: string) =>
    setRows((r) => [...r, { key: `${relation}${Date.now()}${r.length}`, relation, name: '', phone: '', channels: [], ...planFor(relation) }]);
  const setRow = (key: string, patch: Partial<Row>) => setRows((x) => x.map((y) => (y.key === key ? { ...y, ...patch } : y)));
  const finish = () => {
    const today = dayKey(Date.now());
    const plan = (x: Plan, alive: boolean) => ({
      everyDays: x.every,
      weekday: x.every >= 7 ? x.weekday : undefined,
      baseline: alive ? baselineFor(x.since, today, x.every) : undefined,
    });
    let n = 0;
    for (const rel of ['mother', 'father'] as const) {
      const p = parents[rel];
      if (p.state === 'skip') continue;
      const alive = p.state === 'alive';
      addPerson({ relation: rel, name: p.name.trim(), phone: (alive && p.phone.trim()) || undefined, deceased: !alive || undefined, ...plan(p, alive) });
      n++;
    }
    for (const r of rows) {
      addPerson({
        relation: r.relation,
        name: r.name.trim(),
        phone: r.phone.trim() || undefined,
        channels: r.channels.length ? r.channels : undefined,
        ...plan(r, true),
      });
      n++;
    }
    setPrefs({ digest, digestTime: time });
    setOnboarded(true);
    if (n) toast.success(`أُضيف ${ar(n)}، بارك الله في صلتك`);
  };

  const dots = (
    <div className="flex justify-center gap-1.5" aria-label={`الخطوة ${ar(step + 1)} من ٤`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={['h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out-soft', i === step ? 'w-6 bg-teal' : 'w-1.5 bg-teal/25'].join(' ')} />
      ))}
    </div>
  );

  if (step === 0) {
    return (
      <>
        <Card variant="hero" className="p-6">
          <ArchMotif className="absolute -top-6 -start-8 w-44 opacity-15" />
          <div className="relative flex flex-col gap-4">
            <HeartHandshake size={30} className="text-gold-light" aria-hidden />
            <h2 className="text-[24px] font-display font-bold leading-snug text-balance">صِلْ رحمك، يَصِلْك الله</h2>
            <Quote t={T.arsh} onAccent />
            <p className="text-[13.5px] text-on-accent/85 text-pretty">
              رفيقك يذكّرك بمن طال غيابك عنهم، ويحفظ سجلّ صلتك بوالديك وأرحامك وجيرانك وأحبابك، ويعينك على إصلاح ما انقطع.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => setStep(1)}>
                ابدأ بوالديك
              </Button>
              <button type="button" onClick={() => setOnboarded(true)} className="min-h-12 px-4 rounded-xl text-[15px] font-semibold text-on-accent/85 hover:bg-on-accent/10 transition-colors duration-200">
                لاحقاً
              </button>
            </div>
          </div>
        </Card>
        <Card variant="inset" className="p-4 flex flex-col gap-3">
          <Quote t={T.rizq} size="sm" />
          <Quote t={T.ihsan} size="sm" />
        </Card>
        <p className="flex items-start gap-1.5 px-1 text-[11.5px] text-text-muted text-pretty">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
          الأسماء والأرقام والملاحظات تبقى في حسابك الخاص، ولا تُشارك مع أحد.
        </p>
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {dots}
        <div>
          <h2 className="text-[20px] font-display font-bold text-text-primary dark:text-text-on-dark">والداك</h2>
          <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">برّهما أوّل الصلة. اختر لكلٍّ منهما خطته؛ الاسم والرقم اختياريان، وتستطيع تعديل ذلك كلّه لاحقاً.</p>
        </div>
        {(['mother', 'father'] as const).map((rel) => {
          const p = parents[rel];
          const set = (patch: Partial<typeof p>) => setParents((x) => ({ ...x, [rel]: { ...x[rel], ...patch } }));
          const fem = rel === 'mother';
          return (
            <Card key={rel} className="p-4 flex flex-col gap-3">
              <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark">{relationLabel(rel, gender)}</p>
              <div className="flex gap-1.5">
                <Pill active={p.state === 'alive'} onClick={() => set({ state: 'alive' })} className="flex-1">
                  على قيد الحياة
                </Pill>
                <Pill active={p.state === 'gone'} onClick={() => set({ state: 'gone' })} className="flex-1">
                  {fem ? 'رحمها الله' : 'رحمه الله'}
                </Pill>
                <Pill active={p.state === 'skip'} onClick={() => set({ state: 'skip' })}>
                  لا أضيف
                </Pill>
              </div>
              {p.state !== 'skip' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <TextInput value={p.name} onValueChange={(v) => set({ name: v })} className={fieldClass} placeholder={`الاسم (اختياري) — ${relationLabel(rel, gender)}`} aria-label="الاسم" />
                    {p.state === 'alive' ? (
                      <PhoneInput
                        value={p.phone}
                        onChange={(v) => set({ phone: v })}
                        onPickedName={(n) => setParents((x) => (x[rel].name.trim() ? x : { ...x, [rel]: { ...x[rel], name: n } }))}
                      />
                    ) : null}
                  </div>
                  <PlanChips
                    label={withPronoun(p.state === 'alive' ? 'كم مرة تصل{ه}؟' : 'كم مرة تدعو ل{ه}؟', fem)}
                    every={p.every}
                    weekday={p.weekday}
                    onChange={(every, weekday) => set({ every, weekday })}
                  />
                  {p.state === 'alive' ? (
                    <SinceChips label={withPronoun('متى وصلت{ه} آخر مرة؟', fem)} value={p.since} onChange={(since) => set({ since })} />
                  ) : null}
                </>
              ) : null}
              {p.state === 'gone' ? (
                <p className="text-[12px] text-text-muted text-pretty">سنذكّرك بالدعاء له والصدقة عنه وصلة أهل ودّه — برٌّ لا ينقطع.</p>
              ) : null}
            </Card>
          );
        })}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep(0)}>
            رجوع
          </Button>
          <Button className="flex-1" onClick={() => setStep(2)}>
            التالي
          </Button>
        </div>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        {dots}
        <div>
          <h2 className="text-[20px] font-display font-bold text-text-primary dark:text-text-on-dark">أرحامك ومن تحب</h2>
          <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
            اضغط لتضيف، ثم اختر لكلٍّ خطته — المقترح مختار مسبقاً (الإخوة أسبوعياً، الأعمام والأخوال شهرياً) — ورقمه ليظهر زرّا الاتصال وواتساب.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...QUICK, friend].map((rel) => (
            <Pill key={rel} active={false} onClick={() => addRow(rel)}>
              <Plus size={13} className="inline -mt-0.5 me-1" aria-hidden />
              {relationLabel(rel, gender)}
            </Pill>
          ))}
        </div>
        {rows.length ? (
          rows.map((r) => {
            const label = relationLabel(r.relation, gender);
            const fem = isFemaleRelation(r.relation, gender);
            return (
              <Card key={r.key} className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 min-w-0 text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">{label}</p>
                  <button
                    type="button"
                    aria-label={`إزالة ${label}`}
                    onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                    className="w-10 h-10 -my-2 -me-2 inline-flex items-center justify-center rounded-full text-text-muted hover:text-danger hover:bg-danger/10 shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TextInput value={r.name} onValueChange={(v) => setRow(r.key, { name: v })} className={fieldClass} placeholder={`الاسم — ${label}`} aria-label={`اسم ${label}`} />
                  <PhoneInput
                    value={r.phone}
                    onChange={(v) => setRow(r.key, { phone: v })}
                    onPickedName={(n) => setRows((x) => x.map((y) => (y.key === r.key && !y.name.trim() ? { ...y, name: n } : y)))}
                  />
                </div>
                <PlanChips label={withPronoun('كم مرة تصل{ه}؟', fem)} every={r.every} weekday={r.weekday} onChange={(every, weekday) => setRow(r.key, { every, weekday })} />
                <SinceChips label={withPronoun('متى وصلت{ه} آخر مرة؟', fem)} value={r.since} onChange={(since) => setRow(r.key, { since })} />
                <ChannelChips label="طريقة الصلة (اختياري)" value={r.channels} onChange={(channels) => setRow(r.key, { channels })} />
              </Card>
            );
          })
        ) : (
          <p className="text-[12.5px] text-text-muted px-1">تستطيع أيضاً إضافتهم لاحقاً من «أضف شخصاً».</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep(1)}>
            رجوع
          </Button>
          <Button className="flex-1" onClick={() => setStep(3)}>
            التالي
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {dots}
      <div>
        <h2 className="text-[20px] font-display font-bold text-text-primary dark:text-text-on-dark">تذكير لطيف كل يوم</h2>
        <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/70 text-pretty">
          في الوقت الذي تختاره يصلك إشعار واحد بأسماء من حان موعد صلتهم. لا يصلك شيء إن كان الجميع في موعدهم.
        </p>
      </div>
      <Card className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
            <BellRing size={19} aria-hidden />
          </span>
          <span className="flex-1 text-[14px] font-semibold text-text-primary dark:text-text-on-dark">تذكير «من تصلهم اليوم»</span>
          <Toggle checked={digest} onChange={setDigest} label="تذكير يومي" hideLabel />
        </div>
        {digest ? (
          <Field label="الوقت">
            <input type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} className={[fieldClass, 'w-36'].join(' ')} />
          </Field>
        ) : null}
      </Card>
      <p className="px-1 text-[12px] text-text-muted text-pretty">
        يُذكَر كلٌّ منهم في موعده الذي اخترته له، لا الجميع كل يوم، وتغيّر خطة أيٍّ منهم متى شئت من صفحته.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setStep(2)}>
          رجوع
        </Button>
        <Button className="flex-1" onClick={finish}>
          تمّ، ابدأ
        </Button>
      </div>
    </>
  );
}
