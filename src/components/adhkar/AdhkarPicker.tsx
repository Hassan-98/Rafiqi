import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ChevronLeft, Clock, Plus, Trash2, CircleDot, Headphones } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ArchMotif, Medallion, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { SectionInsights } from '@/components/stats/SectionInsights';
import { freshSession, type DhikrSetProgress } from '@/store/dhikrSessionStore';
import { useTasbihStore } from '@/store/tasbihStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { adhkarAudio } from '@/data/adhkarAudio';
import { Ring } from './Ring';
import { isItemDone, remainingMinutes, type NowSlot, type SetDescriptor } from './adhkarSets';
import { POST_PRAYER_NAME, POST_PRAYER_ORDER, postPrayerSetId } from './postPrayer';
import { usePrayerLogStore } from '@/store/prayerLogStore';

export interface SetProgress {
  total: number;
  completed: number;
  reps: number;
  minutes: number;
  started: boolean;
  done: boolean;
}

export function setProgress(set: SetDescriptor, raw: DhikrSetProgress | undefined): SetProgress {
  const { counts, skipped } = freshSession(raw);
  const total = set.items.length;
  let completed = 0;
  let reps = 0;
  for (const it of set.items) {
    if (isItemDone(it, counts, skipped)) completed++;
    reps += Math.min(it.count, counts[it.id] ?? 0);
  }
  return {
    total,
    completed,
    reps,
    minutes: remainingMinutes(set.items, counts, skipped),
    started: completed > 0 && completed < total,
    done: total > 0 && completed === total,
  };
}

const minutesLabel = (m: number) =>
  m <= 1 ? 'دقيقة واحدة' : m === 2 ? 'دقيقتان' : m <= 10 ? `${toArabicDigits(m)} دقائق` : `${toArabicDigits(m)} دقيقة`;
const dhikrCount = (n: number) =>
  n === 1 ? 'ذكر واحد' : n === 2 ? 'ذكران' : n <= 10 ? `${toArabicDigits(n)} أذكار` : `${toArabicDigits(n)} ذكراً`;

