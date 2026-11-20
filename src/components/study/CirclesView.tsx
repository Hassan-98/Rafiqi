import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, ClipboardPaste, Clock, ExternalLink, Flame, GraduationCap, Link2, MoreHorizontal, Pause,
  Pencil, Play, Plus, Radio, RotateCcw, Search, Timer, Trash2,
} from 'lucide-react';
import { motion } from '@/lib/motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInput } from '@/components/ui/TextInput';
import { useStudyStore } from '@/store/studyStore';
import {
  PLATFORM_LABEL, SUBJECT_LABEL, WEEKDAY_AR, clockAr, dayKey, durationAr, inAr, lessonList, lessonProgress, lessonsDone, lessonsOnDay, nextSession,
  nextSlotStart, platformPhrase, studyStreak,
  type CircleStatus, type Platform, type StudyCircle,
} from '@/store/studyModel';
import { rescheduleAllStudy } from '@/services/studyReminders';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { PlatformChip, PlatformGlyph, SUBJECT_ICON, openLink, useNow } from './studyUi';
import { CircleFormSheet } from './CircleFormSheet';

const ar = toArabicDigits;
const DAY = 86_400_000;

/** "الأحد ٩:٠٠ م · بعد ٣ ساعات" — or "اليوم" / "غداً" for the near ones. */
export function whenAr(at: number, now: number): string {
  return `${dayWord(at, now)} ${clockAr(at)}`;
}

function dayWord(at: number, now: number): string {
  const today = dayKey(now);
  const k = dayKey(at);
  const tomorrow = dayKey(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + 1));
  return k === today ? 'اليوم' : k === tomorrow ? 'غداً' : WEEKDAY_AR[new Date(at).getDay()];
}

/** «درس واحد» / «درسان» / «٣ دروس» / «٢٤ درساً». */
export const lessonsAr = (n: number) => (n === 1 ? 'درس واحد' : n === 2 ? 'درسان' : `${ar(n)} ${n <= 10 ? 'دروس' : 'درساً'}`);
/** Minutes as the hours they add up to, past the first hour. */
export const hoursAr = (min: number) => (min >= 60 ? durationAr(Math.round(min / 60) * 60) : durationAr(min));

/** Lesson numbers already attended/watched — the series map and «التالي». */
export function doneNumbers(c: StudyCircle): Set<number> {
  return new Set(c.log.filter((l) => l.status !== 'missed' && !l.partial && l.n).map((l) => l.n as number));
}

/** A series' next lesson: the first number not yet done (unnumbered old entries count from the start). */
export function nextLessonN(c: StudyCircle): number {
  const done = doneNumbers(c);
  // A log whose lesson was removed from the list (detached) is no early lesson.
  let n = c.log.filter((l) => l.status !== 'missed' && !l.n && !l.detached && !l.partial).length + 1;
  while (done.has(n)) n++;
  return n;
}

export type UpNext =
  | { kind: 'session'; at: number; live: boolean }
  | { kind: 'lesson'; n: number; title?: string; durationMin?: number; url?: string }
  | null;

/**
 * What this circle asks of you next: a session (live now, or its next time) or,
 * for a recorded series / a channel, its next lesson — title, length and link
 * when the series was read from its link (episodes).
 */
export function upNext(c: StudyCircle, now: number): UpNext {
  if (c.status !== 'active') return null;
  const s = nextSession(c, now);
  const session = s ? ({ kind: 'session', at: s.at, live: s.live } as const) : null;
  // A live circle meets; a channel has no order to follow — only its sessions, if any.
  if (c.format !== 'series') return session;
  // A recorded series with a session today: the session first.
  if (session && (session.live || session.at - now < DAY / 2)) return session;
  const n = nextLessonN(c);
  if (c.totalLessons && n > c.totalLessons) return session;
  const ep = c.episodes?.[n - 1];
  return { kind: 'lesson', n, title: ep?.title, durationMin: ep?.durationMin ?? (lessonList(c).length <= 1 ? c.durationMin : undefined), url: ep?.url ?? c.link };
}

/** The one-tap "I did it" for a circle — attendance for live, the next lesson for series/channel. */
export function useQuickLog(c: StudyCircle) {
  const markLessonDone = useStudyStore((s) => s.markLessonDone);
  const logSession = useStudyStore((s) => s.logSession);
  const undoLastLesson = useStudyStore((s) => s.undoLastLesson);
  const loggedToday = lessonsOnDay(c, dayKey(Date.now())) > 0;
  const label = c.format === 'live' ? 'سجّل حضوري' : 'شاهدت الدرس';
  const log = () => {
    if (c.format === 'live') markLessonDone(c.id);
    else logSession(c.id, { n: nextLessonN(c) });
    const done = lessonsDone(c) + 1;
    toast.success(
      c.format === 'live' ? 'سُجّل حضورك، بارك الله فيك' : `أحسنت، الدرس ${ar(done)}${c.totalLessons ? ` من ${ar(c.totalLessons)}` : ''}`,
    );
  };
  return { loggedToday, label, log, undo: () => undoLastLesson(c.id) };
}

