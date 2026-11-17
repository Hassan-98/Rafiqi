import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle, Bell, Briefcase, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, Circle, Flag, GraduationCap, Home, Inbox,
  LayoutList, ListChecks, Plus, Repeat, SlidersHorizontal, Sparkles, Sun, Sunrise, Trash2, UserRound,
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
import { useTasksStore } from '@/store/tasksStore';
import { useStudyStore } from '@/store/studyStore';
import {
  LIST_LABEL, TASK_LISTS, REPEAT_LABEL, OPEN_GROUP_LABEL, clockAr, compareTasks, completionLog, completionOn, dayHeadingAr, dayKey,
  dueLabel, isDoneOn, isOverdue, openGroupOf, parseQuickAdd, shiftKey, stampAr, subtaskDone, PRIORITY_LABEL,
  type DoneEntry, type OpenGroup, type Task, type TaskList,
} from '@/store/studyModel';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { PRIORITY_TONE, useNow } from './studyUi';
import { TaskEditSheet } from './TaskEditSheet';

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
const moreStepsAr = (n: number) =>
  n === 2 ? 'وخطوتان أخريان' : `و${toArabicDigits(n)} ${n <= 10 ? 'خطوات' : 'خطوة'} أخرى`;

/**
 * An open task's steps under its row, ticked in place (per occurrence for a
 * repeating task). Indented to sit under the title of a TaskRow / Home task row
 * (both put the title 56px in). A long list folds to `max` rows from its first
 * open step; the fold line unfolds it in place.
 */
export function TaskSteps({
  t,
  dayKey: key,
  max = STEPS_SHOWN,
  className = '',
}: {
  t: Task;
  dayKey: string;
  max?: number;
  className?: string;
}) {
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
              className="w-full min-h-10 flex items-start gap-2.5 ps-1.5 pe-2 py-2.5 rounded-xl text-start hover:bg-teal/5 active:bg-teal/10"
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
                  className={['transition-transform duration-200 ease-out-soft motion-reduce:transition-none', done ? 'scale-100' : 'scale-0'].join(' ')}
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

/** Each list's mark — the same icon on its filter chip and on every row tagged with it. */
export const LIST_ICON: Record<TaskList, LucideIcon> = {
  today: Inbox,
  worship: Sparkles,
  study: GraduationCap,
  home: Home,
  work: Briefcase,
  personal: UserRound,
};

/** A small rounded tag in a task row's meta line. */
function Tag({ tone = 'muted', children }: { tone?: 'muted' | 'teal' | 'danger' | 'gold'; children: ReactNode }) {
  const cls = {
    muted: 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/70',
    teal: 'bg-teal/10 text-teal dark:text-teal-light',
    danger: 'bg-danger/10 text-danger',
    gold: 'bg-gold/15 text-gold-dark dark:text-gold-light',
  }[tone];
  return <span className={['inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[11px] font-semibold', cls].join(' ')}>{children}</span>;
}

export function TaskRow({ t, now, first, onOpen }: { t: Task; now: number; first?: boolean; onOpen: () => void }) {
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const circles = useStudyStore((s) => s.circles);
  const key = dayKey(now);
  const done = isDoneOn(t, key);
  const overdue = isOverdue(t, now) && !done;
  const due = dueLabel(t, now);
  const subDone = t.subtasks.filter((s) => subtaskDone(t, s, key)).length;
  const circle = t.circleId ? circles.find((c) => c.id === t.circleId) : undefined;
  const ListIcon = LIST_ICON[t.list];
  const dueToday = t.due === key || (t.repeat !== 'none' && openGroupOf(t, now) === 'today');
  const doneAt = done ? (t.repeat === 'none' ? t.doneAt : t.history?.[key]) : undefined;

  const toggle = () => {
    const nowDone = toggleTask(t.id, key);
    if (nowDone) {
      void hapticsService.notify('success');
      if (t.repeat !== 'none') toast.success('أحسنت، تعود في موعدها القادم');
    } else void hapticsService.impact('light');
  };

  return (
    <div className={['relative', first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]'].join(' ')}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen();
        }}
        className="flex items-start gap-3 px-3 py-3.5 rounded-[var(--radius-inner)] hover:bg-teal/5 cursor-pointer"
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
                  'shrink-0 inline-flex items-center gap-1 font-counter tabular-nums text-[12px] font-bold',
                  overdue ? 'text-danger' : 'text-teal dark:text-teal-light',
                ].join(' ')}
              >
                {t.reminderOffset !== undefined ? <Bell size={11} aria-label="بتذكير" /> : null}
                {timeAr(t.time)}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {doneAt ? (
              <Tag tone="teal">
                <CheckCircle2 size={11} aria-hidden /> أُنجزت {clockAr(doneAt)}
              </Tag>
            ) : due ? (
              <Tag tone={overdue ? 'danger' : dueToday ? 'teal' : 'muted'}>
                <CalendarDays size={11} aria-hidden />
                {overdue ? 'متأخرة · ' : ''}
                {due}
              </Tag>
            ) : null}
            {t.repeat !== 'none' ? (
              <Tag>
                <Repeat size={11} aria-hidden />
                {REPEAT_LABEL[t.repeat]}
              </Tag>
            ) : null}
            {t.subtasks.length ? (
              <Tag tone={subDone === t.subtasks.length ? 'teal' : 'muted'}>
                <ListChecks size={11} aria-hidden />
                {toArabicDigits(subDone)}/{toArabicDigits(t.subtasks.length)}
              </Tag>
            ) : null}
            {circle ? (
              <Tag tone="gold">
                <GraduationCap size={11} aria-hidden />
                <span className="truncate max-w-[34vw]">{circle.title}</span>
              </Tag>
            ) : null}
            <Tag>
              <ListIcon size={11} aria-hidden />
              {LIST_LABEL[t.list]}
            </Tag>
          </div>
        </div>
      </div>
      {!done && t.subtasks.length ? <TaskSteps t={t} dayKey={key} className="-mt-2 pb-2" /> : null}
    </div>
  );
}

