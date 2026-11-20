import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Briefcase,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudSun,
  Flag,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  Moon,
  MoonStar,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif } from '@/components/ui/Ornament';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { TextInput } from '@/components/ui/TextInput';
import { hapticsService } from '@/services/HapticsService';
import { prayerTimeService } from '@/services/PrayerTimeService';
import { useTasksStore } from '@/store/tasksStore';
import { useStudyStore } from '@/store/studyStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  LIST_LABEL,
  TASK_LISTS,
  REPEAT_LABEL,
  OPEN_GROUP_LABEL,
  clockAr,
  compareTasks,
  completionLog,
  dayHeadingAr,
  dayKey,
  dueLabel,
  isDoneOn,
  isOverdue,
  openGroupOf,
  parseQuickAdd,
  shiftKey,
  stampAr,
  subtaskDone,
  PRIORITY_LABEL,
  type DoneEntry,
  type OpenGroup,
  type Task,
  type TaskList,
} from '@/store/studyModel';
import {
  SLOT_LABEL,
  SLOT_PRAYER,
  listStats,
  searchTasks,
  slotOf,
  suggestForToday,
  todayPlan,
  upcoming,
  type DayTimesLite,
  type Slot,
  type TodayPlan,
} from '@/store/tasksPlan';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { PRIORITY_TONE, useNow } from './studyUi';
import { TaskEditSheet } from './TaskEditSheet';

const ar = toArabicDigits;

/** The satisfying round check: fills, pops the tick, and sends out a soft ring. */
function CheckButton({ done, priority, onToggle, label }: { done: boolean; priority: Task['priority']; onToggle: () => void; label: string }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="relative w-11 h-11 -m-1.5 shrink-0 inline-flex items-center justify-center"
    >
      <span
        className={[
          'relative w-6 h-6 rounded-full border-2 inline-flex items-center justify-center transition-colors duration-200',
          done ? 'bg-[image:var(--gradient-teal)] bg-origin-border border-transparent text-on-accent' : tone.ring,
        ].join(' ')}
      >
        <AnimatePresence>
          {done ? (
            <motion.span
              key="tick"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 22 }}
              className="inline-flex"
            >
              <Check size={14} strokeWidth={3.2} />
            </motion.span>
          ) : null}
        </AnimatePresence>
        {done ? (
          <motion.span
            key="ring"
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-teal/60 motion-reduce:hidden"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        ) : null}
      </span>
    </button>
  );
}

/** Past this many steps a list folds (a list of max + 1 shows whole — the fold line costs a row too). */
const STEPS_SHOWN = 3;

/** «وخطوتان أخريان» / «و٣ خطوات أخرى» / «و١٢ خطوة أخرى» (n ≥ 2 here). */
const moreStepsAr = (n: number) => (n === 2 ? 'وخطوتان أخريان' : `و${ar(n)} ${n <= 10 ? 'خطوات' : 'خطوة'} أخرى`);

/**
 * An open task's steps under its row, ticked in place (per occurrence for a
 * repeating task). Indented to sit under the title of a TaskRow / Home task row
 * (both put the title 56px in). A long list folds to `max` rows from its first
 * open step; the fold line unfolds it in place.
 */