/** The line under a circle's name: when it meets, or which lesson comes next. */
function nextLine(c: StudyCircle, now: number): { text: string; live?: boolean } {
  if (c.status === 'paused') return { text: 'متوقفة مؤقتاً، بلا تنبيهات' };
  if (c.status === 'done') return { text: `أتممتها · ${lessonsAr(lessonsDone(c))}` };
  const up = upNext(c, now);
  if (up?.kind === 'session') return up.live ? { text: `يُبث الآن ${platformPhrase(c.platform)}`.trim(), live: true } : { text: `${whenAr(up.at, now)} · ${inAr(up.at - now)}` };
  if (up?.kind === 'lesson') {
    const of = c.totalLessons ? ` من ${ar(c.totalLessons)}` : '';
    return { text: `التالي: الدرس ${ar(up.n)}${of}${up.title ? ` · ${up.title}` : ''}` };
  }
  if (c.format === 'channel') return { text: lessonsDone(c) ? `ما تابعته: ${lessonsAr(lessonsDone(c))}` : 'تابع جديدها وسجّل ما تشاهده' };
  return { text: lessonsDone(c) ? `${lessonsAr(lessonsDone(c))} مسجّلة` : 'لا مواعيد بعد' };
}

// ── manage: one sheet for the list and the circle page ───────────────────────

/**
 * «إدارة الحلقة»: open, edit (details / schedule), pause or resume, finish or
 * reopen, delete — the same sheet from a card's «⋯» and the circle page.
 */