/** «18:00» → «٦:٠٠ م». */
function timeAr(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${toArabicDigits(((h + 11) % 12) + 1)}:${toArabicDigits(String(m).padStart(2, '0'))} ${h < 12 ? 'ص' : 'م'}`;
}

type DueChoice = 'none' | 'today' | 'tomorrow';

/**
 * The composer: type a task (natural dates still parse: «غداً الساعة ٩ مهم»),
 * or pick the day and mark it important with one tap. It lands in the list
 * being viewed (or «عام»).
 * «تفاصيل» opens the full sheet for steps, repeats and reminders.
 */
function QuickAdd({ list, onAdded, onDetails }: { list?: TaskList; onAdded?: () => void; onDetails: () => void }) {
  const addTask = useTasksStore((s) => s.addTask);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [dueChoice, setDueChoice] = useState<DueChoice>('none');
  const [important, setImportant] = useState(false);
  const now = Date.now();
  const parsed = text.trim() ? parseQuickAdd(text, now) : null;
  const target = list ?? 'today';
  const ListIcon = LIST_ICON[target];
  const open = focused || !!text;

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
    setDueChoice('none');
    setImportant(false);
    onAdded?.();
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
      on
        ? 'bg-teal text-on-accent'
        : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/75 hover:bg-teal/10',
    ].join(' ');

  return (
    <Card className={['p-3 transition-shadow', open ? 'ring-2 ring-teal/30' : ''].join(' ')}>
      <form
        className="flex items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0" aria-hidden>
          <Plus size={20} />
        </span>
        <TextInput
          value={text}
          onValueChange={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="ماذا تريد أن تنجز؟"
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
        <div className="mt-2 ps-12.5 flex flex-wrap items-center gap-1.5">
          <Sparkles size={13} className="text-gold" aria-hidden />
          {parsedChips.map((c) => (
            <Tag key={c} tone="teal">
              {c}
            </Tag>
          ))}
        </div>
      ) : null}

      {/* One-tap options: pressing them keeps the input focused (mouse-down is prevented). */}
      <div className="mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-col gap-2" onMouseDown={(e) => e.preventDefault()}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" aria-pressed={dueChoice === 'today'} className={chip(dueChoice === 'today')} onClick={() => setDueChoice(dueChoice === 'today' ? 'none' : 'today')}>
            <Sun size={14} /> اليوم
          </button>
          <button type="button" aria-pressed={dueChoice === 'tomorrow'} className={chip(dueChoice === 'tomorrow')} onClick={() => setDueChoice(dueChoice === 'tomorrow' ? 'none' : 'tomorrow')}>
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
          <span className="flex-1" />
          <button type="button" onClick={onDetails} className="min-h-9 px-2 rounded-xl text-xs font-bold text-teal dark:text-teal-light inline-flex items-center gap-1 hover:bg-teal/5">
            <SlidersHorizontal size={14} /> تفاصيل أكثر
          </button>
        </div>
        {list ? (
          <p className="text-[11px] text-text-muted inline-flex items-center gap-1">
            <ListIcon size={12} /> تُضاف إلى قائمة «{LIST_LABEL[list]}»
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** «المفتوحة» lists what's left, grouped by when it's due; «المنجزة» is the completion log by day. */
type TaskTab = 'open' | 'done';

const OPEN_ORDER: OpenGroup[] = ['overdue', 'today', 'tomorrow', 'later', 'undated'];
const GROUP_ICON: Record<OpenGroup, LucideIcon> = {
  overdue: AlertCircle,
  today: Sun,
  tomorrow: Sunrise,
  later: CalendarDays,
  undated: Inbox,
};
/** Completion days shown before «عرض الأقدم». */
const DONE_DAYS_SHOWN = 4;

function GroupHeading({ label, count, Icon, tone = 'muted' }: { label: string; count: number; Icon: LucideIcon; tone?: 'muted' | 'danger' | 'accent' }) {
  const color =
    tone === 'danger'
      ? 'bg-danger/10 text-danger'
      : tone === 'accent'
        ? 'bg-teal/10 text-teal dark:text-teal-light'
        : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-secondary dark:text-text-on-dark/75';
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={['w-7 h-7 rounded-lg inline-flex items-center justify-center', color].join(' ')} aria-hidden>
        <Icon size={15} />
      </span>
      <h3 className="text-[14px] font-display font-bold text-text-primary dark:text-text-on-dark">{label}</h3>
      <span className="min-w-6 h-6 px-1.5 rounded-full bg-cream-dark/60 dark:bg-white/[0.06] font-counter tabular-nums text-[11px] font-bold text-text-muted inline-flex items-center justify-center">
        {toArabicDigits(count)}
      </span>
    </div>
  );
}

/** One completion in the log: when it was done and when the task was registered. Tap the tick to undo. */
function DoneRow({ e, now, first, onOpen }: { e: DoneEntry; now: number; first: boolean; onOpen: () => void }) {
  const setTaskDone = useTasksStore((s) => s.setTaskDone);
  const { t } = e;
  const ListIcon = LIST_ICON[t.list];
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
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Tag tone="teal">
            <CheckCircle2 size={11} aria-hidden /> أُنجزت {clockAr(e.at)}
          </Tag>
          <Tag>
            <CalendarPlus size={11} aria-hidden /> سُجّلت {stampAr(t.createdAt, now)}
          </Tag>
          {t.repeat !== 'none' ? (
            <Tag>
              <Repeat size={11} aria-hidden />
              {REPEAT_LABEL[t.repeat]}
            </Tag>
          ) : null}
          <Tag>
            <ListIcon size={11} aria-hidden />
            {LIST_LABEL[t.list]}
          </Tag>
        </div>
      </div>
    </div>
  );
}

/** Today at a glance, on the accent surface: progress, what's late, what's open, the week's tally. */
function TasksSummary({ tasks, now, onShowDone }: { tasks: Task[]; now: number; onShowDone: () => void }) {
  const key = dayKey(now);
  const today = completionOn(tasks, key);
  const overdue = tasks.filter((t) => isOverdue(t, now)).length;
  const open = tasks.filter((t) => !isDoneOn(t, key)).length;
  const weekStart = shiftKey(key, -6);
  const week = completionLog(tasks).filter((g) => g.key >= weekStart).reduce((n, g) => n + g.items.length, 0);
  const pct = today.total ? Math.round((today.done / today.total) * 100) : 0;
  const stats: { v: number; l: string; alert?: boolean; onClick?: () => void }[] = [
    { v: overdue, l: 'متأخرة', alert: overdue > 0 },
    { v: open, l: 'مفتوحة' },
    { v: week, l: 'هذا الأسبوع', onClick: onShowDone },
  ];
  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-6 -end-8 w-36 opacity-15" />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <ProgressRing
            value={pct}
            size={84}
            strokeWidth={7}
            showPercent={false}
            animate={false}
            colorFrom="var(--color-gold-light)"
            colorTo="var(--color-gold)"
            trackColor="color-mix(in srgb, var(--color-on-accent) 16%, transparent)"
          />
          <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="font-counter tabular-nums text-xl font-bold">
              {toArabicDigits(today.done)}
              <span className="text-sm text-on-accent/70">/{toArabicDigits(today.total)}</span>
            </span>
            <span className="mt-1 text-[10px] text-on-accent/75">اليوم</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-on-accent/70">مهامك اليوم</p>
          <p className="mt-0.5 text-xl font-display font-bold text-balance leading-snug">
            {today.total === 0
              ? 'لا مهام لليوم بعد'
              : today.done >= today.total
                ? 'أنجزت مهام اليوم، بارك الله فيك'
                : `باقٍ ${toArabicDigits(today.total - today.done)} من ${toArabicDigits(today.total)}`}
          </p>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        {stats.map((x) => {
          const body = (
            <>
              <p className={['font-counter tabular-nums text-lg font-bold leading-none', x.alert ? 'text-gold-light' : ''].join(' ')}>{toArabicDigits(x.v)}</p>
              <p className="mt-1 text-[10.5px] text-on-accent/75 leading-tight">{x.l}</p>
            </>
          );
          return x.onClick ? (
            <button key={x.l} type="button" onClick={x.onClick} className="rounded-[var(--radius-inner)] bg-on-accent/10 hover:bg-on-accent/15 px-2 py-2.5 text-center transition-colors">
              {body}
            </button>
          ) : (
            <div key={x.l} className="rounded-[var(--radius-inner)] bg-on-accent/10 px-2 py-2.5 text-center">
              {body}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** List filter: every list with its icon and open count (lists with nothing open fade). */
function ListFilter({ tasks, now, value, onChange }: { tasks: Task[]; now: number; value: TaskList | 'all'; onChange: (l: TaskList | 'all') => void }) {
  const key = dayKey(now);
  const openIn = (l: TaskList | 'all') => tasks.filter((t) => (l === 'all' || t.list === l) && !isDoneOn(t, key)).length;
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible" aria-label="القوائم">
      {(['all', ...TASK_LISTS] as const).map((l) => {
        const Icon = l === 'all' ? LayoutList : LIST_ICON[l];
        const n = openIn(l);
        const on = value === l;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(l)}
            className={[
              'min-h-10 px-3 rounded-xl text-[12.5px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors',
              on
                ? 'bg-teal text-on-accent shadow-[var(--shadow-xs)]'
                : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/5',
              !on && n === 0 && l !== 'all' ? 'opacity-60' : '',
            ].join(' ')}
          >
            <Icon size={15} />
            <span>{l === 'all' ? 'كل القوائم' : LIST_LABEL[l]}</span>
            {n > 0 ? (
              <span className={['font-counter tabular-nums text-[11px]', on ? 'text-on-accent/80' : 'text-text-muted'].join(' ')}>{toArabicDigits(n)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TasksView({ focusTaskId }: { focusTaskId?: string | null }) {
  const tasks = useTasksStore((s) => s.tasks);
  const clearCompleted = useTasksStore((s) => s.clearCompleted);
  const now = useNow();
  const [tab, setTab] = useState<TaskTab>('open');
  const [list, setList] = useState<TaskList | 'all'>('all');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [allDays, setAllDays] = useState(false);

  // Deep link (notification / widget): open that task's sheet once.
  useEffect(() => {
    if (!focusTaskId) return;
    // Widget «+» sends task=new → open the add-task sheet.
    if (focusTaskId === 'new') return setCreating(true);
    const t = useTasksStore.getState().tasks.find((x) => x.id === focusTaskId);
    if (t) setEditing(t);
  }, [focusTaskId]);

  const key = dayKey(now);
  const scoped = useMemo(() => (list === 'all' ? tasks : tasks.filter((t) => t.list === list)), [tasks, list]);

  const groups = useMemo(() => {
    const out: Record<OpenGroup, Task[]> = { overdue: [], today: [], tomorrow: [], later: [], undated: [] };
    for (const t of scoped) if (!isDoneOn(t, key)) out[openGroupOf(t, now)].push(t);
    for (const g of OPEN_ORDER) out[g].sort((a, b) => compareTasks(a, b, key));
    return out;
  }, [scoped, now, key]);
  const doneToday = useMemo(() => scoped.filter((t) => isDoneOn(t, key)), [scoped, key]);
  const log = useMemo(() => completionLog(scoped), [scoped]);
  const openCount = OPEN_ORDER.reduce((n, g) => n + groups[g].length, 0);
  const doneCount = log.reduce((n, g) => n + g.items.length, 0);
  const logShown = allDays ? log : log.slice(0, DONE_DAYS_SHOWN);

  return (
    // Phone: one column — summary, composer, lists, tasks (the wrappers are
    // `display: contents`, so `order-*` arranges their children). Wide: the
    // summary + lists form a short side column; the composer heads the tasks.
    <section className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-6 lg:items-start">
      <div className="contents lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-4">
        {tasks.length ? (
          <div className="order-1">
            <TasksSummary tasks={scoped} now={now} onShowDone={() => setTab('done')} />
          </div>
        ) : null}
        <div className="order-3">
          <ListFilter tasks={tasks} now={now} value={list} onChange={setList} />
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4 lg:min-w-0">
        <div className="order-2">
          <QuickAdd list={list === 'all' ? undefined : list} onAdded={() => setTab('open')} onDetails={() => setCreating(true)} />
        </div>

      {/* ── The tasks ─────────────────────────────────────── */}
      <div className="order-4 flex flex-col gap-4 min-w-0">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="tablist" aria-label="المهام">
          {(
            [
              ['open', 'المفتوحة', openCount, Circle],
              ['done', 'المنجزة', doneCount, CheckCircle2],
            ] as [TaskTab, string, number, LucideIcon][]
          ).map(([id, label, n, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={[
                'min-h-11 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-bold transition-[background-color,color,box-shadow] duration-200',
                tab === id ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              <Icon size={15} />
              {label}
              <span className="min-w-5 h-5 px-1 rounded-full bg-teal/10 font-counter tabular-nums text-[11px] inline-flex items-center justify-center">
                {toArabicDigits(n)}
              </span>
            </button>
          ))}
        </div>

        {tab === 'open' ? (
          openCount === 0 && doneToday.length === 0 ? (
            <Card className="p-2">
              <EmptyState
                title={scoped.length ? 'لا شيء مفتوح، بارك الله فيك' : 'لا مهام بعد'}
                description={scoped.length ? undefined : 'اكتب مهمة في الأعلى، وتبقى في قائمتك حتى تنجزها. ولك أن تكتب موعداً: «غداً الساعة ٩».'}
              />
            </Card>
          ) : (
            <>
              {OPEN_ORDER.filter((g) => groups[g].length).map((g) => (
                <div key={g} className="flex flex-col gap-2">
                  <GroupHeading
                    label={OPEN_GROUP_LABEL[g]}
                    count={groups[g].length}
                    Icon={GROUP_ICON[g]}
                    tone={g === 'overdue' ? 'danger' : g === 'today' ? 'accent' : 'muted'}
                  />
                  <Card className={['p-1.5', g === 'overdue' ? 'ring-1 ring-danger/25' : ''].join(' ')}>
                    {groups[g].map((t, i) => (
                      <TaskRow key={t.id} t={t} now={now} first={i === 0} onOpen={() => setEditing(t)} />
                    ))}
                  </Card>
                </div>
              ))}
              {doneToday.length ? (
                <div className="flex flex-col gap-2">
                  <GroupHeading label="أُنجزت اليوم" count={doneToday.length} Icon={CheckCircle2} />
                  <Card className="p-1.5">
                    {doneToday.map((t, i) => (
                      <TaskRow key={t.id} t={t} now={now} first={i === 0} onOpen={() => setEditing(t)} />
                    ))}
                  </Card>
                </div>
              ) : null}
            </>
          )
        ) : log.length === 0 ? (
          <Card className="p-2">
            <EmptyState title="لم تُنجز مهمة بعد" description="كل مهمة تنجزها تُسجَّل هنا تحت يوم إنجازها ووقته." />
          </Card>
        ) : (
          <>
            {logShown.map((g) => (
              <div key={g.key} className="flex flex-col gap-2">
                <GroupHeading label={dayHeadingAr(g.key, now)} count={g.items.length} Icon={CalendarDays} tone={g.key === key ? 'accent' : 'muted'} />
                <Card className="p-1.5">
                  {g.items.map((e, i) => (
                    <DoneRow key={`${e.t.id}-${e.at}`} e={e} now={now} first={i === 0} onOpen={() => setEditing(e.t)} />
                  ))}
                </Card>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {log.length > DONE_DAYS_SHOWN ? (
                <Button variant="ghost" size="sm" onClick={() => setAllDays(!allDays)}>
                  {allDays ? 'عرض أقل' : `عرض الأقدم · ${toArabicDigits(log.length - DONE_DAYS_SHOWN)} أيام`}
                </Button>
              ) : null}
              {scoped.some((t) => t.repeat === 'none' && t.done) ? (
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
        )}
      </div>
      </div>

      <TaskEditSheet
        open={creating || !!editing}
        task={editing ?? undefined}
        defaultList={list === 'all' ? undefined : list}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </section>
  );
}