interface AdhkarPickerProps {
  sets: SetDescriptor[];
  sessions: Record<string, DhikrSetProgress>;
  slot: NowSlot;
  onOpen: (id: string) => void;
  /** Open the set already in listening mode. */
  onListen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

/** The الأذكار landing: «الآن» hero, insights, the built-in sets, the
 *  misbaha, and the user's own sets. */
/** Does any dhikr in the set have a recitation? */
const canListen = (set: SetDescriptor) => set.items.some((it) => adhkarAudio(it.id));

export function AdhkarPicker({ sets, sessions, slot, onOpen, onListen, onCreate, onDelete }: AdhkarPickerProps) {
  const progress = useMemo(() => {
    const out: Record<string, SetProgress> = {};
    for (const s of sets) out[s.id] = setProgress(s, sessions[s.id]);
    return out;
  }, [sets, sessions]);

  const builtin = sets.filter((s) => !s.custom && !s.library && !s.prayer);
  const custom = sets.filter((s) => s.custom);
  const library = sets.filter((s) => s.library);
  // Post-prayer time → the adhkar of the prayer that just passed.
  const nowId = slot.setId === 'postPrayer' ? postPrayerSetId(slot.prayer.prayer) : slot.setId;
  const nowSet = sets.find((s) => s.id === nowId) ?? builtin[0];

  const today = useMemo(() => {
    let done = 0;
    let reps = 0;
    for (const s of sets) {
      if (progress[s.id].done) done++;
      reps += progress[s.id].reps;
    }
    return { done, reps };
  }, [sets, progress]);

  return (
    <div className="flex flex-col gap-6">
      {nowSet ? (
        <NowHero
          set={nowSet}
          p={progress[nowSet.id]}
          kicker={slot.kicker}
          today={today}
          onOpen={() => onOpen(nowSet.id)}
          onListen={canListen(nowSet) && !progress[nowSet.id].done ? () => onListen(nowSet.id) : undefined}
        />
      ) : null}

      <SectionInsights domain="dhikr" statsTo="/stats/dhikr" />

      <section className="flex flex-col gap-3">
        <SectionTitle title="مجموعات الأذكار" subtitle="يُحفظ تقدّمك، فتابع متى شئت" />
        <div className="grid grid-cols-2 gap-3">
          {builtin.map((s) =>
            s.id === 'postPrayer' ? (
              <PostPrayerTile key={s.id} slot={slot} onOpen={(p) => onOpen(postPrayerSetId(p))} />
            ) : (
              <SetTile
                key={s.id}
                set={s}
                p={progress[s.id]}
                isNow={s.id === slot.setId}
                onOpen={() => onOpen(s.id)}
                onListen={canListen(s) ? () => onListen(s.id) : undefined}
              />
            ),
          )}
        </div>
      </section>

      {library.length > 0 ? <MoreAdhkar sets={library} progress={progress} onOpen={onOpen} /> : null}

      <TasbihEntry />

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="مجموعاتي"
          subtitle="أذكار تختارها أو تكتبها بنفسك"
          action={
            custom.length > 0 ? (
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-2"
              >
                <Plus size={14} /> جديدة
              </button>
            ) : null
          }
        />
        {custom.length > 0 ? (
          <Card className="p-1.5">
            {custom.map((s, i) => {
              const p = progress[s.id];
              return (
                <div
                  key={s.id}
                  className={[
                    'flex items-center gap-1 rounded-[var(--radius-inner)] hover:bg-teal/5',
                    i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
                  ].join(' ')}
                >
                  <button type="button" onClick={() => onOpen(s.id)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-start">
                    <Ring
                      value={p.total ? p.completed / p.total : 0}
                      size={40}
                      stroke={9}
                      className={p.done ? 'text-gold' : 'text-teal dark:text-teal-light'}
                    >
                      {p.done ? (
                        <Check size={15} className="text-gold-dark dark:text-gold-light" />
                      ) : (
                        <s.Icon size={15} className="text-teal dark:text-teal-light" />
                      )}
                    </Ring>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{s.label}</span>
                      <span className="block text-[11px] text-text-muted">
                        {dhikrCount(p.total)}
                        {p.done ? ' · مكتملة اليوم' : p.completed > 0 ? ` · ${toArabicDigits(p.completed)} من ${toArabicDigits(p.total)}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s.id)}
                    aria-label={`حذف ${s.label}`}
                    className="w-11 h-11 me-1 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </Card>
        ) : (
          <HapticPressable
            onClick={onCreate}
            className="w-full text-start rounded-[var(--radius-card)] border border-dashed border-teal/30 bg-teal/[0.03] p-4 flex items-center gap-3 hover:bg-teal/5 transition-colors"
          >
            <span className="w-11 h-11 rounded-2xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <Plus size={20} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark">أنشئ مجموعتك الخاصة</span>
              <span className="block text-[11px] text-text-muted text-pretty">اختر من أذكار الصباح والمساء والنوم، أو اكتب ذكرك وعدده</span>
            </span>
          </HapticPressable>
        )}
      </section>
    </div>
  );
}

function NowHero({
  set,
  p,
  kicker,
  today,
  onOpen,
  onListen,
}: {
  set: SetDescriptor;
  p: SetProgress;
  kicker: string;
  today: { done: number; reps: number };
  onOpen: () => void;
  onListen?: () => void;
}) {
  const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
  const status = p.done
    ? 'أتممتها اليوم، تقبّل الله منك'
    : p.started
      ? `قرأت ${toArabicDigits(p.completed)} من ${toArabicDigits(p.total)}، تابع من حيث توقفت`
      : `${dhikrCount(p.total)} تنتظرك الآن`;
  const cta = p.done ? 'مراجعة' : p.started ? 'متابعة' : 'ابدأ الآن';

  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-5 -end-6 w-40 opacity-[0.13]" />
      <p className="relative flex items-center gap-1.5 text-xs text-on-accent/80">
        <Star8 size={10} className="text-gold-light" />
        الآن · {kicker}
      </p>
      <div className="relative mt-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-ornate text-[32px] leading-[1.25] font-bold text-balance">{set.label}</h2>
          <p className="mt-1 text-[13px] text-on-accent/80 text-pretty">{status}</p>
        </div>
        <Ring value={pct / 100} size={86} stroke={7} className="text-gold-light" trackClassName="text-on-accent/15">
          {p.done ? (
            <Check size={30} strokeWidth={2.6} className="text-gold-light" />
          ) : (
            <span className="flex flex-col items-center leading-none">
              <span className="font-counter text-xl font-bold tabular-nums">{toArabicDigits(p.completed)}</span>
              <span className="mt-1 text-[10px] text-on-accent/70 font-counter">من {toArabicDigits(p.total)}</span>
            </span>
          )}
        </Ring>
      </div>
      <div className="relative mt-4 flex items-center gap-3">
        <HapticPressable
          onClick={onOpen}
          haptic="medium"
          className="min-h-12 px-5 rounded-2xl bg-on-accent text-teal-dark font-bold text-[15px] inline-flex items-center gap-1.5 shadow-[var(--shadow-sm)]"
        >
          {cta}
          <ChevronLeft size={17} />
        </HapticPressable>
        {onListen ? (
          <HapticPressable
            onClick={onListen}
            aria-label={`استمع إلى ${set.label}`}
            className="min-h-12 px-4 rounded-2xl bg-on-accent/12 ring-1 ring-on-accent/20 text-on-accent font-semibold text-[14px] inline-flex items-center gap-1.5"
          >
            <Headphones size={16} />
            استمع
          </HapticPressable>
        ) : null}
        {!p.done && p.minutes > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-on-accent/80">
            <Clock size={13} /> نحو {minutesLabel(p.minutes)}
          </span>
        ) : null}
      </div>
      <p className="relative mt-4 pt-3 border-t border-on-accent/15 text-[11.5px] text-on-accent/80">
        اليوم:{' '}
        <b className="font-counter text-on-accent">{toArabicDigits(today.done)}</b>{' '}
        {today.done === 1 ? 'مجموعة مكتملة' : 'مجموعات مكتملة'} ·{' '}
        <b className="font-counter text-on-accent">{toArabicDigits(today.reps)}</b> تكراراً
      </p>
    </Card>
  );
}

type Tone = { surface: string; chip: string; arc: string; track: string; title: string; meta: string };
const TONES: Record<string, Tone> = {
  morning: {
    surface: 'bg-white dark:bg-dark-card bg-[image:var(--gradient-gold-soft)] ring-gold/25 dark:ring-gold/15',
    chip: 'bg-gold/15 text-gold-dark dark:text-gold-light',
    arc: 'text-gold',
    track: 'text-gold/15',
    title: 'text-text-primary dark:text-text-on-dark',
    meta: 'text-text-muted',
  },
  evening: {
    surface: 'bg-white dark:bg-dark-card bg-[image:var(--gradient-teal-soft)] ring-teal/15 dark:ring-teal/20',
    chip: 'bg-teal/12 text-teal dark:text-teal-light',
    arc: 'text-teal dark:text-teal-light',
    track: 'text-teal/12',
    title: 'text-text-primary dark:text-text-on-dark',
    meta: 'text-text-muted',
  },
  sleep: {
    surface: 'bg-[image:var(--gradient-night)] ring-white/[0.07]',
    chip: 'bg-white/10 text-gold-light',
    arc: 'text-gold-light',
    track: 'text-white/10',
    title: 'text-text-on-dark',
    meta: 'text-text-on-dark/60',
  },
  postPrayer: {
    surface: 'bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06]',
    chip: 'bg-teal/10 text-teal dark:text-teal-light',
    arc: 'text-teal dark:text-teal-light',
    track: 'text-cream-dark dark:text-dark-surface',
    title: 'text-text-primary dark:text-text-on-dark',
    meta: 'text-text-muted',
  },
};

function SetTile({
  set,
  p,
  isNow,
  onOpen,
  onListen,
}: {
  set: SetDescriptor;
  p: SetProgress;
  isNow: boolean;
  onOpen: () => void;
  onListen?: () => void;
}) {
  const tone = TONES[set.id] ?? TONES.postPrayer;
  const status = p.done
    ? 'مكتملة اليوم'
    : p.started
      ? `${toArabicDigits(p.completed)}/${toArabicDigits(p.total)} · بقي ${minutesLabel(p.minutes)}`
      : `نحو ${minutesLabel(p.minutes)}`;
  return (
    <div className="relative">
      <HapticPressable
        onClick={onOpen}
        aria-label={`${set.label} — ${status}`}
        className={[
          'relative isolate overflow-hidden w-full h-full text-start rounded-[var(--radius-card)] p-4 flex flex-col gap-4 min-h-38',
          'ring-1 shadow-[var(--shadow-sm)]',
          tone.surface,
        ].join(' ')}
      >
        <span className="flex items-start justify-between">
          <Ring value={p.total ? p.completed / p.total : 0} size={50} stroke={7} className={tone.arc} trackClassName={tone.track}>
            <span className={`w-9 h-9 rounded-full inline-flex items-center justify-center ${tone.chip}`}>
              {p.done ? <Check size={18} strokeWidth={2.6} /> : <set.Icon size={18} />}
            </span>
          </Ring>
          {isNow && !p.done ? (
            <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-gold/20 text-gold-dark dark:text-gold-light">
              الآن
            </span>
          ) : p.started ? (
            <span className={`font-counter text-xs font-bold ${set.id === 'sleep' ? 'text-gold-light' : 'text-teal dark:text-teal-light'}`}>
              {toArabicDigits(Math.round((p.completed / p.total) * 100))}٪
            </span>
          ) : null}
        </span>
        <span className={`mt-auto block ${onListen ? 'pe-10' : ''}`}>
          <span className={`block text-[15px] font-bold truncate ${tone.title}`}>{set.label}</span>
          <span className={`block text-[11px] mt-0.5 ${tone.meta}`}>
            {set.when ? `${set.when} · ` : ''}
            {dhikrCount(p.total)}
          </span>
          <span
            className={[
              'block text-[11px] font-semibold mt-1.5',
              set.id === 'sleep' ? 'text-gold-light' : p.done ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light',
            ].join(' ')}
          >
            {status}
          </span>
        </span>
      </HapticPressable>
      {onListen ? (
        // A sibling, not a child: a button can't nest inside the tile's button.
        <HapticPressable
          onClick={onListen}
          aria-label={`استمع إلى ${set.label}`}
          className={[
            'absolute bottom-2.5 end-2.5 w-11 h-11 rounded-2xl inline-flex items-center justify-center',
            set.id === 'sleep' ? 'bg-white/10 text-gold-light' : 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light',
          ].join(' ')}
        >
          <Headphones size={17} />
        </HapticPressable>
      ) : null}
    </div>
  );
}

/**
 * «أذكار بعد الصلاة» — five readings a day, one per fard: a dot per prayer
 * (gold once its adhkar are said), opening the prayer that just passed.
 */
function PostPrayerTile({ slot, onOpen }: { slot: NowSlot; onOpen: (p: (typeof POST_PRAYER_ORDER)[number]) => void }) {
  const day = usePrayerLogStore((s) => s.log[slot.prayer.dateKey]);
  const cur = slot.prayer.prayer;
  const said = POST_PRAYER_ORDER.filter((p) => day?.[p]?.adhkar).length;
  const curSaid = !!day?.[cur]?.adhkar;
  const isNow = slot.setId === 'postPrayer' && !curSaid;
  return (
    <HapticPressable
      onClick={() => onOpen(cur)}
      aria-label={`أذكار بعد ${POST_PRAYER_NAME[cur]} — قيلت بعد ${toArabicDigits(said)} من ٥ صلوات اليوم`}
      className="relative isolate overflow-hidden w-full h-full text-start rounded-[var(--radius-card)] p-4 flex flex-col gap-4 min-h-38 ring-1 shadow-[var(--shadow-sm)] bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06]"
    >
      <span className="flex items-start justify-between">
        <Ring value={said / 5} size={50} stroke={7} className={said === 5 ? 'text-gold' : 'text-teal dark:text-teal-light'} trackClassName="text-cream-dark dark:text-dark-surface">
          <span className="w-9 h-9 rounded-full inline-flex items-center justify-center bg-teal/10 text-teal dark:text-teal-light">
            {said === 5 ? <Check size={18} strokeWidth={2.6} /> : <span className="font-counter text-[13px] font-bold">{toArabicDigits(said)}/٥</span>}
          </span>
        </Ring>
        {isNow ? (
          <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 bg-gold/20 text-gold-dark dark:text-gold-light">الآن</span>
        ) : null}
      </span>
      <span className="mt-auto block">
        <span className="block text-[15px] font-bold truncate text-text-primary dark:text-text-on-dark">أذكار بعد الصلاة</span>
        <span className="block text-[11px] mt-0.5 text-text-muted">بعد كل فريضة، خمس مرات في اليوم</span>
        <span className="mt-2 flex items-center gap-1" aria-hidden>
          {POST_PRAYER_ORDER.map((p) => (
            <span
              key={p}
              className={[
                'flex-1 h-6 rounded-md inline-flex items-center justify-center text-[9.5px] font-bold',
                day?.[p]?.adhkar
                  ? 'bg-[image:var(--gradient-gold)] text-on-accent'
                  : p === cur
                    ? 'bg-teal/12 text-teal dark:text-teal-light ring-1 ring-teal/30'
                    : 'bg-cream-dark/60 dark:bg-dark-surface text-text-muted',
              ].join(' ')}
            >
              {POST_PRAYER_NAME[p].replace('ال', '')}
            </span>
          ))}
        </span>
      </span>
    </HapticPressable>
  );
}

const MORE_COLLAPSED = 6;

/** «المزيد من الأذكار»: every other islambook category, opened in the same reader. */
function MoreAdhkar({ sets, progress, onOpen }: { sets: SetDescriptor[]; progress: Record<string, SetProgress>; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? sets : sets.slice(0, MORE_COLLAPSED);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="المزيد من الأذكار" subtitle="أذكار اليوم والليلة والأدعية كلها" />
      <Card className="p-1.5">
        {shown.map((s, i) => {
          const p = progress[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s.id)}
              className={[
                'w-full flex items-center gap-3 px-3 py-3 text-start rounded-[var(--radius-inner)] hover:bg-teal/5',
                i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
              ].join(' ')}
            >
              <Ring value={p.total ? p.completed / p.total : 0} size={40} stroke={9} className={p.done ? 'text-gold' : 'text-teal dark:text-teal-light'}>
                {p.done ? <Check size={15} className="text-gold-dark dark:text-gold-light" /> : <s.Icon size={15} className="text-teal dark:text-teal-light" />}
              </Ring>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{s.label}</span>
                <span className="block text-[11px] text-text-muted">
                  {dhikrCount(p.total)}
                  {p.done ? ' · مكتملة اليوم' : p.completed > 0 ? ` · ${toArabicDigits(p.completed)} من ${toArabicDigits(p.total)}` : ''}
                </span>
              </span>
              <ChevronLeft size={16} className="text-text-muted shrink-0" />
            </button>
          );
        })}
      </Card>
      {sets.length > MORE_COLLAPSED ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="self-center min-h-10 px-4 text-xs font-bold text-teal dark:text-teal-light"
        >
          {all ? 'عرض أقل' : `عرض الكل (${toArabicDigits(sets.length)})`}
        </button>
      ) : null}
    </section>
  );
}

function TasbihEntry() {
  const navigate = useNavigate();
  const counters = useTasbihStore((s) => s.counters);
  const activeId = useTasbihStore((s) => s.activeId);
  const active = counters.find((c) => c.id === activeId);
  const lifetime = counters.reduce((n, c) => n + c.totalLifetimeCount, 0);
  return (
    <HapticPressable
      onClick={() => navigate('/tasbih')}
      className="relative isolate overflow-hidden w-full text-start rounded-[var(--radius-card)] p-4 flex items-center gap-3.5 bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-1 ring-gold/30 dark:ring-gold/20 shadow-[var(--shadow-sm)]"
    >
      <span aria-hidden className="lattice lattice-fade text-gold" />
      <Medallion size={54} tone="gold">
        <CircleDot size={20} className="text-gold-dark dark:text-gold-light" />
      </Medallion>
      <span className="relative flex-1 min-w-0">
        <span className="block font-bold text-text-primary dark:text-text-on-dark">السبحة</span>
        <span className="block text-xs text-text-muted truncate">
          {active ? `${active.name} · ` : ''}
          {toArabicDigits(lifetime)} تسبيحة منذ البداية
        </span>
      </span>
      <span className="relative text-xs font-semibold text-teal dark:text-teal-light inline-flex items-center gap-0.5">
        سبّح <ChevronLeft size={15} />
      </span>
    </HapticPressable>
  );
}