export function CircleActionsSheet({
  c,
  open,
  onClose,
  onEdit,
  onDeleted,
}: {
  c: StudyCircle;
  open: boolean;
  onClose: () => void;
  onEdit: (step: number) => void;
  onDeleted?: () => void;
}) {
  const setStatus = useStudyStore((s) => s.setStatus);
  const removeCircle = useStudyStore((s) => s.removeCircle);
  const [confirm, setConfirm] = useState(false);
  const status = (s: CircleStatus, msg: string) => {
    setStatus(c.id, s);
    void rescheduleAllStudy();
    toast.success(msg);
    onClose();
  };
  const rows: { Icon: typeof Pencil; label: string; hint?: string; tone?: 'danger'; run: () => void }[] = [
    ...(c.link ? [{ Icon: ExternalLink, label: 'افتح الرابط', hint: platformPhrase(c.platform) || undefined, run: () => (void openLink(c.link), onClose()) }] : []),
    { Icon: Pencil, label: 'تعديل البيانات', hint: 'الاسم، الشيخ، النوع، المدة', run: () => (onClose(), onEdit(1)) },
    { Icon: CalendarClock, label: 'المواعيد والتنبيهات', hint: 'أيام الدرس، أوقاته، التذكير', run: () => (onClose(), onEdit(2)) },
    c.status === 'paused'
      ? { Icon: Play, label: 'استئناف الحلقة', run: () => status('active', 'استُؤنفت الحلقة') }
      : c.status === 'active'
        ? { Icon: Pause, label: 'إيقاف مؤقت', hint: 'تبقى في «المتوقفة» بلا تنبيهات', run: () => status('paused', 'أُوقفت الحلقة مؤقتاً') }
        : { Icon: RotateCcw, label: 'إعادة فتحها', run: () => status('active', 'أُعيد فتح الحلقة') },
    ...(c.status !== 'done' ? [{ Icon: CircleCheck, label: 'أتممتها', hint: 'تنتقل إلى «المكتملة»', run: () => status('done', 'أتممت الحلقة، بارك الله فيك') }] : []),
    { Icon: Trash2, label: 'حذف الحلقة', tone: 'danger', run: () => setConfirm(true) },
  ];
  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={c.title}>
        <ul className="flex flex-col -mx-1">
          {rows.map(({ Icon, label, hint, tone, run }, i) => (
            <li key={label} className={i ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''}>
              <button type="button" onClick={run} className="w-full min-h-14 flex items-center gap-3 px-2 py-2.5 rounded-[var(--radius-inner)] text-start hover:bg-teal/5">
                <span
                  className={[
                    'w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0',
                    tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-teal/10 text-teal dark:text-teal-light',
                  ].join(' ')}
                >
                  <Icon size={18} aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={['block text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>{label}</span>
                  {hint ? <span className="block text-[11.5px] text-text-muted truncate">{hint}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
      <ConfirmDialog
        open={confirm}
        title="حذف الحلقة؟"
        message="سيُحذف سجل دروسها وفوائدها وتُلغى تنبيهاتها. إن أردت الاحتفاظ بها فاجعلها «مكتملة» بدلاً من الحذف."
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          removeCircle(c.id);
          void rescheduleAllStudy();
          setConfirm(false);
          onClose();
          onDeleted?.();
        }}
      />
    </>
  );
}

// ── a circle in the list ─────────────────────────────────────────────────────

/** What a circle is on the shelf — each gets its own cover (owner 2026-11-19). */
type CoverKind = 'series' | 'single' | 'majlis' | 'channel';
const coverKind = (c: StudyCircle, total: number): CoverKind =>
  c.format === 'live' ? 'majlis' : c.format === 'channel' ? 'channel' : total === 1 ? 'single' : 'series';

/** The platform's stamp colour on the cover's light disc. */
const STAMP_INK: Record<Platform, string> = {
  telegram: 'text-sky-600',
  whatsapp: 'text-green-600',
  youtube: 'text-red-600',
  zoom: 'text-blue-600',
  meet: 'text-amber-600',
  website: 'text-teal',
  inperson: 'text-gold-dark',
  other: 'text-text-secondary',
};

/** Moving a card in «ترتيبي». */
export interface ArrangeControls {
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
}

/**
 * A circle on the shelf («مكتبتي») — a cover by what it is (owner 2026-11-19:
 * «فرق في الشكل بين السلسلة و الحلقة الواحدة و انواع الدروس و انواع المنصات»):
 * a SERIES is a gilded book (spine, page edge, bookmark ribbon while reading);
 * a SINGLE lesson a sealed letter (parchment, folded corner); a live MAJLIS the
 * accent cover under a mihrab arch; a CHANNEL a periodical (dashed frame). Every
 * cover carries its platform's stamp. Tap opens it; «⋯» manages it; `arrange`
 * swaps both for «قبل / بعد».
 */
export function CircleCard({ c, now, onMore, arrange }: { c: StudyCircle; now: number; onMore: () => void; arrange?: ArrangeControls }) {
  const navigate = useNavigate();
  const Icon = SUBJECT_ICON[c.subject];
  const list = lessonList(c);
  const total = list.length;
  const kind = coverKind(c, total);
  const done = Math.min(total || Infinity, doneNumbers(c).size || lessonsDone(c));
  const next = kind === 'series' && c.status !== 'done' ? nextLessonN(c) : 0;
  const nextName = next && next <= total ? list[next - 1].title || `الدرس ${ar(next)}` : '';
  const line = kind === 'majlis' || kind === 'channel' ? nextLine(c, now) : null;
  const reading = kind === 'series' && done > 0 && done < total && c.status === 'active';
  const lastWatch = c.log.find((l) => l.status !== 'missed');
  const light = kind === 'single'; // the parchment cover takes dark ink

  const surface: Record<CoverKind, string> = {
    series: 'bg-[image:var(--gradient-night)] text-text-on-dark',
    single: 'bg-cream dark:bg-dark-card bg-[image:var(--gradient-gold-soft)] text-text-primary dark:text-text-on-dark',
    majlis: 'bg-[image:var(--gradient-teal)] text-on-accent',
    channel: 'bg-[image:var(--gradient-night)] text-text-on-dark',
  };
  const ink = light ? 'text-gold-dark dark:text-gold-light' : 'text-gold-light';
  const soft = light ? 'text-text-secondary dark:text-text-on-dark/75' : kind === 'majlis' ? 'text-on-accent/80' : 'text-text-on-dark/75';
  const label =
    c.status === 'paused'
      ? 'متوقفة'
      : kind === 'series'
        ? `سلسلة ${SUBJECT_LABEL[c.subject]}`
        : kind === 'single'
          ? `درس ${SUBJECT_LABEL[c.subject]}`
          : kind === 'majlis'
            ? `مجلس ${SUBJECT_LABEL[c.subject]}`
            : `قناة ${SUBJECT_LABEL[c.subject]}`;

  return (
    <div
      className={[
        'relative isolate flex-1 flex flex-col min-h-[248px] overflow-hidden ring-1 shadow-[var(--shadow-md)]',
        kind === 'single' ? 'rounded-[10px] ring-gold/40' : 'rounded-[16px] ring-gold/30',
        surface[kind],
        c.status === 'paused' ? 'saturate-[0.55] opacity-85' : '',
      ].join(' ')}
    >
      <span className={['lattice', light ? 'text-gold' : kind === 'majlis' ? 'text-on-accent' : 'text-gold'].join(' ')} aria-hidden />

      {/* ── the cover's make, by kind ── */}
      {kind === 'series' ? (
        <>
          <span aria-hidden className="absolute inset-y-0 start-0 w-3 bg-black/25 border-e border-gold/35" />
          {/* the page edge, opposite the spine */}
          <span aria-hidden className="absolute inset-y-4 end-0 w-1.5 opacity-50 bg-[repeating-linear-gradient(90deg,var(--color-gold-light)_0_1px,transparent_1px_3px)]" />
          <span aria-hidden className="absolute inset-y-2 start-5 end-3 rounded-[11px] ring-1 ring-gold/40" />
          <span aria-hidden className="absolute inset-y-[11px] start-[23px] end-[15px] rounded-[9px] ring-1 ring-gold/15" />
        </>
      ) : kind === 'single' ? (
        <>
          <span aria-hidden className="absolute inset-2 rounded-[7px] ring-1 ring-gold/35" />
          {/* the folded corner */}
          <span aria-hidden className="absolute top-0 start-0 w-7 h-7 bg-gold/30 [clip-path:polygon(0_0,100%_0,0_100%)]" />
        </>
      ) : kind === 'majlis' ? (
        <>
          <ArchMotif className="absolute top-1 left-1/2 -translate-x-1/2 w-28 h-36 text-on-accent opacity-25" />
          <span aria-hidden className="absolute inset-2 rounded-[12px] ring-1 ring-gold-light/35" />
        </>
      ) : (
        <span aria-hidden className="absolute inset-2 rounded-[12px] border border-dashed border-gold/40" />
      )}
      {reading ? (
        <span
          aria-hidden
          className="absolute top-0 end-12 w-3.5 h-8 bg-[image:var(--gradient-gold)] shadow-[var(--shadow-xs)] [clip-path:polygon(0_0,100%_0,100%_100%,50%_76%,0_100%)]"
        />
      ) : null}
      {/* the platform's stamp */}
      <span
        className={['absolute bottom-3 end-3 w-7 h-7 rounded-full bg-white/95 shadow-[var(--shadow-xs)] ring-1 ring-black/5 inline-flex items-center justify-center', STAMP_INK[c.platform]].join(' ')}
        title={PLATFORM_LABEL[c.platform]}
        aria-label={PLATFORM_LABEL[c.platform]}
      >
        <PlatformGlyph platform={c.platform} size={14} />
      </span>

      <button
        type="button"
        disabled={!!arrange}
        onClick={() => navigate(`/study/circle/${c.id}`)}
        className={['relative flex-1 flex flex-col items-center text-center pt-5 pb-11', kind === 'series' ? 'ps-7 pe-5' : 'px-5'].join(' ')}
        aria-label={`افتح ${label}: ${c.title}`}
      >
        <Medallion size={46} tone="gold">
          <Icon size={18} className={ink} aria-hidden />
        </Medallion>
        <span className={['mt-1.5 text-[10.5px] font-semibold', ink, 'opacity-90'].join(' ')}>{label}</span>
        <span className={['mt-1.5 font-ornate text-[18px] leading-[1.45] line-clamp-3 text-balance', ink].join(' ')}>{c.title}</span>
        {c.teacher ? <span className={['mt-1 text-[11px] line-clamp-1', soft].join(' ')}>{c.teacher}</span> : null}

        <span className="mt-auto pt-3 w-full flex flex-col gap-1.5">
          {kind === 'series' && total ? (
            <>
              <span aria-hidden className="h-1 rounded-full bg-white/10 overflow-hidden">
                <span className="block h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${(done / total) * 100}%` }} />
              </span>
              <span className={['text-[10.5px] font-counter tabular-nums', soft].join(' ')}>
                {done >= total ? `أتممت ${lessonsAr(total)}` : `${ar(done)} من ${lessonsAr(total)}`}
              </span>
              {nextName && c.status === 'active' ? (
                <span dir="auto" className="text-[11px] text-text-on-dark/85 line-clamp-1">
                  التالي: {nextName}
                </span>
              ) : null}
            </>
          ) : kind === 'series' ? (
            <span className={['text-[10.5px]', soft].join(' ')}>{done ? `شاهدت ${lessonsAr(done)}` : 'أضف دروسها لتتابعها'}</span>
          ) : kind === 'single' ? (
            <span className={['inline-flex items-center justify-center gap-1 text-[11px] font-semibold', done ? 'text-success' : soft].join(' ')}>
              {done ? <Check size={13} strokeWidth={3} aria-hidden /> : null}
              {done && lastWatch
                ? `شاهدته ${dayWord(lastWatch.date, now)}`
                : lessonProgress(c, 1).minutes
                  ? `وصلت إلى ${ar(lessonProgress(c, 1).minutes)}${list[0]?.durationMin ? ` من ${durationAr(list[0].durationMin)}` : ' دقيقة'}`
                  : list[0]?.durationMin
                    ? `لم تشاهده بعد، ${durationAr(list[0].durationMin)}`
                    : 'لم تشاهده بعد'}
            </span>
          ) : line ? (
            <span dir="auto" className={['inline-flex items-center justify-center gap-1 text-[11px] min-w-0', line.live ? 'font-semibold text-gold-light' : soft].join(' ')}>
              {line.live ? <Radio size={12} className="shrink-0 motion-safe:animate-pulse" aria-hidden /> : <Clock size={12} className="shrink-0 opacity-70" aria-hidden />}
              <span className="line-clamp-2">{line.text}</span>
            </span>
          ) : null}
        </span>
      </button>

      {arrange ? (
        <span className="absolute inset-x-2 bottom-2 flex gap-1.5 rounded-xl bg-black/45 backdrop-blur-sm p-1">
          <button
            type="button"
            disabled={arrange.first}
            onClick={() => arrange.onMove(-1)}
            aria-label={`قدّم «${c.title}»`}
            className="flex-1 min-h-10 rounded-lg inline-flex items-center justify-center gap-1 text-[12px] font-semibold text-white hover:bg-white/15 disabled:opacity-30"
          >
            <ChevronRight size={16} aria-hidden />
            قبل
          </button>
          <button
            type="button"
            disabled={arrange.last}
            onClick={() => arrange.onMove(1)}
            aria-label={`أخّر «${c.title}»`}
            className="flex-1 min-h-10 rounded-lg inline-flex items-center justify-center gap-1 text-[12px] font-semibold text-white hover:bg-white/15 disabled:opacity-30"
          >
            بعد
            <ChevronLeft size={16} aria-hidden />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onMore}
          aria-label={`إدارة ${c.title}`}
          className={['absolute top-1.5 end-1 w-11 h-11 rounded-full inline-flex items-center justify-center', light ? 'text-gold-dark dark:text-gold-light hover:bg-gold/10' : 'text-gold-light/85 hover:bg-white/10'].join(' ')}
        >
          <MoreHorizontal size={19} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── the tab ──────────────────────────────────────────────────────────────────

type Focus =
  | { kind: 'session'; c: StudyCircle; at: number; live: boolean }
  | { kind: 'lesson'; c: StudyCircle; n: number; title?: string; durationMin?: number; url?: string }
  | null;

const lastActivity = (c: StudyCircle) => c.log[0]?.date ?? c.createdAt;

/** The one thing to do now: live now › a session within 3 h › the series you were in › the next session. */
function focusOf(circles: StudyCircle[], now: number): Focus {
  const ups = circles.map((c) => ({ c, up: upNext(c, now) })).filter((x) => x.up);
  const sessions = ups
    .filter((x) => x.up!.kind === 'session')
    .map((x) => ({ c: x.c, ...(x.up as Extract<UpNext, { kind: 'session' }>) }))
    .sort((a, b) => a.at - b.at);
  const lessons = ups
    .filter((x) => x.up!.kind === 'lesson')
    .map((x) => ({ c: x.c, ...(x.up as Extract<UpNext, { kind: 'lesson' }>) }))
    .sort((a, b) => lastActivity(b.c) - lastActivity(a.c));
  const s = sessions[0];
  if (s && (s.live || s.at - now < 3 * 3_600_000)) return s;
  return lessons[0] ?? s ?? null;
}

/** «مجلسك العلمي»: the one next thing, with its action, and the month in three numbers. */
function StudyHero({ circles, now, onAdd }: { circles: StudyCircle[]; now: number; onAdd: () => void }) {
  const navigate = useNavigate();
  const focus = focusOf(circles, now);
  const fc = focus?.c;
  const numbers = useMemo(() => {
    const month = dayKey(now).slice(0, 7);
    let lessons = 0;
    let minutes = 0;
    for (const c of circles) {
      for (const l of c.log) {
        if (l.status === 'missed' || !dayKey(l.date).startsWith(month)) continue;
        lessons++;
        minutes += l.backfill ? 0 : (l.durationMin ?? (c.format === 'series' && lessonList(c).length > 1 ? 0 : (c.durationMin ?? 0)));
      }
    }
    return { streak: studyStreak(circles, now), lessons, minutes };
  }, [circles, now]);

  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
      <div className="relative">
        {focus && fc ? (
          <>
            <p className="text-xs text-on-accent/80 flex items-center gap-1.5">
              {focus.kind === 'session' && focus.live ? (
                <>
                  <Radio size={13} className="motion-safe:animate-pulse" aria-hidden /> يُبث الآن
                </>
              ) : focus.kind === 'session' ? (
                <>
                  <Clock size={13} aria-hidden /> الدرس القادم · {whenAr(focus.at, now)} · {inAr(focus.at - now)}
                </>
              ) : (
                <>
                  <Play size={13} aria-hidden /> تابع من حيث توقفت
                </>
              )}
            </p>
            <button type="button" onClick={() => navigate(`/study/circle/${fc.id}`)} className="mt-1 block text-start">
              <h2 className="text-xl font-display font-bold leading-snug text-balance">{fc.title}</h2>
            </button>
            {focus.kind === 'lesson' ? (
              <div className="mt-2">
                <p dir="auto" className="text-[13px] text-on-accent/90 text-start text-pretty">
                  الدرس {ar(focus.n)}
                  {fc.totalLessons ? ` من ${ar(fc.totalLessons)}` : ''}
                  {focus.title ? ` · ${focus.title}` : ''}
                  {focus.durationMin ? ` · ${durationAr(focus.durationMin)}` : ''}
                </p>
                {fc.totalLessons ? (
                  <div className="mt-2 h-1.5 rounded-full bg-on-accent/15 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${Math.min(100, ((focus.n - 1) / fc.totalLessons) * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-on-accent/12 ps-1.5 pe-2 py-0.5 text-xs font-semibold">
                <PlatformGlyph platform={fc.platform} size={13} />
                {platformPhrase(fc.platform) || 'موعد'}
              </p>
            )}
            <FocusActions focus={focus} />
          </>
        ) : (
          <>
            <p className="text-xs text-on-accent/80">طلب العلم عبادة</p>
            <h2 className="mt-1 text-xl font-display font-bold text-balance">{circles.length ? 'لا دروس تنتظرك الآن' : 'مجلسك العلمي'}</h2>
            <p className="mt-1 text-[13px] text-on-accent/85 text-pretty">
              {circles.length
                ? 'أضف موعداً لحلقاتك ليصلك التذكير، أو ابدأ سلسلة جديدة.'
                : 'الصق رابط درس أو سلسلة من يوتيوب أو تيليجرام، وسنرتّب لك دروسها ومواعيدها.'}
            </p>
            <Button variant="gold" size="sm" className="mt-4" leftIcon={<Plus size={15} />} onClick={onAdd}>
              أضف حلقة
            </Button>
          </>
        )}
      </div>

      <div className="relative mt-5 grid grid-cols-3 gap-2">
        {[
          { v: ar(numbers.streak), l: 'يوماً متتالياً', Icon: Flame },
          { v: ar(numbers.lessons), l: 'درساً هذا الشهر', Icon: GraduationCap },
          { v: numbers.minutes ? hoursAr(numbers.minutes) : '—', l: 'وقت التعلّم', Icon: Timer },
        ].map(({ v, l, Icon }) => (
          <div key={l} className="rounded-2xl bg-on-accent/10 px-1.5 py-2.5 text-center min-w-0">
            <Icon size={14} className="mx-auto text-gold-light" aria-hidden />
            <p className="mt-1 text-[17px] font-counter font-bold tabular-nums leading-tight truncate">{v}</p>
            <p className="text-[10px] text-on-accent/75 leading-tight">{l}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The hero's two buttons: open the lesson / link, and log it. */
function FocusActions({ focus }: { focus: NonNullable<Focus> }) {
  const c = focus.c;
  const { loggedToday, log } = useQuickLog(c);
  const url = focus.kind === 'lesson' ? focus.url : c.link;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {url ? (
        <Button variant="gold" size="sm" leftIcon={<ExternalLink size={15} />} onClick={() => void openLink(url)}>
          {focus.kind === 'lesson' ? `افتح الدرس ${ar(focus.n)}` : 'افتح الرابط'}
        </Button>
      ) : null}
      {focus.kind === 'lesson' || focus.live ? (
        <Button variant="secondary" size="sm" leftIcon={<Check size={15} />} onClick={log} disabled={focus.kind === 'session' && loggedToday}>
          {focus.kind === 'lesson' ? 'شاهدته' : loggedToday ? 'سُجّل حضورك' : 'سجّل حضوري'}
        </Button>
      ) : null}
    </div>
  );
}

/** «أضف حلقة»: a link pasted here opens the form already reading it. */
function QuickAdd({ onLink, onManual }: { onLink: (text: string) => void; onManual: () => void }) {
  const [v, setV] = useState('');
  const fromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) onLink(text);
      else toast.info('الحافظة فارغة، الصق الرابط في الحقل');
    } catch {
      toast.info('الصق الرابط في الحقل');
    }
  };
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2">
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <Link2 size={19} aria-hidden />
        </span>
        <TextInput
          value={v}
          onValueChange={setV}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text').trim();
            if (!text) return;
            e.preventDefault();
            setV('');
            onLink(text);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              onLink(e.currentTarget.value.trim());
              setV('');
            }
          }}
          dir="auto"
          inputMode="url"
          placeholder="الصق رابط درس أو سلسلة…"
          aria-label="رابط حلقة جديدة"
          className="flex-1 min-w-0 bg-cream-dark/60 dark:bg-white/[0.06] text-text-primary dark:text-text-on-dark rounded-xl px-3 min-h-11 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-text-muted"
        />
        <Button variant="soft" size="md" aria-label="لصق من الحافظة" onClick={() => void fromClipboard()} leftIcon={<ClipboardPaste size={17} />} />
      </div>
      <p className="mt-2 text-[11.5px] text-text-muted text-pretty">
        من يوتيوب نقرأ السلسلة بعناوين دروسها ومدّتها، ونتعرّف على روابط تيليجرام وزووم وغيرها.{' '}
        <button type="button" onClick={onManual} className="font-semibold text-teal dark:text-teal-light min-h-8">
          أو أضفها يدوياً
        </button>
      </p>
    </Card>
  );
}

/** The coming seven days of scheduled sessions, by day. */
function WeekAgenda({ circles, now }: { circles: StudyCircle[]; now: number }) {
  const navigate = useNavigate();
  const days = useMemo(() => {
    const end = now + 7 * DAY;
    const items: { at: number; c: StudyCircle; live: boolean }[] = [];
    for (const c of circles) {
      if (c.status !== 'active') continue;
      for (const slot of c.slots) {
        const dur = (slot.durationMin ?? 60) * 60_000;
        for (let at = nextSlotStart(slot, now - dur + 1), k = 0; at < end && k < 8; at = nextSlotStart(slot, at + 60_000), k++) {
          items.push({ at, c, live: at <= now });
        }
      }
      for (const s of c.sessions) {
        const dur = (s.durationMin ?? 60) * 60_000;
        if (s.at + dur > now && s.at < end) items.push({ at: s.at, c, live: s.at <= now });
      }
    }
    items.sort((a, b) => a.at - b.at);
    const groups: { key: string; label: string; items: typeof items }[] = [];
    for (const it of items.slice(0, 10)) {
      const key = dayKey(it.at);
      const g = groups.find((x) => x.key === key);
      if (g) g.items.push(it);
      else {
        const d = new Date(it.at);
        groups.push({ key, label: `${dayWord(it.at, now)} ${ar(d.getDate())}/${ar(d.getMonth() + 1)}`, items: [it] });
      }
    }
    return groups;
  }, [circles, now]);

  if (!days.length) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="مواعيد الأسبوع" subtitle="دروسك المجدولة في الأيام السبعة القادمة" />
      <Card className="p-1.5">
        {days.map((g, gi) => (
          <div key={g.key} className={gi ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''}>
            <p className="px-3 pt-2.5 pb-1 text-[11.5px] font-bold text-gold-dark dark:text-gold-light">{g.label}</p>
            {g.items.map((it) => (
              <button
                key={`${it.c.id}-${it.at}`}
                type="button"
                onClick={() => navigate(`/study/circle/${it.c.id}`)}
                className="w-full min-h-12 flex items-center gap-3 px-3 py-2 rounded-[var(--radius-inner)] text-start hover:bg-teal/5"
              >
                <span
                  className={[
                    'w-[68px] shrink-0 font-counter tabular-nums text-[13px] font-bold',
                    it.live ? 'text-danger' : 'text-teal dark:text-teal-light',
                  ].join(' ')}
                >
                  {it.live ? 'الآن' : clockAr(it.at)}
                </span>
                <span className="flex-1 min-w-0 text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{it.c.title}</span>
                <PlatformChip platform={it.c.platform} className="shrink-0" />
              </button>
            ))}
          </div>
        ))}
      </Card>
    </section>
  );
}

type Group = 'mine' | 'soon' | 'subject' | 'teacher';
/** «ترتيبي» = the order the user set (studyStore.reorderCircles, synced with the circles). */
const GROUP_LABEL: Record<Group, string> = { mine: 'ترتيبي', soon: 'الأقرب', subject: 'المادّة', teacher: 'الشيخ' };
/** The chosen sort, per device (a convenience, not data). */
const SORT_KEY = 'rafiqi-circles-sort';
const savedGroup = (): Group => {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v && v in GROUP_LABEL ? (v as Group) : 'soon';
  } catch {
    return 'soon';
  }
};
const STATUS_TAB: Record<CircleStatus, string> = { active: 'النشطة', paused: 'المتوقفة', done: 'المكتملة' };
const STATUSES: CircleStatus[] = ['active', 'paused', 'done'];
const STATUS_DOT: Record<CircleStatus, string> = { active: 'bg-teal dark:bg-teal-light', paused: 'bg-gold', done: 'bg-success' };

/**
 * «حلقات العلم» (its tab in «عباداتي»): the next thing to do, add by pasting a
 * link, the week's sessions, then the circles by status — grouped by what's
 * soonest, the subject or the teacher, searchable once there are many — each
 * with one-tap logging and a «⋯» that manages it in place.
 */
export function CirclesHome() {
  const circles = useStudyStore((s) => s.circles);
  const now = useNow();
  const [form, setForm] = useState<{ link?: string; editing?: StudyCircle; step?: number } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<CircleStatus, boolean>>({ active: false, paused: false, done: false });
  const [group, setGroupState] = useState<Group>(savedGroup);
  const [arranging, setArranging] = useState(false);
  const reorderCircles = useStudyStore((s) => s.reorderCircles);
  const setGroup = (g: Group) => {
    setGroupState(g);
    if (g !== 'mine') setArranging(false);
    try {
      localStorage.setItem(SORT_KEY, g);
    } catch {
      /* private mode: just not remembered */
    }
  };
  const [q, setQ] = useState('');
  useEffect(() => {
    void rescheduleAllStudy();
  }, []);

  const counts = useMemo(() => {
    const n: Record<CircleStatus, number> = { active: 0, paused: 0, done: 0 };
    for (const c of circles) n[c.status]++;
    return n;
  }, [circles]);

  // One shelf, three sections (owner 2026-11-19: no status tabs — active, paused and
  // finished together, each under its own heading with a jump chip).
  const sections = useMemo(() => {
    const needle = q.trim();
    // «الأقرب»: sessions by their time; a series in progress sits as if it were due in
    // half a day (after today's sessions), the most recently studied first.
    const soon = (c: StudyCircle) => {
      const up = upNext(c, now);
      if (up?.kind === 'session') return up.at;
      if (up?.kind === 'lesson') return now + DAY / 2 + (now - lastActivity(c)) / 1000;
      return Number.MAX_SAFE_INTEGER;
    };
    return STATUSES.map((status) => {
      const list = circles.filter((c) => c.status === status && (!needle || `${c.title} ${c.teacher ?? ''} ${SUBJECT_LABEL[c.subject]}`.includes(needle)));
      // «ترتيبي»: the store's own order (new circles first, then as the user arranged them).
      const sorted = group === 'mine' ? list : [...list].sort((a, b) => (status === 'active' ? soon(a) - soon(b) : lastActivity(b) - lastActivity(a)));
      let groups: { key: string; label: string; items: StudyCircle[] }[];
      if (group === 'soon' || group === 'mine') groups = [{ key: 'all', label: '', items: sorted }];
      else {
        const by = new Map<string, StudyCircle[]>();
        for (const c of sorted) {
          const k = group === 'subject' ? SUBJECT_LABEL[c.subject] : c.teacher?.trim() || 'بلا شيخ محدّد';
          by.set(k, [...(by.get(k) ?? []), c]);
        }
        groups = [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, items]) => ({ key: label, label, items }));
      }
      return { status, groups, count: sorted.length };
    }).filter((s) => s.count > 0);
  }, [circles, group, q, now]);

  const managed = circles.find((c) => c.id === managing);
  const add = (link?: string) => setForm({ link });
  /** «قبل / بعد» in «ترتيبي»: swap with its neighbour in the same section. */
  const move = (id: string, dir: -1 | 1, items: StudyCircle[]) => {
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const ids = circles.map((x) => x.id);
    const a = ids.indexOf(items[i].id);
    const b = ids.indexOf(items[j].id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    reorderCircles(ids);
  };
  const jump = (s: CircleStatus) => {
    setClosed((x) => ({ ...x, [s]: false }));
    setTimeout(() => document.getElementById(`circles-${s}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
  };

  return (
    <div className="flex flex-col gap-6">
      <StudyHero circles={circles} now={now} onAdd={() => add()} />

      <QuickAdd onLink={(t) => add(t)} onManual={() => add()} />

      <WeekAgenda circles={circles} now={now} />

      <section className="flex flex-col gap-3">
        <SectionTitle
          title="مكتبتي"
          subtitle={circles.length ? `${ar(circles.length)} حلقة، منها ${ar(counts.active)} نشطة` : 'دروسك المباشرة والمسجّلة في مكان واحد'}
          action={
            circles.length ? (
              <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={() => add()}>
                حلقة
              </Button>
            ) : null
          }
        />

        {circles.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              illustration={
                <Medallion size={72} tone="gold">
                  <GraduationCap size={26} className="text-gold" />
                </Medallion>
              }
              title="ابدأ أول حلقة علم"
              description="أضف درساً تتابعه على تيليجرام أو يوتيوب أو زووم، أو درساً في المسجد، وسنذكّرك قبل موعده ونحفظ تقدّمك وفوائدك."
              cta={{ label: 'أضف حلقة', onClick: () => add() }}
            />
          </Card>
        ) : (
          <>
            {circles.length > 1 ? (
              <div className="flex flex-col gap-2">
                {circles.length > 4 ? (
                  <label className="relative flex items-center">
                    <Search size={16} className="absolute start-3 text-text-muted pointer-events-none" aria-hidden />
                    <TextInput
                      value={q}
                      onValueChange={setQ}
                      placeholder="ابحث باسم الحلقة أو الشيخ أو المادّة"
                      aria-label="ابحث في الحلقات"
                      className="w-full bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] text-text-primary dark:text-text-on-dark rounded-xl ps-9 pe-3 min-h-11 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-text-muted"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="ترتيب الحلقات">
                  <span className="text-[11.5px] text-text-muted me-1">رتّب حسب</span>
                  {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={group === g}
                      onClick={() => setGroup(g)}
                      className={[
                        'min-h-9 px-3 rounded-full text-[12.5px] font-semibold transition-colors',
                        group === g ? 'bg-teal/12 text-teal dark:text-teal-light ring-1 ring-teal/30' : 'text-text-secondary dark:text-text-on-dark/75 hover:bg-teal/5',
                      ].join(' ')}
                    >
                      {GROUP_LABEL[g]}
                    </button>
                  ))}
                  {group === 'mine' && !q.trim() ? (
                    <Button size="sm" variant={arranging ? 'primary' : 'soft'} className="ms-auto" onClick={() => setArranging((v) => !v)}>
                      {arranging ? 'تم' : 'رتّب'}
                    </Button>
                  ) : null}
                </div>
                {arranging ? <p className="text-[11.5px] text-text-muted px-1">قدّم الحلقة أو أخّرها في قسمها، فتبقى مكتبتك بترتيبك.</p> : null}
              </div>
            ) : null}

            {/* Jump straight to a section. */}
            {sections.length > 1 ? (
              <nav aria-label="أقسام المكتبة" className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <button
                    key={s.status}
                    type="button"
                    onClick={() => jump(s.status)}
                    className="inline-flex items-center gap-2 min-h-10 px-3.5 rounded-xl bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] text-[12.5px] font-semibold text-text-primary dark:text-text-on-dark hover:ring-teal/30"
                  >
                    <span aria-hidden className={['w-2 h-2 rounded-full', STATUS_DOT[s.status]].join(' ')} />
                    {STATUS_TAB[s.status]}
                    <span className="font-counter tabular-nums text-text-muted">{ar(s.count)}</span>
                  </button>
                ))}
              </nav>
            ) : null}

            {!sections.length ? (
              <Card className="p-4">
                <p className="text-sm text-text-muted text-center text-pretty">لا حلقة بهذا الاسم.</p>
              </Card>
            ) : !counts.active && !q.trim() ? (
              <Card className="p-4">
                <p className="text-sm text-text-muted text-center text-pretty">لا حلقات نشطة الآن. استأنف واحدة من «المتوقفة» أو أضف حلقة جديدة.</p>
              </Card>
            ) : null}

            {sections.map((s) => (
              <div key={s.status} id={`circles-${s.status}`} className="scroll-mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setClosed((x) => ({ ...x, [s.status]: !x[s.status] }))}
                  aria-expanded={!closed[s.status]}
                  className="flex items-center gap-2 min-h-10 px-1 text-start"
                >
                  <span aria-hidden className={['w-2.5 h-2.5 rounded-full', STATUS_DOT[s.status]].join(' ')} />
                  <span className="text-[14px] font-bold text-text-primary dark:text-text-on-dark">{STATUS_TAB[s.status]}</span>
                  <span className="font-counter tabular-nums text-[12px] text-text-muted">{ar(s.count)}</span>
                  <span aria-hidden className="h-px flex-1 bg-black/[0.07] dark:bg-white/[0.08]" />
                  <ChevronDown size={17} className={['text-text-muted transition-transform duration-200', closed[s.status] ? 'rotate-90' : ''].join(' ')} aria-hidden />
                </button>
                {closed[s.status]
                  ? null
                  : s.groups.map((g) => (
                      <div key={g.key} className="flex flex-col gap-2.5">
                        {g.label ? (
                          <p className="flex items-center gap-2 text-[12px] font-bold text-teal dark:text-teal-light px-1">
                            {g.label}
                            <span className="font-counter tabular-nums text-text-muted font-semibold">{ar(g.items.length)}</span>
                            <span aria-hidden className="h-px flex-1 bg-teal/15 dark:bg-teal-light/15" />
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                          {g.items.map((c, i) => (
                            <motion.div key={c.id} className="flex" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(i, 6) * 0.035 }}>
                              <CircleCard
                                c={c}
                                now={now}
                                onMore={() => setManaging(c.id)}
                                arrange={
                                  arranging && group === 'mine' ? { first: i === 0, last: i === g.items.length - 1, onMove: (d) => move(c.id, d, g.items) } : undefined
                                }
                              />
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    ))}
              </div>
            ))}
          </>
        )}
      </section>

      <CircleFormSheet
        open={!!form}
        onClose={() => setForm(null)}
        editing={form?.editing}
        startStep={form?.step}
        initialLink={form?.link}
      />
      {managed ? (
        <CircleActionsSheet
          c={managed}
          open={!!managed}
          onClose={() => setManaging(null)}
          onEdit={(step) => setForm({ editing: managed, step })}
        />
      ) : null}
    </div>
  );
}