export function TaskSteps({ t, dayKey: key, max = STEPS_SHOWN, className = '' }: { t: Task; dayKey: string; max?: number; className?: string }) {
  const toggleSubtask = useTasksStore((s) => s.toggleSubtask);
  const [unfolded, setUnfolded] = useState(false);
  // Folded, the list starts at the first open step — fixed per mount, so a tick never slides rows under the finger.
  const [firstOpen] = useState(() => t.subtasks.findIndex((s) => !subtaskDone(t, s, key)));
  const foldable = t.subtasks.length > max + 1;
  const from = Math.max(0, Math.min(firstOpen, t.subtasks.length - max));
  const shown = foldable && !unfolded ? t.subtasks.slice(from, from + max) : t.subtasks;

  const toggle = (subId: string) => {
    const done = toggleSubtask(t.id, subId, key);
    const last = done && t.subtasks.every((s) => s.id === subId || subtaskDone(t, s, key));
    void (last ? hapticsService.notify('success') : hapticsService.impact(done ? 'medium' : 'light'));
  };

  return (
    <ul className={['flex flex-col ps-12.5 pe-2', className].join(' ')} aria-label={`خطوات: ${t.title}`}>
      {shown.map((s) => {
        const done = subtaskDone(t, s, key);
        return (
          <li key={s.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              onClick={() => toggle(s.id)}
              className="w-full min-h-10 flex items-start gap-2.5 ps-1.5 pe-2 py-2 rounded-xl text-start hover:bg-teal/5 active:bg-teal/10"
            >
              <span
                aria-hidden
                className={[
                  'mt-px w-4.5 h-4.5 shrink-0 rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors duration-200 ease-out-soft',
                  done ? 'bg-teal border-teal text-on-accent' : 'border-teal/50 dark:border-teal-light/55',
                ].join(' ')}
              >
                <Check
                  size={11}
                  strokeWidth={3.4}
                  className={['transition-transform duration-200 ease-out-soft motion-reduce:transition-none', done ? 'scale-100' : 'scale-0'].join(
                    ' '
                  )}
                />
              </span>
              <span
                className={[
                  'min-w-0 flex-1 text-[13.5px] leading-5 text-pretty transition-colors duration-200',
                  done ? 'text-text-muted line-through decoration-text-muted/60' : 'text-text-secondary',
                ].join(' ')}
              >
                {s.title}
              </span>
            </button>
          </li>
        );
      })}
      {foldable ? (
        <li>
          <button
            type="button"
            aria-expanded={unfolded}
            onClick={() => setUnfolded(!unfolded)}
            className="min-h-9 inline-flex items-center gap-1 ps-1.5 pe-2 rounded-xl text-xs font-semibold text-teal dark:text-teal-light hover:bg-teal/5"
          >
            {unfolded ? 'عرض أقل' : moreStepsAr(t.subtasks.length - max)}
            <ChevronDown size={14} aria-hidden className={['transition-transform duration-200', unfolded ? 'rotate-180' : ''].join(' ')} />
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** Each list's mark — the same icon on its card and on every row tagged with it. */
export const LIST_ICON: Record<TaskList, LucideIcon> = {
  today: Inbox,
  worship: Sparkles,
  study: GraduationCap,
  home: Home,
  work: Briefcase,
  personal: UserRound,
};
/** Each list's colour: a dot on the rows, the chip on its card. */
const LIST_TONE: Record<TaskList, { dot: string; chip: string }> = {
  today: { dot: 'bg-text-muted/70', chip: 'bg-cream-dark/70 text-text-secondary dark:bg-white/[0.07] dark:text-text-on-dark/80' },
  worship: { dot: 'bg-gold', chip: 'bg-gold/15 text-gold-dark dark:text-gold-light' },
  study: { dot: 'bg-teal', chip: 'bg-teal/12 text-teal dark:text-teal-light' },
  home: { dot: 'bg-success', chip: 'bg-success/12 text-success' },
  work: { dot: 'bg-info', chip: 'bg-info/12 text-info' },
  personal: { dot: 'bg-warning', chip: 'bg-warning/15 text-warning' },
};

/** «18:00» → «٦:٠٠ م». */
function timeAr(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${ar(((h + 11) % 12) + 1)}:${ar(String(m).padStart(2, '0'))} ${h < 12 ? 'ص' : 'م'}`;
}
const dateTimeAr = (d: Date) => timeAr(`${d.getHours()}:${d.getMinutes()}`);

/**
 * One task: the check, the title (its time at the end), and one quiet line —
 * the day (when the section doesn't already say it), repeat, steps, the
 * circle, the list — then its open steps. `showDue` / `showList` drop what the
 * surrounding view already tells.
 */
export function TaskRow({
  t,
  now,
  first,
  onOpen,
  showDue = true,
  showList = true,
}: {
  t: Task;
  now: number;
  first?: boolean;
  onOpen: () => void;
  showDue?: boolean;
  showList?: boolean;
}) {
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const circles = useStudyStore((s) => s.circles);
  const key = dayKey(now);
  const done = isDoneOn(t, key);
  const overdue = isOverdue(t, now) && !done;
  const day = dueLabel({ ...t, time: undefined }, now);
  const subDone = t.subtasks.filter((s) => subtaskDone(t, s, key)).length;
  const circle = t.circleId ? circles.find((c) => c.id === t.circleId) : undefined;
  const doneAt = done ? (t.repeat === 'none' ? t.doneAt : t.history?.[key]) : undefined;

  const toggle = () => {
    const nowDone = toggleTask(t.id, key);
    if (nowDone) {
      void hapticsService.notify('success');
      if (t.repeat !== 'none') toast.success('أحسنت، تعود في موعدها القادم');
    } else void hapticsService.impact('light');
  };

  const meta: ReactNode[] = [];
  if (doneAt)
    meta.push(
      <span key="done" className="inline-flex items-center gap-1 text-teal dark:text-teal-light">
        <CheckCircle2 size={12} aria-hidden /> أُنجزت {clockAr(doneAt)}
      </span>
    );
  else if (day && (showDue || overdue) && !(day === 'اليوم' && !showDue))
    meta.push(
      <span
        key="due"
        className={[
          'inline-flex items-center gap-1',
          overdue ? 'text-danger font-semibold' : day === 'اليوم' ? 'text-teal dark:text-teal-light' : '',
        ].join(' ')}
      >
        <CalendarDays size={12} aria-hidden />
        {overdue && day !== 'اليوم' ? `متأخرة · ${day}` : day}
      </span>
    );
  if (t.repeat !== 'none')
    meta.push(
      <span key="rep" className="inline-flex items-center gap-1">
        <Repeat size={12} aria-hidden />
        {REPEAT_LABEL[t.repeat]}
      </span>
    );
  if (t.subtasks.length)
    meta.push(
      <span
        key="steps"
        className={['inline-flex items-center gap-1', subDone === t.subtasks.length ? 'text-teal dark:text-teal-light' : ''].join(' ')}
      >
        <ListChecks size={12} aria-hidden />
        {ar(subDone)}/{ar(t.subtasks.length)}
      </span>
    );
  if (t.notes) meta.push(<StickyNote key="notes" size={12} aria-label="فيها ملاحظات" />);
  if (circle)
    meta.push(
      <span key="circle" className="inline-flex items-center gap-1 text-gold-dark dark:text-gold-light min-w-0">
        <GraduationCap size={12} aria-hidden />
        <span className="truncate max-w-[34vw]">{circle.title}</span>
      </span>
    );
  if (showList)
    meta.push(
      <span key="list" className="inline-flex items-center gap-1.5">
        <span aria-hidden className={['w-2 h-2 rounded-full', LIST_TONE[t.list].dot].join(' ')} />
        {LIST_LABEL[t.list]}
      </span>
    );

  return (
    <div className={['relative', first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]'].join(' ')}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
        className="flex items-start gap-3 px-3 py-3 rounded-[var(--radius-inner)] hover:bg-teal/5 cursor-pointer"
      >
        <CheckButton done={done} priority={t.priority} onToggle={toggle} label={`إنجاز: ${t.title}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={[
                'min-w-0 flex-1 text-[15px] leading-snug transition-colors duration-300 text-pretty',
                done ? 'text-text-muted line-through decoration-text-muted/60' : 'text-text-primary dark:text-text-on-dark font-semibold',
              ].join(' ')}
            >
              {t.priority === 'high' && !done ? <Flag size={13} className="inline -mt-0.5 me-1 text-danger" aria-label="مهمّة" /> : null}
              {t.title}
            </p>
            {t.time && !done ? (
              <span
                className={[
                  'shrink-0 mt-0.5 inline-flex items-center gap-1 font-counter tabular-nums text-[12px] font-bold',
                  overdue ? 'text-danger' : 'text-teal dark:text-teal-light',
                ].join(' ')}
              >
                {t.reminderOffset !== undefined ? <Bell size={11} aria-label="بتذكير" /> : null}
                {timeAr(t.time)}
              </span>
            ) : null}
          </div>
          {meta.length ? <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-text-muted">{meta}</div> : null}
        </div>
      </div>
      {!done && t.subtasks.length ? <TaskSteps t={t} dayKey={key} className="-mt-2 pb-2" /> : null}
    </div>
  );
}

// ── the composer ───────────────────────────────────────────────────────────
type DueChoice = 'none' | 'today' | 'tomorrow';

/**
 * One line to add a task (natural dates still parse: «غداً الساعة ٩ مهم»).
 * Focused, it offers the day, «مهمّة», the list and the full sheet. In «اليوم»
 * a new task is for today unless told otherwise — so it shows where it was added.
 */
function Composer({ list, defaultDue, onDetails }: { list?: TaskList; defaultDue: DueChoice; onDetails: () => void }) {
  const addTask = useTasksStore((s) => s.addTask);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dueChoice, setDueChoice] = useState<DueChoice>(defaultDue);
  const [important, setImportant] = useState(false);
  const [target, setTarget] = useState<TaskList>(list ?? 'today');
  useEffect(() => setDueChoice(defaultDue), [defaultDue]);
  useEffect(() => setTarget(list ?? 'today'), [list]);
  const now = Date.now();
  const parsed = text.trim() ? parseQuickAdd(text, now) : null;
  const open = focused || !!text;
  const TargetIcon = LIST_ICON[target];

  const submit = () => {
    const p = parseQuickAdd(text, Date.now());
    if (!p.title) return;
    const today = dayKey(Date.now());
    addTask({
      title: p.title,
      // Typed dates win; otherwise the picked chip; otherwise undated (never «متأخرة»).
      due: p.due ?? (dueChoice === 'today' ? today : dueChoice === 'tomorrow' ? shiftKey(today, 1) : undefined),
      time: p.time,
      reminderOffset: p.time ? 0 : undefined,
      repeat: p.repeat ?? 'none',
      priority: important ? 'high' : p.priority ?? 'normal',
      list: target,
    });
    void hapticsService.impact('light');
    toast.success('أُضيفت المهمة');
    setText('');
    setDueChoice(defaultDue);
    setImportant(false);
  };

  const parsedChips = parsed
    ? [
        parsed.due ? dueLabel({ due: parsed.due, time: parsed.time, repeat: 'none' } as Task, now) : null,
        parsed.repeat ? REPEAT_LABEL[parsed.repeat] : null,
        parsed.priority === 'high' ? PRIORITY_LABEL.high : null,
        parsed.time ? 'بتذكير' : null,
      ].filter(Boolean)
    : [];

  const chip = (on: boolean) =>
    [
      'min-h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap',
      on ? 'bg-teal text-on-accent' : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/75 hover:bg-teal/10',
    ].join(' ');

  return (
    <Card className={['p-2 transition-shadow duration-200', open ? 'ring-2 ring-teal/30' : ''].join(' ')}>
      {/*
       * Open while focus is anywhere inside the composer — not only the text field:
       * tapping the list menu moves focus to it, and closing on the field's blur
       * unmounted the menu before it could open (owner 2026-11-19).
       */}
      <div
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span
            className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0"
            aria-hidden
          >
            <Plus size={20} />
          </span>
          <TextInput
            ref={inputRef}
            value={text}
            onValueChange={setText}
            placeholder={defaultDue === 'today' ? 'مهمة لليوم…' : 'ماذا تريد أن تنجز؟'}
            className="flex-1 min-w-0 bg-transparent text-text-primary dark:text-text-on-dark text-[16px] font-semibold outline-none placeholder:text-text-muted placeholder:font-normal py-2"
            aria-label="مهمة جديدة"
            enterKeyHint="done"
          />
          {parsed?.title ? (
            <Button type="submit" variant="primary" size="sm">
              إضافة
            </Button>
          ) : null}
        </form>

        {parsedChips.length ? (
          <div className="mt-1.5 ps-12 flex flex-wrap items-center gap-1.5">
            <Sparkles size={13} className="text-gold" aria-hidden />
            {parsedChips.map((c) => (
              <span
                key={c}
                className="h-6 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center bg-teal/10 text-teal dark:text-teal-light"
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}

        {/* The options: pressing them keeps the input focused (mouse-down is prevented — but not on the list menu). */}
        {open ? (
          <div
            className="mt-2 pt-2 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center gap-1.5"
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'SELECT') e.preventDefault();
            }}
          >
            <button
              type="button"
              aria-pressed={dueChoice === 'today'}
              className={chip(dueChoice === 'today')}
              onClick={() => setDueChoice(dueChoice === 'today' ? 'none' : 'today')}
            >
              <Sun size={14} /> اليوم
            </button>
            <button
              type="button"
              aria-pressed={dueChoice === 'tomorrow'}
              className={chip(dueChoice === 'tomorrow')}
              onClick={() => setDueChoice(dueChoice === 'tomorrow' ? 'none' : 'tomorrow')}
            >
              <Sunrise size={14} /> غداً
            </button>
            <button
              type="button"
              aria-pressed={important}
              className={
                important
                  ? 'min-h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap bg-danger/12 text-danger ring-1 ring-danger/30'
                  : chip(false)
              }
              onClick={() => setImportant(!important)}
            >
              <Flag size={14} /> مهمّة
            </button>
            <label className={[chip(false), 'relative pe-2'].join(' ')}>
              <TargetIcon size={14} aria-hidden />
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value as TaskList);
                  // Back to the text, so the row stays and typing goes on.
                  inputRef.current?.focus();
                }}
                className="appearance-none bg-transparent outline-none font-bold pe-4 cursor-pointer"
                aria-label="القائمة"
              >
                {TASK_LISTS.map((l) => (
                  <option key={l} value={l}>
                    {LIST_LABEL[l]}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute end-2 pointer-events-none" aria-hidden />
            </label>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onDetails}
              className="min-h-9 px-2 rounded-xl text-xs font-bold text-teal dark:text-teal-light inline-flex items-center gap-1 hover:bg-teal/5"
            >
              <SlidersHorizontal size={14} /> تفاصيل
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

// ── the day, at a glance ───────────────────────────────────────────────────
function DayHeader({ plan, now, week }: { plan: TodayPlan; now: number; week: number }) {
  const { done, total } = plan.progress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const next = plan.timed.flatMap((g) => g.tasks).find((t) => t.time && !isOverdue(t, now));
  const date = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return (
    <Card variant="hero" className="p-4">
      <ArchMotif className="absolute -top-6 -end-8 w-32 opacity-15" />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <ProgressRing
            value={pct}
            size={70}
            strokeWidth={6}
            showPercent={false}
            animate={false}
            colorFrom="var(--color-gold-light)"
            colorTo="var(--color-gold)"
            trackColor="color-mix(in srgb, var(--color-on-accent) 16%, transparent)"
          />
          <span className="absolute inset-0 flex items-center justify-center font-counter tabular-nums text-[17px] font-bold leading-none">
            {ar(done)}
            <span className="text-[12px] text-on-accent/70">/{ar(total)}</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-on-accent/75">{date}</p>
          <p className="mt-0.5 text-[19px] font-display font-bold text-balance leading-snug">
            {total === 0 ? 'يومك صفحة بيضاء' : done >= total ? 'أنجزت مهام اليوم، بارك الله فيك' : `باقٍ ${ar(total - done)} من ${ar(total)}`}
          </p>
          {next ? (
            <p className="mt-1 text-[12px] text-on-accent/85 truncate">
              التالي: <b className="font-semibold">{next.title}</b> · <span className="font-counter tabular-nums">{timeAr(next.time!)}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="relative mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
        {plan.overdue.length ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-on-accent/12 ring-1 ring-gold-light/50 px-2.5 py-1 font-semibold text-gold-light">
            <AlertCircle size={12} aria-hidden /> {ar(plan.overdue.length)} متأخرة
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-full bg-on-accent/10 px-2.5 py-1 text-on-accent/85">
          <CheckCircle2 size={12} aria-hidden /> {ar(week)} أُنجزت هذا الأسبوع
        </span>
      </div>
    </Card>
  );
}

// ── shared bits ────────────────────────────────────────────────────────────
function Heading({
  Icon,
  label,
  count,
  tone = 'muted',
  aside,
  action,
}: {
  Icon: LucideIcon;
  label: string;
  count?: number;
  tone?: 'muted' | 'danger' | 'accent' | 'gold';
  aside?: ReactNode;
  action?: ReactNode;
}) {
  const color = {
    danger: 'bg-danger/10 text-danger',
    accent: 'bg-teal/10 text-teal dark:text-teal-light',
    gold: 'bg-gold/15 text-gold-dark dark:text-gold-light',
    muted: 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/75',
  }[tone];
  return (
    <div className="flex items-center gap-2 px-1 min-h-8">
      <span className={['w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0', color].join(' ')} aria-hidden>
        <Icon size={15} />
      </span>
      <h3 className="text-[14px] font-display font-bold text-text-primary dark:text-text-on-dark">{label}</h3>
      {count != null ? (
        <span className="min-w-6 h-6 px-1.5 rounded-full bg-cream-dark/60 dark:bg-white/[0.06] font-counter tabular-nums text-[11px] font-bold text-text-muted inline-flex items-center justify-center">
          {ar(count)}
        </span>
      ) : null}
      {aside ? <span className="text-[11.5px] text-text-muted">{aside}</span> : null}
      <span className="flex-1" />
      {action}
    </div>
  );
}

function Rows({
  tasks,
  now,
  onOpen,
  showDue = true,
  showList = true,
}: {
  tasks: Task[];
  now: number;
  onOpen: (t: Task) => void;
  showDue?: boolean;
  showList?: boolean;
}) {
  return (
    <>
      {tasks.map((t, i) => (
        <TaskRow key={t.id} t={t} now={now} first={i === 0} onOpen={() => onOpen(t)} showDue={showDue} showList={showList} />
      ))}
    </>
  );
}

/** «أُنجزت اليوم (٣)», folded. */
function DoneFold({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (t: Task) => void }) {
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="self-start min-h-9 inline-flex items-center gap-1.5 px-2 rounded-xl text-[13px] font-bold text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/5"
      >
        <CheckCircle2 size={15} className="text-teal dark:text-teal-light" aria-hidden />
        أُنجزت ({ar(tasks.length)})
        <ChevronDown size={14} aria-hidden className={['transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')} />
      </button>
      {open ? (
        <Card className="p-1.5">
          <Rows tasks={tasks} now={now} onOpen={onOpen} showDue={false} />
        </Card>
      ) : null}
    </div>
  );
}

const SLOT_ICON: Record<Slot, LucideIcon> = { night: MoonStar, fajr: Sunrise, duha: Sun, dhuhr: Sun, asr: CloudSun, maghrib: Sunset, isha: Moon };

// ── «اليوم» ────────────────────────────────────────────────────────────────
function TodayView({
  plan,
  times,
  suggestions,
  now,
  onOpen,
}: {
  plan: TodayPlan;
  times: DayTimesLite | null;
  suggestions: Task[];
  now: number;
  onOpen: (t: Task) => void;
}) {
  const updateTask = useTasksStore((s) => s.updateTask);
  const today = dayKey(now);
  const open = plan.overdue.length + plan.timed.reduce((n, g) => n + g.tasks.length, 0) + plan.anytime.length;
  // The slot the clock is in now — its heading gets «الآن».
  const d = new Date(now);
  const nowSlot = times ? slotOf(`${d.getHours()}:${d.getMinutes()}`, times) : null;

  const toToday = (ids: string[]) => {
    for (const id of ids) updateTask(id, { due: today });
    void hapticsService.impact('light');
    toast.success(ids.length === 1 ? 'أُضيفت إلى يومك' : `نُقلت ${ar(ids.length)} إلى اليوم`);
  };

  if (!open && !plan.done.length && !suggestions.length) {
    return (
      <Card className="p-2">
        <EmptyState
          title="يومك صفحة بيضاء"
          description="أضف مهمة لليوم من الأعلى، ولك أن تكتب موعدها: «الساعة ٩ مساءً»، فتُرتَّب حول أوقات الصلاة."
        />
      </Card>
    );
  }

  return (
    <>
      {plan.overdue.length ? (
        <section className="flex flex-col gap-2">
          <Heading
            Icon={AlertCircle}
            label="متأخرة"
            count={plan.overdue.length}
            tone="danger"
            action={
              <button
                type="button"
                onClick={() => toToday(plan.overdue.map((t) => t.id))}
                className="min-h-8 px-2.5 rounded-xl text-[12px] font-bold text-teal dark:text-teal-light inline-flex items-center gap-1 hover:bg-teal/5"
              >
                <ArrowRight size={13} className="rotate-180" aria-hidden /> انقلها إلى اليوم
              </button>
            }
          />
          <Card className="p-1.5 ring-1 ring-danger/25">
            <Rows tasks={plan.overdue} now={now} onOpen={onOpen} />
          </Card>
        </section>
      ) : null}

      {plan.timed.length ? (
        <section className="flex flex-col gap-2">
          <Heading Icon={CalendarClock} label={times ? 'يومك حول الصلوات' : 'بموعد'} tone="accent" />
          <Card className="p-1.5">
            {plan.timed.map((g, gi) => {
              const SlotIcon = g.slot ? SLOT_ICON[g.slot] : CalendarClock;
              const prayer = g.slot && times ? SLOT_PRAYER[g.slot] : null;
              return (
                <div key={`${g.slot}-${gi}`} className={gi ? 'mt-1 border-t border-black/[0.05] dark:border-white/[0.06]' : ''}>
                  {g.slot ? (
                    <p className="flex items-center gap-1.5 px-3 pt-2.5 pb-0.5 text-[12px] font-bold text-gold-dark dark:text-gold-light">
                      <SlotIcon size={14} aria-hidden />
                      {SLOT_LABEL[g.slot]}
                      {prayer && times ? (
                        <span className="font-counter tabular-nums font-semibold text-text-muted">{dateTimeAr(times[prayer])}</span>
                      ) : null}
                      {g.slot === nowSlot ? (
                        <span className="ms-1 rounded-full bg-teal/12 px-2 py-0.5 text-[10.5px] text-teal dark:text-teal-light">الآن</span>
                      ) : null}
                    </p>
                  ) : null}
                  <Rows tasks={g.tasks} now={now} onOpen={onOpen} showDue={false} />
                </div>
              );
            })}
          </Card>
        </section>
      ) : null}

      {plan.anytime.length ? (
        <section className="flex flex-col gap-2">
          <Heading Icon={Sun} label="في أي وقت اليوم" count={plan.anytime.length} tone="muted" />
          <Card className="p-1.5">
            <Rows tasks={plan.anytime} now={now} onOpen={onOpen} showDue={false} />
          </Card>
        </section>
      ) : null}

      {suggestions.length ? (
        <section className="flex flex-col gap-2">
          <Heading Icon={Sparkles} label="خطّط يومك" tone="gold" aside="مهام تنتظر يوماً" />
          <Card variant="gradient-edge" className="p-1.5">
            {suggestions.map((t, i) => (
              <div
                key={t.id}
                className={['flex items-center gap-3 px-3 py-2.5', i ? 'border-t border-black/[0.05] dark:border-white/[0.06]' : ''].join(' ')}
              >
                <span className={['w-2 h-2 rounded-full shrink-0', LIST_TONE[t.list].dot].join(' ')} aria-hidden />
                <button type="button" onClick={() => onOpen(t)} className="flex-1 min-w-0 text-start">
                  <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark truncate">
                    {t.priority === 'high' ? <Flag size={12} className="inline -mt-0.5 me-1 text-danger" aria-label="مهمّة" /> : null}
                    {t.title}
                  </span>
                  <span className="block text-[11px] text-text-muted">
                    {t.due ? dueLabel(t, now) : 'بلا موعد'} · {LIST_LABEL[t.list]}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toToday([t.id])}
                  className="shrink-0 min-h-9 px-3 rounded-xl bg-teal/10 text-teal dark:text-teal-light text-[12px] font-bold inline-flex items-center gap-1 hover:bg-teal/15"
                  aria-label={`إلى اليوم: ${t.title}`}
                >
                  <Plus size={14} aria-hidden /> اليوم
                </button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <DoneFold tasks={plan.done} now={now} onOpen={onOpen} />
    </>
  );
}

// ── «القادم» ───────────────────────────────────────────────────────────────
function UpcomingView({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (t: Task) => void }) {
  const u = useMemo(() => upcoming(tasks, now), [tasks, now]);
  const tomorrow = shiftKey(dayKey(now), 1);
  if (!u.count) {
    return (
      <Card className="p-2">
        <EmptyState title="لا شيء في الأيام القادمة" description="المهام التي لها موعد بعد اليوم، والتي بلا موعد، تظهر هنا مرتّبة بأيامها." />
      </Card>
    );
  }
  return (
    <>
      {u.days.map((d) => (
        <section key={d.key} className="flex flex-col gap-2">
          <Heading
            Icon={d.key === tomorrow ? Sunrise : CalendarDays}
            label={d.key === tomorrow ? 'غداً' : dayHeadingAr(d.key, now)}
            count={d.tasks.length}
            tone={d.key === tomorrow ? 'accent' : 'muted'}
          />
          <Card className="p-1.5">
            <Rows tasks={d.tasks} now={now} onOpen={onOpen} showDue={false} />
          </Card>
        </section>
      ))}
      {u.later.length ? (
        <section className="flex flex-col gap-2">
          <Heading Icon={CalendarDays} label="لاحقاً" count={u.later.length} />
          <Card className="p-1.5">
            <Rows tasks={u.later} now={now} onOpen={onOpen} />
          </Card>
        </section>
      ) : null}
      {u.undated.length ? (
        <section className="flex flex-col gap-2">
          <Heading Icon={Inbox} label="بلا موعد" count={u.undated.length} />
          <Card className="p-1.5">
            <Rows tasks={u.undated} now={now} onOpen={onOpen} showDue={false} />
          </Card>
        </section>
      ) : null}
    </>
  );
}

// ── «القوائم» ──────────────────────────────────────────────────────────────
const OPEN_ORDER: OpenGroup[] = ['overdue', 'today', 'tomorrow', 'later', 'undated'];
const GROUP_ICON: Record<OpenGroup, LucideIcon> = { overdue: AlertCircle, today: Sun, tomorrow: Sunrise, later: CalendarDays, undated: Inbox };

function ListsView({
  tasks,
  now,
  list,
  onList,
  onOpen,
}: {
  tasks: Task[];
  now: number;
  list: TaskList | null;
  onList: (l: TaskList | null) => void;
  onOpen: (t: Task) => void;
}) {
  const key = dayKey(now);
  const stats = useMemo(() => listStats(tasks, now), [tasks, now]);
  const scoped = useMemo(() => (list ? tasks.filter((t) => t.list === list) : []), [tasks, list]);
  const groups = useMemo(() => {
    const out: Record<OpenGroup, Task[]> = { overdue: [], today: [], tomorrow: [], later: [], undated: [] };
    for (const t of scoped) if (!isDoneOn(t, key)) out[openGroupOf(t, now)].push(t);
    for (const g of OPEN_ORDER) out[g].sort((a, b) => compareTasks(a, b, key));
    return out;
  }, [scoped, now, key]);

  if (!list) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => {
          const Icon = LIST_ICON[s.list];
          return (
            <button
              key={s.list}
              type="button"
              onClick={() => onList(s.list)}
              className="text-start rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[var(--shadow-xs)] p-3.5 flex flex-col gap-3 hover:bg-teal/5 transition-colors"
            >
              <span className="flex items-center justify-between gap-2">
                <span className={['w-10 h-10 rounded-xl inline-flex items-center justify-center', LIST_TONE[s.list].chip].join(' ')} aria-hidden>
                  <Icon size={19} />
                </span>
                {s.overdue ? (
                  <span className="rounded-full bg-danger/10 text-danger px-2 py-0.5 text-[10.5px] font-bold">{ar(s.overdue)} متأخرة</span>
                ) : null}
              </span>
              <span className="flex flex-col">
                <span className="text-[14.5px] font-bold text-text-primary dark:text-text-on-dark">{LIST_LABEL[s.list]}</span>
                <span className="text-[11.5px] text-text-muted">
                  {s.open ? `${ar(s.open)} مفتوحة` : 'لا شيء مفتوح'}
                  {s.doneToday ? ` · ${ar(s.doneToday)} اليوم` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const Icon = LIST_ICON[list];
  const openCount = OPEN_ORDER.reduce((n, g) => n + groups[g].length, 0);
  const doneHere = scoped.filter((t) => t.repeat === 'none' && t.done);
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onList(null)}
          className="min-h-10 px-3 rounded-xl bg-cream-dark/60 dark:bg-white/[0.06] text-[12.5px] font-bold text-text-secondary dark:text-text-on-dark/80 inline-flex items-center gap-1 hover:bg-teal/10"
        >
          <ArrowRight size={15} aria-hidden /> كل القوائم
        </button>
        <span className={['inline-flex items-center gap-1.5 rounded-xl px-3 min-h-10 text-[13px] font-bold', LIST_TONE[list].chip].join(' ')}>
          <Icon size={15} aria-hidden /> {LIST_LABEL[list]}
        </span>
      </div>
      {openCount === 0 && !doneHere.length ? (
        <Card className="p-2">
          <EmptyState title="القائمة فارغة" description="اكتب مهمة في الأعلى فتُضاف إلى هذه القائمة." />
        </Card>
      ) : (
        OPEN_ORDER.filter((g) => groups[g].length).map((g) => (
          <section key={g} className="flex flex-col gap-2">
            <Heading
              Icon={GROUP_ICON[g]}
              label={OPEN_GROUP_LABEL[g]}
              count={groups[g].length}
              tone={g === 'overdue' ? 'danger' : g === 'today' ? 'accent' : 'muted'}
            />
            <Card className={['p-1.5', g === 'overdue' ? 'ring-1 ring-danger/25' : ''].join(' ')}>
              <Rows tasks={groups[g]} now={now} onOpen={onOpen} showList={false} showDue={g === 'later' || g === 'overdue'} />
            </Card>
          </section>
        ))
      )}
      <DoneFold tasks={doneHere} now={now} onOpen={onOpen} />
    </>
  );
}

// ── «المنجزة» ──────────────────────────────────────────────────────────────
/** Completion days shown before «عرض الأقدم». */
const DONE_DAYS_SHOWN = 4;

/** One completion in the log: when it was done and when the task was registered. Tap the tick to undo. */
function DoneRow({ e, now, first, onOpen }: { e: DoneEntry; now: number; first: boolean; onOpen: () => void }) {
  const setTaskDone = useTasksStore((s) => s.setTaskDone);
  const { t } = e;
  const undo = () => {
    setTaskDone(t.id, false, e.occ ?? dayKey(now));
    void hapticsService.impact('light');
    toast.info('أُعيدت إلى المفتوحة');
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') onOpen();
      }}
      className={[
        'flex items-start gap-3 px-3 py-3 rounded-[var(--radius-inner)] hover:bg-teal/5 cursor-pointer',
        first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]',
      ].join(' ')}
    >
      <CheckButton done priority={t.priority} onToggle={undo} label={`إلغاء إنجاز: ${t.title}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] leading-snug text-text-secondary dark:text-text-on-dark/80 text-pretty">{t.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-text-muted">
          <span className="inline-flex items-center gap-1 text-teal dark:text-teal-light">
            <CheckCircle2 size={12} aria-hidden /> {clockAr(e.at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarPlus size={12} aria-hidden /> سُجّلت {stampAr(t.createdAt, now)}
          </span>
          {t.repeat !== 'none' ? (
            <span className="inline-flex items-center gap-1">
              <Repeat size={12} aria-hidden />
              {REPEAT_LABEL[t.repeat]}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className={['w-2 h-2 rounded-full', LIST_TONE[t.list].dot].join(' ')} />
            {LIST_LABEL[t.list]}
          </span>
        </div>
      </div>
    </div>
  );
}

function DoneView({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (t: Task) => void }) {
  const clearCompleted = useTasksStore((s) => s.clearCompleted);
  const [allDays, setAllDays] = useState(false);
  const log = useMemo(() => completionLog(tasks), [tasks]);
  const key = dayKey(now);
  const shown = allDays ? log : log.slice(0, DONE_DAYS_SHOWN);
  if (!log.length) {
    return (
      <Card className="p-2">
        <EmptyState title="لم تُنجز مهمة بعد" description="كل مهمة تنجزها تُسجَّل هنا تحت يوم إنجازها ووقته." />
      </Card>
    );
  }
  return (
    <>
      {shown.map((g) => (
        <section key={g.key} className="flex flex-col gap-2">
          <Heading Icon={CalendarDays} label={dayHeadingAr(g.key, now)} count={g.items.length} tone={g.key === key ? 'accent' : 'muted'} />
          <Card className="p-1.5">
            {g.items.map((e, i) => (
              <DoneRow key={`${e.t.id}-${e.at}`} e={e} now={now} first={i === 0} onOpen={() => onOpen(e.t)} />
            ))}
          </Card>
        </section>
      ))}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {log.length > DONE_DAYS_SHOWN ? (
          <Button variant="ghost" size="sm" onClick={() => setAllDays(!allDays)}>
            {allDays ? 'عرض أقل' : `عرض الأقدم · ${ar(log.length - DONE_DAYS_SHOWN)} أيام`}
          </Button>
        ) : null}
        {tasks.some((t) => t.repeat === 'none' && t.done) ? (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 size={15} />}
            onClick={() => {
              clearCompleted();
              toast.success('نُظّفت المهام المكتملة');
            }}
          >
            حذف المكتملة
          </Button>
        ) : null}
      </div>
    </>
  );
}

// ── the page ───────────────────────────────────────────────────────────────
type View = 'today' | 'upcoming' | 'lists' | 'done';
const VIEW_LABEL: Record<View, string> = { today: 'اليوم', upcoming: 'القادم', lists: 'القوائم', done: 'المنجزة' };

/** Today's prayer times for the slots (null without a location). */
function useDayTimes(key: string): DayTimesLite | null {
  const coords = useSettingsStore((s) => s.coords);
  const method = useSettingsStore((s) => s.prayerMethod);
  const madhab = useSettingsStore((s) => s.madhabSchool);
  return useMemo(() => {
    if (!coords) return null;
    try {
      const [y, m, d] = key.split('-').map(Number);
      return prayerTimeService.getTimes(coords, new Date(y, m - 1, d, 12), method, madhab);
    } catch {
      return null;
    }
  }, [coords, method, madhab, key]);
}

/**
 * «المهام» — four views over one store: «اليوم» (late, today around the
 * prayers, anytime, «خطّط يومك»), «القادم» (by day), «القوائم» (cards → a list),
 * «المنجزة» (the log). One composer on top adds into what is being viewed;
 * search spans everything.
 */
export function TasksView({ focusTaskId }: { focusTaskId?: string | null }) {
  const tasks = useTasksStore((s) => s.tasks);
  const now = useNow();
  const [view, setView] = useState<View>('today');
  const [list, setList] = useState<TaskList | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Deep link (notification / widget): open that task's sheet once.
  useEffect(() => {
    if (!focusTaskId) return;
    // Widget «+» sends task=new → open the add-task sheet.
    if (focusTaskId === 'new') return setCreating(true);
    const t = useTasksStore.getState().tasks.find((x) => x.id === focusTaskId);
    if (t) setEditing(t);
  }, [focusTaskId]);
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const key = dayKey(now);
  const times = useDayTimes(key);
  const plan = useMemo(() => todayPlan(tasks, now, times), [tasks, now, times]);
  const todayOpen = plan.overdue.length + plan.timed.reduce((n, g) => n + g.tasks.length, 0) + plan.anytime.length;
  // «خطّط يومك» only while the day is light.
  const suggestions = useMemo(() => (todayOpen < 3 ? suggestForToday(tasks, now) : []), [tasks, now, todayOpen]);
  const upcomingCount = useMemo(() => upcoming(tasks, now).count, [tasks, now]);
  const week = useMemo(() => {
    const from = shiftKey(key, -6);
    return completionLog(tasks)
      .filter((g) => g.key >= from)
      .reduce((n, g) => n + g.items.length, 0);
  }, [tasks, key]);
  const results = useMemo(() => (searching ? searchTasks(tasks, q, now) : []), [searching, tasks, q, now]);
  const open = (t: Task) => setEditing(t);
  const counts: Partial<Record<View, number>> = { today: todayOpen, upcoming: upcomingCount };

  return (
    <section className="flex flex-col gap-4">
      {tasks.length ? <DayHeader plan={plan} now={now} week={week} /> : null}

      <Composer
        list={view === 'lists' && list ? list : undefined}
        defaultDue={view === 'today' ? 'today' : 'none'}
        onDetails={() => setCreating(true)}
      />

      {/* The views — or the search, in their place. */}
      {searching ? (
        <div className="flex items-center gap-2">
          <label className="flex-1 flex items-center gap-2 min-h-11 rounded-2xl bg-white dark:bg-dark-card ring-1 ring-teal/30 px-3">
            <Search size={16} className="text-text-muted shrink-0" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث في مهامك وخطواتها وملاحظاتها"
              className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] text-text-primary dark:text-text-on-dark placeholder:text-text-muted"
              aria-label="بحث في المهام"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setSearching(false);
              setQ('');
            }}
            className="w-11 h-11 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface text-text-secondary inline-flex items-center justify-center"
            aria-label="إغلاق البحث"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="عرض المهام"
            className="flex-1 grid grid-cols-4 gap-0.5 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1"
          >
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => {
                  setView(v);
                  if (v !== 'lists') setList(null);
                }}
                className={[
                  'min-h-10 rounded-xl inline-flex items-center justify-center gap-1 text-[13px] font-bold transition-[background-color,color,box-shadow] duration-200',
                  view === v
                    ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                    : 'text-text-muted hover:text-text-secondary',
                ].join(' ')}
              >
                {VIEW_LABEL[v]}
                {counts[v] ? <span className="font-counter tabular-nums text-[11px] opacity-75">{ar(counts[v]!)}</span> : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="w-11 h-11 shrink-0 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/80 inline-flex items-center justify-center hover:text-teal"
            aria-label="بحث في المهام"
          >
            <Search size={18} />
          </button>
        </div>
      )}

      {searching ? (
        q.trim() ? (
          results.length ? (
            <section className="flex flex-col gap-2">
              <Heading Icon={Search} label="النتائج" count={results.length} />
              <Card className="p-1.5">
                <Rows tasks={results} now={now} onOpen={open} />
              </Card>
            </section>
          ) : (
            <p className="text-center text-[13px] text-text-muted py-6">لا مهمة فيها «{q.trim()}»</p>
          )
        ) : (
          <p className="text-center text-[13px] text-text-muted py-6">اكتب كلمة من عنوان المهمة أو خطواتها أو ملاحظاتها</p>
        )
      ) : view === 'today' ? (
        <TodayView plan={plan} times={times} suggestions={suggestions} now={now} onOpen={open} />
      ) : view === 'upcoming' ? (
        <UpcomingView tasks={tasks} now={now} onOpen={open} />
      ) : view === 'lists' ? (
        <ListsView tasks={tasks} now={now} list={list} onList={setList} onOpen={open} />
      ) : (
        <DoneView tasks={tasks} now={now} onOpen={open} />
      )}

      <TaskEditSheet
        open={creating || !!editing}
        task={editing ?? undefined}
        defaultList={view === 'lists' && list ? list : undefined}
        defaultDue={!editing && view === 'today' ? key : undefined}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </section>
  );
}
