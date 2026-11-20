import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  CalendarHeart, Check, Copy, HeartCrack, MessageCircle, MessageSquareText, Pencil, Phone, Plus, Sprout, Stethoscope, Trash2,
} from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle } from '@/components/ui/Ornament';
import { CalendarHeatmap } from '@/components/stats/CalendarHeatmap';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { useToastStore } from '@/store/toastStore';
import { toast } from '@/store/toastStore';
import { WEEKDAY_AR, clockAr, dayHeadingAr, dayKey } from '@/store/studyModel';
import {
  CATEGORY_SHORT, CONTINUING_DEEDS, GREETING, RECONCILE_POINTS, REPAIR_STEPS, RHYTHMS, T, relationLabel, typeLabel, withPronoun,
  type ContactType,
} from '@/data/silatContent';
import {
  categoryOf, countsFor, daysAr, displayName, dueText, isFemale, needsVisit, personHeat, planWeekday, reconcileEntry, repairSteps,
  repairing, sinceText, statusOf, upcomingOccasions, type Person, type SilatEntry,
} from '@/store/silatModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { followUpType } from '@/services/silatPhone';
import { LinkOut, Quote, STATE_TEXT, StatusAvatar, TYPE_ICON, logContact, telHref, typeTone, waHref } from './silatUi';

/** After the dialer: «سجّل اتصال» waits for the return, unless the call log will record the call. */
const afterCall = (onLog: (t: ContactType) => void) => {
  const t = followUpType('call');
  if (t) onLog(t);
};

/** «أسبوعياً · يوم الجمعة» / «كل يومين» / «كل ١٠ أيام». */
const rhythmText = (p: Person) => {
  const wd = planWeekday(p);
  return `${RHYTHMS.find((r) => r.days === p.everyDays)?.label ?? `كل ${daysAr(p.everyDays)}`}${wd === null ? '' : ` · يوم ${WEEKDAY_AR[wd]}`}`;
};

