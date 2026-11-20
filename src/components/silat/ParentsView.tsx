import { useMemo } from 'react';
import { Check, HandHeart, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { Pill, useNow } from '@/components/study/studyUi';
import { useSettingsStore } from '@/store/settingsStore';
import { useSilatStore } from '@/store/silatStore';
import { dayKey } from '@/store/studyModel';
import { BIRR_IDEAS, CONTINUING_DEEDS, PARENT_DUAS, T, withPronoun, type ContactType } from '@/data/silatContent';
import { byPerson, categoryOf, displayName, isFemale, isLive, statusOf, type Person } from '@/store/silatModel';
import { closenessOf } from '@/data/silatContent';
import { PersonRow } from './PersonRow';
import { Quote, TYPE_ICON, dailyIndex, logContact, typeTone } from './silatUi';

/**
 * «بِرّ الوالدين»: the daily du'a for them (logs a du'a for each parent in one
 * tap), today's three ideas of بِرّ, the deeds that still reach a parent who
 * has died, and the texts.
 */
export function ParentsView({
  onOpen,
  onLog,
  onAdd,
}: {
  onOpen: (id: string) => void;
  onLog: (p: Person, suggest?: ContactType) => void;
  onAdd: (relation: string) => void;
}) {
  const gender = useSettingsStore((s) => s.gender);
  const people = useSilatStore((s) => s.people);
  const entries = useSilatStore((s) => s.entries);
  const now = useNow(60_000);
  const today = dayKey(now);

  const { parents, mf, idx } = useMemo(() => {
    const parents = people.filter((p) => isLive(p) && categoryOf(p) === 'parents').sort((a, b) => closenessOf(a.relation) - closenessOf(b.relation));
    return { parents, mf: parents.filter((p) => p.relation === 'mother' || p.relation === 'father'), idx: byPerson(entries) };
  }, [people, entries]);

  const living = parents.filter((p) => !p.deceased);
  const gone = parents.filter((p) => p.deceased);
  const duaPending = mf.filter((p) => !(idx.get(p.id) ?? []).some((e) => e.type === 'dua' && e.day === today));
  const second = PARENT_DUAS[1 + dailyIndex(now, PARENT_DUAS.length - 1)];
  const ideas = [0, 1, 2].map((i) => BIRR_IDEAS[dailyIndex(now, BIRR_IDEAS.length, i * 4)]);
  const livingMF = mf.filter((p) => !p.deceased);
  const hasMother = mf.some((p) => p.relation === 'mother');
  const hasFather = mf.some((p) => p.relation === 'father');
  const both = mf.length > 1;

  return (
    <>
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-6 -end-8 w-40 opacity-15" />
        <div className="relative flex flex-col gap-3">
          <p className="text-xs text-on-accent/75 flex items-center gap-1.5">
            <HandHeart size={14} aria-hidden /> دعاء اليوم للوالدين
          </p>
          <Quote t={PARENT_DUAS[0]} size="lg" onAccent />
          <Quote t={second} size="sm" onAccent />
          {mf.length ? (
            <Button
              variant="gold"
              size="sm"
              className="self-start"
              disabled={!duaPending.length}
              leftIcon={<Check size={15} />}
              onClick={() => duaPending.forEach((p) => logContact(p, 'dua'))}
            >
              {duaPending.length ? (both && duaPending.length > 1 ? 'دعوتُ لهما اليوم' : withPronoun('دعوتُ ل{ه} اليوم', isFemale(duaPending[0], gender))) : 'تقبّل الله دعاءك'}
            </Button>
          ) : null}
        </div>
      </Card>

      {!hasMother || !hasFather ? (
        <Card className="p-4 flex flex-col gap-3">
          <p className="text-[13.5px] text-text-primary dark:text-text-on-dark text-pretty">
            أضف {!hasMother && !hasFather ? 'والديك' : !hasMother ? 'أمك' : 'أباك'} — أحياءً أو رحمهم الله — ليصلك تذكير البرّ ودعاء كل يوم.
          </p>
          <div className="flex gap-2">
            {!hasMother ? (
              <Button size="sm" variant="secondary" leftIcon={<UserPlus size={15} />} onClick={() => onAdd('mother')}>
                أضف أمي
              </Button>
            ) : null}
            {!hasFather ? (
              <Button size="sm" variant="secondary" leftIcon={<UserPlus size={15} />} onClick={() => onAdd('father')}>
                أضف أبي
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {living.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="والداك" subtitle="«أمُّك، ثم أمُّك، ثم أمُّك، ثم أبوك»" />
          <Card className="p-1.5">
            <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {living.map((p) => (
                <PersonRow key={p.id} person={p} status={statusOf(p, idx.get(p.id) ?? [], today)} onOpen={() => onOpen(p.id)} onLog={(s) => onLog(p, s)} />
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {livingMF.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="أفكار للبرّ اليوم" subtitle={livingMF.length > 1 ? 'ثلاث كل يوم — اضغط اسم من فعلتها له' : 'ثلاث أفكار جديدة كل يوم'} />
          <Card className="p-1.5">
            <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {ideas.map((idea) => {
                const Icon = idea.type ? TYPE_ICON[idea.type] : HandHeart;
                return (
                  <li key={idea.text} className="flex flex-col gap-2 px-2.5 py-3">
                    <span className="flex items-start gap-3">
                      <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', idea.type ? typeTone(idea.type) : 'bg-gold/15 text-gold-dark dark:text-gold-light'].join(' ')}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="flex-1 text-[13.5px] leading-relaxed text-text-primary dark:text-text-on-dark text-pretty pt-1.5">{idea.text}</span>
                    </span>
                    {idea.type ? (
                      <span className="flex flex-wrap gap-1.5 ps-12">
                        {livingMF.map((p) => (
                          <Pill key={p.id} active={false} onClick={() => logContact(p, idea.type!)}>
                            <Check size={14} className="inline -mt-0.5 me-1" aria-hidden />
                            {livingMF.length > 1 ? displayName(p, gender) : 'فعلتُها'}
                          </Pill>
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}

      {gone.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="برٌّ لا ينقطع" subtitle={gone.map((p) => `${displayName(p, gender)} ${isFemale(p, gender) ? 'رحمها' : 'رحمه'} الله`).join('، ')} />
          <Card className="p-1.5">
            <ul className="flex flex-col divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {CONTINUING_DEEDS.map((d) => {
                const Icon = TYPE_ICON[d.type];
                return (
                  <li key={d.type} className="flex flex-col gap-2 px-2.5 py-3">
                    <span className="flex items-center gap-3">
                      <span className={['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', typeTone(d.type)].join(' ')}>
                        <Icon size={17} aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark">{withPronoun(d.title, isFemale(gone[0], gender), gone.length > 1)}</span>
                        <span className="block text-[11.5px] text-text-muted">{withPronoun(d.body, isFemale(gone[0], gender), gone.length > 1)}</span>
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5 ps-12">
                      {gone.map((p) => (
                        <Pill key={p.id} active={false} onClick={() => logContact(p, d.type)}>
                          <Check size={14} className="inline -mt-0.5 me-1" aria-hidden />
                          {gone.length > 1 ? displayName(p, gender) : 'فعلتُه'}
                        </Pill>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card variant="inset" className="p-4 flex flex-col gap-3">
            <Quote t={T.inqata} size="sm" />
            <Quote t={T.wudd} size="sm" />
            <Quote t={T.hajjAnha} size="sm" />
          </Card>
        </section>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="من نور الوحي" />
        <Card className="p-4 flex flex-col gap-4">
          <Quote t={T.ihsan} />
          <Quote t={T.uff} />
          <Quote t={T.ahabb} size="sm" />
          <Quote t={T.ummuk} size="sm" />
          <Quote t={T.raghima} size="sm" />
        </Card>
      </section>
    </>
  );
}
