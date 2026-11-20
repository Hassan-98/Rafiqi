import { useEffect, useState } from 'react';
import { AlarmClock, Check, Plus, Trash2, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SoundSelector } from '@/components/settings/SoundPicker';
import { useTasksStore } from '@/store/tasksStore';
import { useStudyStore } from '@/store/studyStore';
import {
  LIST_LABEL, PRIORITY_LABEL, REPEAT_LABEL, TASK_LISTS, WEEKDAY_AR, dayKey, durationAr, shiftKey, subtaskDone, withSubtaskDone,
  type Subtask, type Task, type TaskList, type TaskPriority, type TaskRepeat,
} from '@/store/studyModel';
import type { SoundKey } from '@/services/notifications/sounds';
import { toast } from '@/store/toastStore';
import { Field, Pill, fieldClass } from './studyUi';

const REMINDERS: (number | undefined)[] = [undefined, 0, 10, 30, 60, 1440];
const REPEATS: TaskRepeat[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'];
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];

interface Draft {
  title: string;
  notes: string;
  due: string;
  time: string;
  reminderOffset?: number;
  repeat: TaskRepeat;
  days: number[];
  priority: TaskPriority;
  list: TaskList;
  circleId?: string;
  subtasks: Subtask[];
  soundKey: SoundKey;
}

const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;

