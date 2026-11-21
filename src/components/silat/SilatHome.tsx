import { useMemo, useState, type ReactNode } from 'react';
import { CalendarHeart, Check, ChevronDown, Flame, HeartHandshake, MessageCircle, Phone, Sprout, Stethoscope, UserPlus, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Pill, useNow } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { dayKey, WEEKDAY_AR } from '@/store/studyModel';
import {
  CATEGORIES, CATEGORY_SHORT, CATEGORY_TEXT, DAILY_TEXTS, T, typeLabel, withPronoun, type ContactType, type SilatCategory,
} from '@/data/silatContent';
import {
  byPerson, capRanked, categoryOf, coverageStreak, daysAr, displayName, dueText, isDueNow, isFemale, isLive, needsVisit, othersText,
  rankPeople, repairSteps, repairing, silahOfDay, silatPointsOn, statusOf, upcomingOccasions, weekCircle, type Person, type SilahPick,
} from '@/store/silatModel';
import { followUpType, openExternal } from '@/services/silatPhone';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { GatheringSheet } from './GatheringSheet';
import { PersonRow } from './PersonRow';
import { Avatar, Quote, TYPE_ICON, dailyIndex, telHref } from './silatUi';

type Filter = 'all' | SilatCategory;

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}

/** The line under «صِلة اليوم»: why the easiest action is enough. «{ه}» = the pronoun. */
const EASY: Partial<Record<ContactType, string>> = {
  call: 'اتصالٌ قصير يكفي',
  message: 'رسالةٌ دافئة تكفي',
  video: 'مكالمة فيديو تُفرح{ه}',
  visit: 'زيارةٌ قصيرة تكفي',
  gift: 'هديةٌ يسيرة تفتح القلب',
  iyada: 'زُر{ه} أو اتصل لتطمئنّ علي{ه}',
  congrats: 'فرصةٌ طيبة للتهنئة',
};
const ON_ACCENT_BTN =
  'inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-xl text-sm font-semibold text-on-accent bg-on-accent/10 ring-1 ring-on-accent/25 hover:bg-on-accent/15 transition-colors duration-200';

/** «صِلة اليوم»'s two buttons: the easiest action for the first one (a call, a ready message, or log it), and a ready message or their page. */
function SilahActions({
  pick,
  onOpen,
  onLog,
  onMessage,
}: {
  pick: SilahPick;
  onOpen: (id: string) => void;
  onLog: (p: Person, suggest?: ContactType) => void;
  onMessage: (p: Person) => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const p = pick.person;
  const name = displayName(p, gender);
  const phone = p.phone;
  const byMessage = !!phone && (['message', 'voice', 'video', 'congrats'] as ContactType[]).includes(pick.action);
  const Icon = TYPE_ICON[pick.action];
  const primary =
    phone && pick.action === 'call' ? (
      <Button
        variant="gold"
        size="sm"
        leftIcon={<Phone size={15} />}
        onClick={() => {
          void openExternal(telHref(phone));
          const t = followUpType('call');
          if (t) onLog(p, t);
        }}
      >
        اتصل ب{name}
      </Button>
    ) : byMessage ? (
      <Button variant="gold" size="sm" leftIcon={<MessageCircle size={15} />} onClick={() => onMessage(p)}>
        {pick.action === 'congrats' ? 'هنّئ' : 'راسل'} {name}
      </Button>
    ) : (
      <Button variant="gold" size="sm" leftIcon={<Icon size={15} />} onClick={() => onLog(p, pick.action)}>
        سجّل {typeLabel(pick.action, isFemale(p, gender))}
      </Button>
    );
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {primary}
      {phone && !byMessage ? (
        <button type="button" onClick={() => onMessage(p)} className={ON_ACCENT_BTN}>
          <MessageCircle size={15} aria-hidden /> رسالة جاهزة
        </button>
      ) : (
        <button type="button" onClick={() => onOpen(p.id)} className={ON_ACCENT_BTN}>
          {withPronoun('صفحت{ه}', isFemale(p, gender))}
        </button>
      )}
    </div>
  );
}