function RepairPlan({ p, entries, onLog }: { p: Person; entries: SilatEntry[]; onLog: (t: ContactType) => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const endRepair = useSilatStore((s) => s.endRepair);
  const steps = repairSteps(p, entries);
  const reconciled = reconcileEntry(p, entries);
  const next = steps.indexOf(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(GREETING);
      toast.success('نُسخت الرسالة');
    } catch {
      toast.info('انسخ الرسالة يدوياً', GREETING);
    }
  };
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="خطة إصلاح القطيعة" subtitle="خطوة بعد خطوة، بلا عتاب" />
      <Card variant="gold-rim" className="p-4 flex flex-col gap-4">
        <Quote t={T.wasil} size="sm" />
        <ol className="flex flex-col gap-1">
          {REPAIR_STEPS.map((s, i) => {
            const done = steps[i];
            const current = i === next;
            return (
              <li key={s.type} className={['flex gap-3 rounded-[var(--radius-inner)] p-2.5', current ? 'bg-gold/10' : ''].join(' ')}>
                <span
                  className={[
                    'w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0 font-counter text-sm font-bold',
                    done ? 'bg-teal text-on-accent' : current ? 'bg-gold/25 text-gold-dark dark:text-gold-light' : 'bg-cream-dark/70 dark:bg-white/[0.07] text-text-muted',
                  ].join(' ')}
                  aria-hidden
                >
                  {done ? <Check size={16} strokeWidth={2.6} /> : ar(i + 1)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark">
                    {s.title}
                    {done ? <span className="sr-only"> — تمّت</span> : null}
                  </span>
                  <span className="block text-[12px] text-text-secondary dark:text-text-on-dark/70 text-pretty">{s.body}</span>
                  {current ? (
                    <span className="mt-2 flex flex-wrap gap-2">
                      {s.type === 'message' && p.phone ? (
                        <LinkOut href={waHref(p.phone, GREETING)} label="أرسل السلام على واتساب" onOpen={() => onLog('message')} className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-green-600/12 text-green-700 dark:text-green-400 text-[13px] font-semibold">
                          <MessageCircle size={15} aria-hidden /> أرسل على واتساب
                        </LinkOut>
                      ) : null}
                      {s.type === 'message' ? (
                        <Button variant="soft" size="sm" leftIcon={<Copy size={14} />} onClick={() => void copy()}>
                          انسخ رسالة السلام
                        </Button>
                      ) : null}
                      {s.type === 'call' && p.phone ? (
                        <LinkOut href={telHref(p.phone)} label="اتصل" onOpen={() => afterCall(onLog)} className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl bg-teal/10 text-teal dark:text-teal-light text-[13px] font-semibold">
                          <Phone size={15} aria-hidden /> اتصل الآن
                        </LinkOut>
                      ) : null}
                      <Button variant="secondary" size="sm" leftIcon={<Check size={14} />} onClick={() => logContact(p, s.type)}>
                        {s.type === 'dua' ? withPronoun('دعوتُ ل{ه}', isFemale(p, gender)) : 'فعلتُها'}
                      </Button>
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-[12px] text-gold-dark dark:text-gold-light font-semibold">
          {reconciled ? `وصلتَه بعد القطيعة يوم ${dayHeadingAr(reconciled.day, Date.now())} — +${ar(RECONCILE_POINTS)} نقطة، تقبّل الله` : `أول صلة بعد القطيعة: +${ar(RECONCILE_POINTS)} نقطة فوق نقاطها`}
        </p>
        <Quote t={T.mall} size="sm" />
        <Button variant="soft" fullWidth onClick={() => endRepair(p.id)}>
          تمّ الصلح، الحمد لله
        </Button>
      </Card>
    </section>
  );
}

/** «فلان»: where you stand, the actions (with «رسالة جاهزة»), the plans that apply, and the history. */
export function PersonDetail({
  person: p,
  onEdit,
  onLog,
  onMessage,
}: {
  person: Person;
  onEdit: () => void;
  onLog: (suggest?: ContactType) => void;
  onMessage: () => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const entries = useSilatStore((s) => s.entries);
  const startRepair = useSilatStore((s) => s.startRepair);
  const updatePerson = useSilatStore((s) => s.updatePerson);
  const [askRepair, setAskRepair] = useState(false);
  const [days, setDays] = useState(10);
  // ?log=call|message — a notification's «اتصل» / «واتساب» (silatPhone.ts): the log sheet waits for the return.
  const [params, setParams] = useSearchParams();
  const follow = params.get('log');
  useEffect(() => {
    if (follow !== 'call' && follow !== 'message') return;
    onLog(follow);
    setParams(
      (x) => {
        x.delete('log');
        return x;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow]);
  const now = Date.now();
  const today = dayKey(now);
  const own = useMemo(() => entries.filter((e) => e.personId === p.id), [entries, p.id]);
  const raw = statusOf(p, own, today);
  // Mending a broken tie or praying for one who has died is never «late» in red.
  const st = raw.state === 'late' && (p.deceased || repairing(p)) ? { ...raw, state: 'due' as const } : raw;
  const name = displayName(p, gender);
  const female = isFemale(p, gender);
  const rel = relationLabel(p.relation, gender);
  const heat = useMemo(() => personHeat(p.id, own, today, 26), [own, p.id, today]);
  const occasions = useMemo(() => upcomingOccasions([p], today, 366), [p, today]);
  const byDay = useMemo(() => {
    const m = new Map<string, SilatEntry[]>();
    for (const e of own) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return [...m.entries()];
  }, [own]);
  const monthPrefix = today.slice(0, 7);
  const thisMonth = own.filter((e) => e.day.startsWith(monthPrefix) && countsFor(p, e.type)).length;

  const remove = (e: SilatEntry) => {
    useSilatStore.getState().removeEntry(e.id);
    useToastStore.getState().push({ kind: 'info', title: 'حُذف من السجل', durationMs: 4000, action: { label: 'تراجع', onPress: () => useSilatStore.getState().restoreEntry(e) } });
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title={name}
        subtitle={`${rel} · ${CATEGORY_SHORT[categoryOf(p)]}`}
        showBack
        actions={
          <Button variant="icon" onClick={onEdit} aria-label="تعديل">
            <Pencil size={18} />
          </Button>
        }
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6 max-w-3xl mx-auto">
        <Card variant="gradient-edge" className="p-5">
          <div className="flex items-center gap-4">
            <StatusAvatar person={p} status={st} size={76} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[22px] font-display font-bold text-text-primary dark:text-text-on-dark truncate">{name}</h2>
              <p className={['text-[13.5px] font-semibold', STATE_TEXT[st.state]].join(' ')}>
                {p.deceased ? (female ? 'رحمها الله' : 'رحمه الله') : repairing(p) && st.state !== 'done' ? 'في خطة الإصلاح، خطوةً بخطوة' : dueText(st, female)}
              </p>
              <p className="text-[12px] text-text-muted">
                {rhythmText(p)} · آخر صلة: {sinceText(st.estimated ? null : st.lastDay, today)}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.ill ? <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 text-danger px-2.5 py-0.5 text-[11.5px] font-semibold"><Stethoscope size={12} /> مريض</span> : null}
            {repairing(p) ? <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 text-gold-dark dark:text-gold-light px-2.5 py-0.5 text-[11.5px] font-semibold"><Sprout size={12} /> إصلاح قطيعة</span> : null}
            {(p.channels ?? []).map((c) => (
              <span key={c} className="rounded-full bg-cream-dark/70 dark:bg-white/[0.07] text-text-secondary dark:text-text-on-dark/75 px-2.5 py-0.5 text-[11.5px]">{typeLabel(c, female)}</span>
            ))}
            <span className="rounded-full bg-cream-dark/70 dark:bg-white/[0.07] text-text-secondary dark:text-text-on-dark/75 px-2.5 py-0.5 text-[11.5px] font-counter tabular-nums">
              {ar(thisMonth)} {p.deceased ? 'عملاً' : 'صلة'} هذا الشهر
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!p.deceased && p.phone ? (
              <>
                <LinkOut href={telHref(p.phone)} label={`اتصل ب${name}`} onOpen={() => afterCall(onLog)} className="flex-1 min-w-[7rem] inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-[image:var(--gradient-teal)] text-on-accent font-semibold text-[14px] shadow-[var(--shadow-xs)]">
                  <Phone size={17} aria-hidden /> اتصال
                </LinkOut>
                <LinkOut href={waHref(p.phone)} label={`راسل ${name} على واتساب`} onOpen={() => onLog('message')} className="flex-1 min-w-[7rem] inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-green-600/12 text-green-700 dark:text-green-400 font-semibold text-[14px]">
                  <MessageCircle size={17} aria-hidden /> واتساب
                </LinkOut>
              </>
            ) : null}
            <Button variant={p.deceased || !p.phone ? 'primary' : 'secondary'} className="flex-1 min-w-[7rem]" leftIcon={<Plus size={17} />} onClick={() => onLog()}>
              {p.deceased ? withPronoun('سجّل عملاً ل{ه}', female) : 'سجّل صلة'}
            </Button>
          </div>
          {!p.deceased ? (
            <Button variant="ghost" size="sm" className="mt-2" leftIcon={<MessageSquareText size={15} />} onClick={onMessage}>
              رسالة جاهزة: سلام، دعاء، تهنئة، تعزية
            </Button>
          ) : null}
        </Card>

        {repairing(p) ? <RepairPlan p={p} entries={own} onLog={(t) => onLog(t)} /> : null}

        {p.ill && !p.deceased ? (
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-danger/10 text-danger inline-flex items-center justify-center shrink-0"><Stethoscope size={19} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark">عيادة المريض</span>
                <span className="block text-[12px] text-text-muted">{needsVisit(p, own, today) ? `لم ${female ? 'تعدها' : 'تعده'} في الأيام الثلاثة الأخيرة` : `${female ? 'عدتها' : 'عدته'} قريباً، بارك الله فيك`}</span>
              </span>
            </div>
            <Quote t={T.iyada} size="sm" />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => logContact(p, 'iyada')}>{female ? 'عدتُها اليوم' : 'عدتُه اليوم'}</Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => updatePerson(p.id, { ill: undefined })}>شفاه الله</Button>
            </div>
          </Card>
        ) : null}

        {p.deceased ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="أعمال يصله أجرها" subtitle="البرّ لا ينقطع بالموت" />
            <Card className="p-1.5">
              <ul className="flex flex-col">
                {CONTINUING_DEEDS.map((d) => {
                  const Icon = TYPE_ICON[d.type];
                  return (
                    <li key={d.type} className="flex items-center gap-3 px-2.5 py-3">
                      <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', typeTone(d.type)].join(' ')}><Icon size={17} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark">{withPronoun(d.title, female)}</span>
                        <span className="block text-[11.5px] text-text-muted">{withPronoun(d.body, female)}</span>
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => logContact(p, d.type)}>فعلتُه</Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card variant="inset" className="p-4 flex flex-col gap-3">
              <Quote t={T.inqata} size="sm" />
              <Quote t={T.wudd} size="sm" />
            </Card>
          </section>
        ) : !repairing(p) ? (
          <button type="button" onClick={() => setAskRepair(true)} className="self-start inline-flex items-center gap-1.5 text-[12.5px] text-text-muted hover:text-gold-dark dark:hover:text-gold-light px-1 min-h-9 text-start">
            <HeartCrack size={14} className="shrink-0" aria-hidden /> {female ? 'قطعتك' : 'قطعك'} أو بينكما جفوة؟ «ليس الواصلُ بالمكافئ» — ابدأ خطة الإصلاح
          </button>
        ) : null}

        {p.notes ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="ملاحظاتك" />
            <Card className="p-4">
              <p className="text-[13.5px] leading-relaxed text-text-primary dark:text-text-on-dark whitespace-pre-wrap text-pretty">{p.notes}</p>
            </Card>
          </section>
        ) : null}

        {occasions.length ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="مناسبات" />
            <Card className="p-1.5">
              <ul className="flex flex-col">
                {occasions.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-2.5 py-2.5">
                    <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0"><CalendarHeart size={17} /></span>
                    <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">{o.kind === 'birthday' ? 'يوم الميلاد' : o.label}</span>
                    <span className="text-[12px] text-text-muted">{o.daysLeft === 0 ? 'اليوم' : `بعد ${daysAr(o.daysLeft)}`}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <SectionTitle title="خريطة الصلة" subtitle="آخر ستة أشهر — كلما اشتدّ اللون كانت الصلة أعمق" />
          <Card className="p-4">
            <CalendarHeatmap cells={heat} />
          </Card>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionTitle title="السجل" subtitle={own.length ? `${ar(own.length)} ${p.deceased ? 'عملاً' : 'صلة'} مسجّلة` : undefined} />
          {byDay.length ? (
            <Card className="p-1.5">
              {byDay.slice(0, days).map(([day, list]) => (
                <div key={day}>
                  <p className="px-2.5 pt-2.5 pb-1 text-[11.5px] font-semibold text-text-muted">{dayHeadingAr(day, now)}</p>
                  <ul className="flex flex-col">
                    {list.map((e) => {
                      // A kind from a newer version (synced in) shows as a plain «صلة» until this one updates.
                      const Icon = TYPE_ICON[e.type] ?? Check;
                      const label = TYPE_ICON[e.type] ? typeLabel(e.type, female) : 'صلة';
                      return (
                        <li key={e.id} className="flex items-center gap-3 px-2.5 py-2">
                          <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', typeTone(e.type)].join(' ')}><Icon size={16} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark">
                              {label}
                              {e.durationMin ? <span className="font-normal text-text-muted"> · {ar(e.durationMin)} د</span> : null}
                            </span>
                            {e.auto ? <span className="block text-[11.5px] text-text-muted">سُجّلت تلقائياً من سجل المكالمات</span> : null}
                            {e.note ? <span className="block text-[12px] text-text-secondary dark:text-text-on-dark/70 text-pretty">{e.note}</span> : null}
                          </span>
                          <span className="text-[11px] text-text-muted font-counter tabular-nums">{clockAr(e.at)}</span>
                          <button
                            type="button"
                            aria-label={`حذف ${label}`}
                            onClick={() => remove(e)}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-muted hover:text-danger hover:bg-danger/10"
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {byDay.length > days ? (
                <Button variant="ghost" fullWidth onClick={() => setDays((n) => n + 20)}>
                  المزيد
                </Button>
              ) : null}
            </Card>
          ) : (
            <p className="text-[12.5px] text-text-muted text-pretty px-1">لم تسجّل شيئاً بعد. كل صلة تسجّلها هنا تبني سجلّاً يذكّرك بالمعروف.</p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={askRepair}
        title="خطة إصلاح القطيعة"
        message={`أربع خطوات لطيفة: دعاء، ثم رسالة سلام، ثم اتصال، ثم زيارة. يخرج ${name} من قائمة المواعيد حتى تُتمّ الصلح، وأول صلة بعد القطيعة لها +${ar(RECONCILE_POINTS)} نقطة.`}
        confirmLabel="ابدأ الخطة"
        onCancel={() => setAskRepair(false)}
        onConfirm={() => {
          startRepair(p.id);
          setAskRepair(false);
        }}
      />
    </div>
  );
}