/** Create / edit a task — every field, subtasks, reminder and repeat. */
export function TaskEditSheet({
  open,
  onClose,
  task,
  defaultList,
  defaultCircleId,
  defaultDue,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task;
  defaultList?: TaskList;
  defaultCircleId?: string;
  /** A new task's day ('yyyy-MM-dd') — «اليوم» view adds for today. */
  defaultDue?: string;
}) {
  const addTask = useTasksStore((s) => s.addTask);
  const updateTask = useTasksStore((s) => s.updateTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const snooze = useTasksStore((s) => s.snooze);
  const toggleTask = useTasksStore((s) => s.toggleTask);
  const circles = useStudyStore((s) => s.circles);
  const [d, setD] = useState<Draft | null>(null);
  const [sub, setSub] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => (x ? { ...x, ...patch } : x));
  const today = dayKey(Date.now());

  useEffect(() => {
    if (!open) return;
    setSub('');
    setD(
      task
        ? {
            title: task.title,
            notes: task.notes ?? '',
            due: task.due ?? '',
            time: task.time ?? '',
            reminderOffset: task.reminderOffset,
            repeat: task.repeat,
            days: task.days ?? [],
            priority: task.priority,
            list: task.list,
            circleId: task.circleId,
            subtasks: task.subtasks,
            soundKey: task.soundKey ?? 'target',
          }
        : {
            title: '',
            notes: '',
            due: defaultDue ?? '',
            time: '',
            reminderOffset: undefined,
            repeat: 'none',
            days: [],
            priority: 'normal',
            list: defaultList ?? (defaultCircleId ? 'study' : 'today'),
            circleId: defaultCircleId,
            subtasks: [],
            soundKey: 'target',
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  if (!d) return <BottomSheet open={false} onClose={onClose}>{null}</BottomSheet>;

  const save = () => {
    const title = d.title.trim();
    if (!title) {
      toast.error('اكتب عنوان المهمة');
      return;
    }
    if (d.repeat === 'custom' && d.days.length === 0) {
      toast.error('اختر أيام التكرار');
      return;
    }
    const pendingSub = sub.trim();
    const subtasks = pendingSub ? [...d.subtasks, { id: makeId(), title: pendingSub, done: false }] : d.subtasks;
    const payload = {
      title,
      notes: d.notes.trim() || undefined,
      // A time needs a day for its reminder to arm; undated tasks simply stay on the list.
      due: d.due || (d.time ? today : undefined),
      time: d.time || undefined,
      reminderOffset: d.time ? d.reminderOffset : undefined,
      repeat: d.repeat,
      days: d.repeat === 'custom' ? d.days : undefined,
      priority: d.priority,
      list: d.list,
      circleId: d.circleId,
      subtasks,
      soundKey: d.soundKey,
    };
    if (task) updateTask(task.id, payload);
    else addTask(payload);
    toast.success(task ? 'حُفظت المهمة' : 'أُضيفت المهمة');
    onClose();
  };

  const activeCircles = circles.filter((c) => c.status === 'active');
  // The draft as a task: its steps tick per occurrence, the same rule as the list outside.
  const draftTask = { ...task, createdAt: task?.createdAt ?? Date.now(), repeat: d.repeat, due: d.due || undefined, days: d.days, subtasks: d.subtasks } as Task;

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={task ? 'تفاصيل المهمة' : 'مهمة جديدة'}>
        <div className="flex flex-col gap-4">
          <TextInput
            value={d.title}
            onValueChange={(v) => set({ title: v })}
            placeholder="ماذا تريد أن تنجز؟"
            className={`${fieldClass} text-base font-semibold`}
            aria-label="عنوان المهمة"
          />

          {/* Subtasks */}
          <div className="flex flex-col gap-1.5">
            {d.subtasks.map((s) => {
              const done = subtaskDone(draftTask, s, today);
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-xl bg-cream-dark/40 dark:bg-white/[0.04] ps-1 pe-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`خطوة: ${s.title}`}
                    onClick={() => set({ subtasks: withSubtaskDone(draftTask, s.id, today) })}
                    className="w-10 h-10 inline-flex items-center justify-center shrink-0"
                  >
                    <span
                      className={[
                        'w-5 h-5 rounded-md border-2 inline-flex items-center justify-center transition-colors',
                        done ? 'bg-teal border-teal text-on-accent' : 'border-teal/50',
                      ].join(' ')}
                    >
                      {done ? <Check size={12} strokeWidth={3.2} /> : null}
                    </span>
                  </button>
                  <span className={['flex-1 text-sm', done ? 'line-through text-text-muted' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
                    {s.title}
                  </span>
                  <button
                    type="button"
                    aria-label="حذف الخطوة"
                    onClick={() => set({ subtasks: d.subtasks.filter((x) => x.id !== s.id) })}
                    className="w-9 h-9 inline-flex items-center justify-center text-text-muted hover:text-danger"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!sub.trim()) return;
                set({ subtasks: [...d.subtasks, { id: makeId(), title: sub.trim(), done: false }] });
                setSub('');
              }}
            >
              <TextInput value={sub} onValueChange={setSub} placeholder="أضف خطوة" className={fieldClass} aria-label="خطوة جديدة" />
              <Button type="submit" variant="soft" size="md" aria-label="إضافة خطوة" leftIcon={<Plus size={17} />} />
            </form>
          </div>

          <Field label="الموعد">
            <div className="flex flex-wrap gap-2">
              {[
                { l: 'اليوم', v: today },
                { l: 'غداً', v: shiftKey(today, 1) },
                { l: 'بعد أسبوع', v: shiftKey(today, 7) },
                { l: 'بلا موعد', v: '' },
              ].map((o) => (
                <Pill key={o.l} active={d.due === o.v} onClick={() => set({ due: o.v })}>
                  {o.l}
                </Pill>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <input type="date" value={d.due} onChange={(e) => set({ due: e.target.value })} className={fieldClass} aria-label="التاريخ" />
              <input
                type="time"
                value={d.time}
                onChange={(e) => set({ time: e.target.value, reminderOffset: d.reminderOffset ?? (e.target.value ? 0 : undefined) })}
                className={fieldClass}
                aria-label="الوقت"
              />
            </div>
          </Field>

          {/* The reminder only once there is a time to remind at. */}
          {d.time ? (
            <Field label="التذكير">
              <div className="flex flex-wrap gap-2">
                {REMINDERS.map((o) => (
                  <Pill key={String(o)} active={d.reminderOffset === o} onClick={() => set({ reminderOffset: o })}>
                    {o === undefined ? 'بلا تذكير' : o === 0 ? 'عند الموعد' : `قبل ${durationAr(o)}`}
                  </Pill>
                ))}
              </div>
              {d.reminderOffset !== undefined ? (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-text-muted">النغمة</span>
                  <SoundSelector value={d.soundKey} onChange={(k) => set({ soundKey: k })} ariaLabel="نغمة المهمة" />
                </div>
              ) : null}
            </Field>
          ) : null}

          {/* Dropdowns keep the sheet short (owner 2026-11-19). */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="التكرار">
              <select
                value={d.repeat}
                onChange={(e) => set({ repeat: e.target.value as TaskRepeat, due: d.due || today })}
                className={fieldClass}
                aria-label="التكرار"
              >
                {REPEATS.map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الأولوية">
              <select value={d.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })} className={fieldClass} aria-label="الأولوية">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {d.repeat === 'custom' ? (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mt-2" role="group" aria-label="أيام التكرار">
              {WEEKDAY_AR.map((w, wd) => (
                <Pill
                  key={w}
                  className="px-2.5"
                  active={d.days.includes(wd)}
                  onClick={() => set({ days: d.days.includes(wd) ? d.days.filter((x) => x !== wd) : [...d.days, wd].sort() })}
                >
                  {w}
                </Pill>
              ))}
            </div>
          ) : null}
          {d.repeat === 'weekdays' ? <span className="-mt-2 text-[11px] text-text-muted">من الأحد إلى الخميس</span> : null}

          <div className={['grid gap-3', activeCircles.length ? 'grid-cols-2' : 'grid-cols-1'].join(' ')}>
            <Field label="القائمة">
              <select value={d.list} onChange={(e) => set({ list: e.target.value as TaskList })} className={fieldClass} aria-label="القائمة">
                {TASK_LISTS.map((l) => (
                  <option key={l} value={l}>
                    {LIST_LABEL[l]}
                  </option>
                ))}
              </select>
            </Field>
            {activeCircles.length ? (
              <Field label="حلقة علم">
                <select
                  value={d.circleId ?? ''}
                  onChange={(e) => set(e.target.value ? { circleId: e.target.value, list: 'study' } : { circleId: undefined })}
                  className={fieldClass}
                  aria-label="مرتبطة بحلقة"
                >
                  <option value="">بلا حلقة</option>
                  {activeCircles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>

          <Field label="ملاحظات">
            <TextArea value={d.notes} onValueChange={(v) => set({ notes: v })} rows={3} className={fieldClass} placeholder="تفاصيل، رابط، صفحة…" />
          </Field>

          <div className="flex flex-col gap-2 pt-1">
            <Button fullWidth onClick={save}>
              حفظ
            </Button>
            {task && task.repeat === 'none' && !task.done ? (
              <div className="flex items-center gap-2" role="group" aria-label="تأجيل">
                <span className="text-xs text-text-muted">تأجيل إلى</span>
                {[
                  { l: 'الغد', n: 1 },
                  { l: 'بعد أسبوع', n: 7 },
                ].map((o) => (
                  <Pill
                    active={false}
                    key={o.n}
                    onClick={() => {
                      updateTask(task.id, { due: shiftKey(today, o.n) });
                      toast.info(o.n === 1 ? 'أُجّلت إلى الغد' : 'أُجّلت أسبوعاً');
                      onClose();
                    }}
                  >
                    {o.l}
                  </Pill>
                ))}
              </div>
            ) : null}
            {task ? (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  leftIcon={<Check size={16} />}
                  onClick={() => {
                    toggleTask(task.id);
                    onClose();
                  }}
                >
                  {task.repeat === 'none' ? (task.done ? 'إعادة فتح' : 'أنجزتها') : task.history?.[today] ? 'تراجع عن اليوم' : 'أنجزتها اليوم'}
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={<AlarmClock size={16} />}
                  onClick={() => {
                    snooze(task.id, 60);
                    toast.info('سنذكّرك بعد ساعة');
                    onClose();
                  }}
                >
                  بعد ساعة
                </Button>
                <Button variant="icon" aria-label="حذف المهمة" onClick={() => setConfirmDelete(true)} className="text-danger">
                  <Trash2 size={18} />
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDelete}
        title="حذف المهمة؟"
        message={task?.repeat !== 'none' ? 'سيُحذف معها سجلّ إنجازها.' : undefined}
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (task) removeTask(task.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
}