/** «دائرة الصلة»: this week's people as avatars — the reached ones full with a check, the waiting faded (a tap opens them). */
function WeekCircleCard({ reached, waiting, onOpen }: { reached: Person[]; waiting: Person[]; onOpen: (id: string) => void }) {
  const gender = useSettingsStore((s) => s.gender);
  const all = [...reached.map((p) => ({ p, done: true })), ...waiting.map((p) => ({ p, done: false }))];
  const shown = all.slice(0, 14);
  const names = waiting.slice(0, 2).map((p) => displayName(p, gender)).join('، ');
  const line = !waiting.length
    ? 'اكتملت دائرتك هذا الأسبوع، بارك الله فيك'
    : reached.length
      ? `وصلتَ ${ar(reached.length)} من ${ar(all.length)} — بقي ${names}${waiting.length > 2 ? ` ${othersText(waiting.length - 2)}` : ''}`
      : 'كل صلةٍ هذا الأسبوع تملأ مكاناً في دائرتك';
  return (
    <Block title="دائرة الصلة" subtitle="هذا الأسبوع، من السبت إلى الجمعة">
      <Card className="p-4 flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2">
          {shown.map(({ p, done }) => {
            const f = isFemale(p, gender);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  aria-label={`${displayName(p, gender)} — ${withPronoun(done ? 'وصلت{ه} هذا الأسبوع' : 'لم تصل{ه} بعد', f)}`}
                  className={['relative inline-flex rounded-full transition-opacity duration-200', done ? '' : 'opacity-50 hover:opacity-80'].join(' ')}
                >
                  <Avatar person={p} size={40} />
                  {done ? (
                    <span className="absolute -bottom-0.5 -end-0.5 w-4.5 h-4.5 rounded-full bg-teal text-on-accent inline-flex items-center justify-center ring-2 ring-white dark:ring-dark-card" aria-hidden>
                      <Check size={11} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {all.length > shown.length ? (
            <li className="self-center text-[12px] text-text-muted font-counter tabular-nums">+{ar(all.length - shown.length)}</li>
          ) : null}
        </ul>
        <p className={['text-[12.5px] text-pretty', waiting.length ? 'text-text-secondary dark:text-text-on-dark/75' : 'font-semibold text-gold-dark dark:text-gold-light'].join(' ')}>{line}</p>
      </Card>
    </Block>
  );
}

/**
 * «أرحامي»: today's hero («صِلة اليوم»: who first and the easiest way, this
 * week's circle, the run of kept weeks, today's points), «دائرة الصلة», then
 * the list by «الأولى بالصلة الآن», the sick to visit, broken ties being
 * mended, occasions, and those who passed away.
 */
export function SilatHome({
  onOpen,
  onLog,
  onMessage,
  onAdd,
}: {
  onOpen: (id: string) => void;
  onLog: (p: Person, suggest?: ContactType) => void;
  onMessage: (p: Person) => void;
  onAdd: () => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const people = useSilatStore((s) => s.people);
  const entries = useSilatStore((s) => s.entries);
  const now = useNow(60_000);
  const today = dayKey(now);
  const [filter, setFilter] = useState<Filter>('all');
  const [showAllDue, setShowAllDue] = useState(false);
  const [gathering, setGathering] = useState(false);

  const data = useMemo(() => {
    const live = people.filter(isLive);
    const idx = byPerson(entries);
    return {
      live,
      idx,
      ranked: rankPeople(people, entries, today),
      repairs: live.filter(repairing),
      deceased: live.filter((p) => p.deceased),
      sick: live.filter((p) => needsVisit(p, idx.get(p.id) ?? [], today)),
      upcoming: upcomingOccasions(people, today, 14),
      pick: silahOfDay(people, entries, today),
      circle: weekCircle(people, entries, today),
      streak: coverageStreak(people, entries, today),
      points: silatPointsOn(entries, people, today).points,
    };
  }, [people, entries, today]);

  const keep = (p: Person) => filter === 'all' || categoryOf(p) === filter;
  const ranked = data.ranked.filter((r) => keep(r.person));
  const due = ranked.filter(isDueNow);
  // A gentle load: four at a time, the parents first; the rest behind «و٣ آخرون».
  const shownDue = showAllDue ? { shown: due, more: 0 } : capRanked(due, 4);
  const soon = ranked.filter((r) => r.status.state === 'ok');
  const done = ranked.filter((r) => r.status.state === 'done');
  const allDue = data.ranked.filter(isDueNow);
  const text = filter === 'all' ? DAILY_TEXTS[dailyIndex(now, DAILY_TEXTS.length)] : CATEGORY_TEXT[filter];
  const day = new Date(now);
  const { pick, circle } = data;
  const pName = pick ? displayName(pick.person, gender) : '';
  const pFem = pick ? isFemale(pick.person, gender) : false;
  const easy = pick ? withPronoun(EASY[pick.action] ?? 'خطوةٌ صغيرة تكفي', pFem) : '';
  const occ = pick?.why === 'occasion' ? upcomingOccasions([pick.person], today, 0)[0] : undefined;
  const circleTotal = circle.reached.length + circle.waiting.length;

  const rows = (list: typeof ranked) => (
    <Card className="p-1.5">
      <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
        {list.map(({ person, status }) => (
          <PersonRow key={person.id} person={person} status={status} onOpen={() => onOpen(person.id)} onLog={(s) => onLog(person, s)} />
        ))}
      </ul>
    </Card>
  );

  return (
    <>
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
        <div className="relative">
          <p className="text-xs text-on-accent/75">
            {WEEKDAY_AR[day.getDay()]} · صلة اليوم
          </p>
          <h2 className="mt-1 text-[22px] font-display font-bold leading-snug text-balance">
            {allDue.length
              ? allDue.length === 1
                ? `${displayName(allDue[0].person, gender)} ${isFemale(allDue[0].person, gender) ? 'تنتظر' : 'ينتظر'} صلتك`
                : `${ar(allDue.length)} ينتظرون صلتك اليوم`
              : pick?.why === 'ill'
                ? `عُد ${pName}`
                : occ
                  ? occ.kind === 'birthday'
                    ? `يوم ميلاد ${pName}`
                    : `${occ.label} — ${pName}`
                  : data.ranked.length
                    ? 'وصلتَ الجميع في موعدهم'
                    : 'أضف من تحب أن تصلهم'}
          </h2>
          {allDue.length > 1 ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="flex -space-x-2 rtl:space-x-reverse">
                {allDue.slice(0, 4).map((r) => (
                  <span key={r.person.id} className="rounded-full ring-2 ring-teal-dark/40">
                    <Avatar person={r.person} size={28} />
                  </span>
                ))}
              </span>
              <span className="text-[12.5px] text-on-accent/85 truncate">
                {allDue.slice(0, 3).map((r) => displayName(r.person, gender)).join('، ')}
                {allDue.length > 3 ? ` و${ar(allDue.length - 3)} غيرهم` : ''}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-on-accent/80 text-pretty">
              {pick
                ? pick.why === 'due'
                  ? `${dueText(pick.status, pFem)} — ${easy}`
                  : pick.why === 'ill'
                    ? `${pFem ? 'مريضةٌ لم تعدها' : 'مريضٌ لم تعده'} في الأيام الثلاثة الأخيرة — ${easy}`
                    : easy
                : data.ranked.length
                  ? 'بارك الله فيك. سنذكّرك حين يحين موعد أحدهم.'
                  : 'والداك أولاً، ثم أرحامك وجيرانك وأحبابك.'}
            </p>
          )}
          {pick ? (
            <SilahActions pick={pick} onOpen={onOpen} onLog={onLog} onMessage={onMessage} />
          ) : !data.ranked.length ? (
            <Button variant="gold" size="sm" className="mt-4" leftIcon={<UserPlus size={15} />} onClick={onAdd}>
              أضف شخصاً
            </Button>
          ) : null}
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-on-accent/10 px-2 py-3 flex flex-col items-center">
            <div className="relative">
              <ProgressRing
                value={circleTotal ? (circle.reached.length / circleTotal) * 100 : 0}
                size={40}
                strokeWidth={4}
                showPercent={false}
                colorFrom="var(--color-on-accent)"
                colorTo="var(--color-gold-light)"
                trackColor="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
              />
              <span className="absolute inset-0 flex items-center justify-center text-[12px] font-counter font-bold tabular-nums">
                {circleTotal ? ar(circle.reached.length) : '—'}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-on-accent/75 leading-tight text-center">{circleTotal ? `من ${ar(circleTotal)} هذا الأسبوع` : 'دائرة الأسبوع'}</p>
          </div>
          <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
            <Flame size={15} className="mx-auto text-gold-light" aria-hidden />
            <p className="mt-1 text-xl font-counter font-bold tabular-nums">{ar(data.streak)}</p>
            <p className="text-[10px] text-on-accent/75 leading-tight">{data.streak === 1 ? 'أسبوع' : 'أسابيع'} على العهد</p>
          </div>
          <div className="rounded-2xl bg-on-accent/10 px-2 py-3 text-center">
            <HeartHandshake size={15} className="mx-auto text-gold-light" aria-hidden />
            <p className="mt-1 text-xl font-counter font-bold tabular-nums">{ar(data.points)}</p>
            <p className="text-[10px] text-on-accent/75 leading-tight">نقاط اليوم</p>
          </div>
        </div>
      </Card>

      {data.ranked.length > 1 ? (
        <Button variant="secondary" fullWidth leftIcon={<Users size={17} />} onClick={() => setGathering(true)}>
          سجّل اجتماعاً عائلياً
        </Button>
      ) : null}
      <GatheringSheet open={gathering} onClose={() => setGathering(false)} />

      {circleTotal ? <WeekCircleCard reached={circle.reached} waiting={circle.waiting.map((r) => r.person)} onOpen={onOpen} /> : null}

      <Card variant="inset" className="p-4">
        <Quote t={text} size="sm" />
      </Card>

      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 w-max" role="group" aria-label="تصفية حسب الفئة">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
            الكل
          </Pill>
          {CATEGORIES.map((c) => (
            <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
              {CATEGORY_SHORT[c]}
            </Pill>
          ))}
        </div>
      </div>

      {due.length ? (
        <Block title="الأولى بالصلة الآن" subtitle="الوالدان أولاً، ثم الأطول غياباً">
          {rows(shownDue.shown)}
          {shownDue.more ? (
            <Button variant="ghost" size="sm" className="self-center" rightIcon={<ChevronDown size={15} />} onClick={() => setShowAllDue(true)}>
              {othersText(shownDue.more)}
            </Button>
          ) : null}
        </Block>
      ) : null}

      {data.sick.filter(keep).length ? (
        <Block title="عيادة المريض">
          <Card className="p-4 flex flex-col gap-3">
            <Quote t={T.iyada} size="sm" />
            <div className="flex flex-wrap gap-2">
              {data.sick.filter(keep).map((p) => (
                <Button key={p.id} variant="secondary" size="sm" leftIcon={<Stethoscope size={14} />} onClick={() => onOpen(p.id)}>
                  عُد {displayName(p, gender)}
                </Button>
              ))}
            </div>
          </Card>
        </Block>
      ) : null}

      {data.repairs.filter(keep).length ? (
        <Block title="إصلاح قطيعة" subtitle="«ليس الواصلُ بالمكافئ» — رواه البخاري">
          <Card className="p-1.5">
            <ul className="flex flex-col">
              {data.repairs.filter(keep).map((p) => {
                const steps = repairSteps(p, data.idx.get(p.id) ?? []);
                const n = steps.filter(Boolean).length;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpen(p.id)} className="w-full flex items-center gap-3 rounded-[var(--radius-inner)] px-2.5 py-2.5 text-start hover:bg-teal/5">
                      <Avatar person={p} size={42} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark truncate">{displayName(p, gender)}</span>
                        <span className="block text-[12px] text-text-muted">الخطوة {ar(Math.min(n + 1, steps.length))} من {ar(steps.length)}</span>
                      </span>
                      <span className="flex gap-1" aria-hidden>
                        {steps.map((d, i) => (
                          <span key={i} className={['w-2 h-2 rounded-full', d ? 'bg-gold' : 'bg-cream-dark dark:bg-white/[0.12]'].join(' ')} />
                        ))}
                      </span>
                      <Sprout size={16} className="text-gold-dark dark:text-gold-light" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Block>
      ) : null}

      {data.upcoming.filter((u) => keep(u.person)).length ? (
        <Block title="مناسبات قريبة">
          <Card className="p-1.5">
            <ul className="flex flex-col">
              {data.upcoming
                .filter((u) => keep(u.person))
                .slice(0, 5)
                .map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => onOpen(u.person.id)} className="w-full flex items-center gap-3 rounded-[var(--radius-inner)] px-2.5 py-2.5 text-start hover:bg-teal/5">
                      <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
                        <CalendarHeart size={17} aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark truncate">
                        {u.kind === 'birthday' ? 'يوم ميلاد' : u.label} {displayName(u.person, gender)}
                      </span>
                      <span className="text-[12px] text-text-muted shrink-0">{u.daysLeft === 0 ? 'اليوم' : u.daysLeft === 1 ? 'غداً' : `بعد ${daysAr(u.daysLeft)}`}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        </Block>
      ) : null}

      {soon.length ? <Block title="قريباً" subtitle="الأقرب موعداً أولاً">{rows(soon)}</Block> : null}
      {done.length ? <Block title="وصلتهم اليوم" subtitle="تقبّل الله منك">{rows(done)}</Block> : null}

      {data.deceased.filter(keep).length ? (
        <Block title="من سبقونا إلى الله" subtitle="دعاءٌ وصدقة وصلةُ أهل ودّهم">
          <Card className="p-1.5">
            <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {data.deceased.filter(keep).map((p) => {
                const st = statusOf(p, data.idx.get(p.id) ?? [], today);
                const f = isFemale(p, gender);
                return (
                  <PersonRow
                    key={p.id}
                    person={p}
                    status={st.state === 'late' ? { ...st, state: 'due' } : st}
                    sub={withPronoun(st.state === 'done' ? 'دعوت ل{ه} اليوم، رحم{ه} الله' : 'رحم{ه} الله — ادعُ ل{ه} اليوم', f)}
                    onOpen={() => onOpen(p.id)}
                    onLog={(s) => onLog(p, s)}
                  />
                );
              })}
            </ul>
          </Card>
        </Block>
      ) : null}

      {!ranked.length && !data.deceased.filter(keep).length && filter !== 'all' ? (
        <p className="text-[12.5px] text-text-muted text-center py-4">لا أحد في «{CATEGORY_SHORT[filter]}» بعد.</p>
      ) : null}

      <Button variant="secondary" fullWidth leftIcon={<UserPlus size={17} />} onClick={onAdd}>
        أضف شخصاً
      </Button>
    </>
  );
}
