import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Bell, BellOff, Check, CircleCheck, Clock, ExternalLink, Pause, Pencil, Play, Plus, Trash2, Undo2, X } from 'lucide-react';
import { motion } from '@/lib/motion';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle, Medallion } from '@/components/ui/Ornament';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import {
  FORMAT_LABEL, SUBJECT_LABEL, WEEKDAY_AR, attendanceRate, clockAr, completion, durationAr, hhmm, inAr,
  lessonsDone, nextSession, platformPhrase,
  type LessonLog, type LessonStatus, type StudyCircle,
} from '@/store/studyModel';
import { rescheduleAllStudy } from '@/services/studyReminders';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { Field, Pill, PlatformChip, SUBJECT_ICON, fieldClass, openLink, useNow } from '@/components/study/studyUi';
import { CircleFormSheet } from '@/components/study/CircleFormSheet';
import { useQuickLog, whenAr } from '@/components/study/CirclesView';
import { TaskRow } from '@/components/study/TasksView';
import { TaskEditSheet } from '@/components/study/TaskEditSheet';
import type { Task } from '@/store/studyModel';

const STATUS_LABEL: Record<LessonStatus, string> = { attended: 'حضرت', watched: 'شاهدت', missed: 'فاتني' };

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hhmm(d)}`;
};

/** Consecutive non-missed entries from the newest. */
const runStreak = (c: StudyCircle) => {
  let n = 0;
  for (const l of c.log) {
    if (l.status === 'missed') break;
    n++;
  }
  return n;
};

function LogSheet({ c, entry, open, onClose }: { c: StudyCircle; entry?: LessonLog; open: boolean; onClose: () => void }) {
  const logSession = useStudyStore((s) => s.logSession);
  const updateLog = useStudyStore((s) => s.updateLog);
  const removeLog = useStudyStore((s) => s.removeLog);
  const [status, setStatus] = useState<LessonStatus>('attended');
  const [title, setTitle] = useState('');
  const [n, setN] = useState('');
  const [at, setAt] = useState(Date.now());
  const [dur, setDur] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setStatus(entry?.status ?? (c.format === 'live' ? 'attended' : 'watched'));
    setTitle(entry?.title ?? '');
    setN(String(entry?.n ?? (c.format === 'live' ? '' : lessonsDone(c) + 1)));
    setAt(entry?.date ?? Date.now());
    setDur(entry?.durationMin ? String(entry.durationMin) : '');
    setNotes(entry?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const save = () => {
    const patch = {
      status,
      title: title.trim() || undefined,
      n: Number(n) > 0 ? Math.round(Number(n)) : undefined,
      date: at,
      durationMin: Number(dur) > 0 ? Math.round(Number(dur)) : undefined,
      notes: notes.trim() || undefined,
    };
    if (entry) updateLog(c.id, entry.id, patch);
    else logSession(c.id, patch);
    toast.success(status === 'missed' ? 'سُجّل، عوّضه الله لك' : 'تقبّل الله، سُجّل الدرس');
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={entry ? 'تعديل الدرس' : 'تسجيل درس'}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          {(['attended', 'watched', 'missed'] as LessonStatus[]).map((s) => (
            <Pill key={s} active={status === s} onClick={() => setStatus(s)} className="flex-1">
              {STATUS_LABEL[s]}
            </Pill>
          ))}
        </div>
        <div className="flex gap-2">
          <Field label="رقم الدرس">
            <input type="number" min={1} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="المدة (دقيقة)">
            <input type="number" min={1} inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} className={fieldClass} />
          </Field>
        </div>
        <Field label="عنوان الدرس (اختياري)">
          <TextInput value={title} onValueChange={setTitle} className={fieldClass} placeholder="باب النية" />
        </Field>
        <Field label="الوقت">
          <input
            type="datetime-local"
            value={toLocalInput(at)}
            onChange={(e) => {
              const v = new Date(e.target.value).getTime();
              if (Number.isFinite(v)) setAt(v);
            }}
            className={fieldClass}
          />
        </Field>
        <Field label="فوائد وملاحظات">
          <TextArea value={notes} onValueChange={setNotes} rows={4} className={fieldClass} placeholder="أهم ما استفدته من الدرس…" />
        </Field>
        <Button fullWidth onClick={save}>
          حفظ
        </Button>
        {entry ? (
          <Button
            variant="ghost"
            className="text-danger"
            leftIcon={<Trash2 size={16} />}
            onClick={() => {
              removeLog(c.id, entry.id);
              onClose();
            }}
          >
            حذف هذا السجل
          </Button>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export function CircleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = useStudyStore((s) => s.circles.find((x) => x.id === id));

  useEffect(() => {
    void rescheduleAllStudy();
  }, []);

  if (!c) {
    return (
      <div className="min-h-dvh">
        <TopAppBar title="الحلقة" showBack />
        <EmptyState title="لم نجد هذه الحلقة" description="ربما حُذفت." cta={{ label: 'إلى حلقاتي', onClick: () => navigate('/study') }} />
      </div>
    );
  }
  return <Detail c={c} />;
}

function Detail({ c }: { c: StudyCircle }) {
  const navigate = useNavigate();
  const setStatus = useStudyStore((s) => s.setStatus);
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const removeCircle = useStudyStore((s) => s.removeCircle);
  const allTasks = useTasksStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.circleId === c.id), [allTasks, c.id]);
  const now = useNow();
  const [edit, setEdit] = useState<{ step: number } | null>(null);
  const [logOpen, setLogOpen] = useState<{ entry?: LessonLog } | null>(null);
  const [taskSheet, setTaskSheet] = useState<{ task?: Task } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = SUBJECT_ICON[c.subject];
  const next = c.status === 'active' ? nextSession(c, now) : null;
  const pct = completion(c);
  const done = lessonsDone(c);
  const rate = c.format === 'live' ? attendanceRate(c, now) : null;
  const streak = runStreak(c);
  const minutes = c.log.reduce((s, l) => s + (l.status !== 'missed' ? l.durationMin ?? 0 : 0), 0);
  const { loggedToday, label, log, undo } = useQuickLog(c);
  const ringValue = pct !== null ? pct * 100 : rate !== null ? rate * 100 : null;

  return (
    <div className="min-h-dvh pb-10">
      <TopAppBar
        title={c.title}
        subtitle={[c.teacher, SUBJECT_LABEL[c.subject]].filter(Boolean).join(' · ')}
        showBack
        actions={
          <Button variant="icon" aria-label="تعديل الحلقة" onClick={() => setEdit({ step: 1 })}>
            <Pencil size={18} />
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 pt-4">
        {/* Hero */}
        <Card variant="gradient-edge" className="p-5">
          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <PlatformChip platform={c.platform} />
                <span className="rounded-full bg-teal/10 text-teal dark:text-teal-light px-2 py-0.5 text-[11px] font-semibold">{FORMAT_LABEL[c.format]}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </span>
                <h1 className="text-xl font-display font-bold text-text-primary dark:text-text-on-dark leading-snug text-balance">{c.title}</h1>
              </div>
              <p className="mt-2 text-[13px] text-text-secondary dark:text-text-on-dark/80">
                {c.status === 'paused'
                  ? 'متوقفة مؤقتاً — لا تنبيهات'
                  : c.status === 'done'
                    ? 'أتممتها، بارك الله لك فيما تعلّمت'
                    : next?.live
                      ? `يُبث الآن ${platformPhrase(c.platform)}`
                      : next
                        ? `${whenAr(next.at, now)} · ${inAr(next.at - now)}`
                        : c.totalLessons
                          ? `الدرس ${toArabicDigits(Math.min(done + 1, c.totalLessons))} من ${toArabicDigits(c.totalLessons)} ينتظرك`
                          : 'لا مواعيد مجدولة'}
              </p>
            </div>
            {ringValue !== null ? (
              <div className="flex flex-col items-center gap-1">
                <ProgressRing value={ringValue} size={84} strokeWidth={7} />
                <span className="text-[10.5px] text-text-muted">{pct !== null ? 'من السلسلة' : 'الحضور'}</span>
              </div>
            ) : (
              <Medallion size={64} tone="gold">
                <span className="text-lg text-gold-dark dark:text-gold-light">{toArabicDigits(done)}</span>
              </Medallion>
            )}
          </div>

          <div className="relative mt-5 flex flex-col gap-2">
            {c.link ? (
              <Button size="lg" fullWidth leftIcon={<ExternalLink size={19} />} onClick={() => void openLink(c.link)}>
                افتح الرابط
              </Button>
            ) : null}
            {c.status === 'active' ? (
              <div className="flex gap-2">
                <Button
                  variant={c.link ? 'secondary' : 'primary'}
                  className="flex-1"
                  leftIcon={<Check size={17} />}
                  onClick={log}
                >
                  {loggedToday ? `${label} مرة أخرى` : label}
                </Button>
                {loggedToday ? (
                  <Button variant="secondary" aria-label="تراجع عن آخر تسجيل" leftIcon={<Undo2 size={17} />} onClick={undo} />
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        {/* Numbers */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: toArabicDigits(done), l: c.format === 'live' ? 'درساً حضرته' : 'درساً أتممته' },
            { v: toArabicDigits(streak), l: 'على التوالي' },
            { v: minutes ? durationAr(minutes) : rate !== null ? `${toArabicDigits(Math.round(rate * 100))}٪` : '—', l: minutes ? 'وقت التعلّم' : 'الحضور' },
          ].map((x) => (
            <Card key={x.l} className="px-2 py-3 text-center">
              <p className="text-lg font-counter font-bold tabular-nums text-teal dark:text-teal-light truncate">{x.v}</p>
              <p className="text-[11px] text-text-muted">{x.l}</p>
            </Card>
          ))}
        </div>

        {/* Timeline */}
        <section className="flex flex-col gap-2.5">
          <SectionTitle
            title="سجل الدروس"
            subtitle={c.log.length ? `${toArabicDigits(c.log.length)} سجل` : undefined}
            action={
              <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={() => setLogOpen({})}>
                سجّل درساً
              </Button>
            }
          />
          {c.log.length === 0 ? (
            <Card className="p-4">
              <p className="text-sm text-text-muted text-center text-pretty">
                سجّل كل درس تحضره أو تشاهده، وأضف فوائده، ليكون لك دفتر علم ترجع إليه.
              </p>
            </Card>
          ) : (
            <Card className="p-3">
              <ol className="relative">
                {c.log.slice(0, 60).map((l, i) => (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}
                    className="relative ps-7 pb-4 last:pb-0"
                  >
                    {i < Math.min(c.log.length, 60) - 1 ? (
                      <span aria-hidden className="absolute start-[9px] top-5 bottom-0 w-px bg-teal/20 dark:bg-white/10" />
                    ) : null}
                    <span
                      aria-hidden
                      className={[
                        'absolute start-0 top-1 w-[19px] h-[19px] rounded-full inline-flex items-center justify-center',
                        l.status === 'missed' ? 'bg-danger/12 text-danger' : 'bg-[image:var(--gradient-teal)] text-on-accent',
                      ].join(' ')}
                    >
                      {l.status === 'missed' ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
                    </span>
                    <button type="button" onClick={() => setLogOpen({ entry: l })} className="w-full text-start rounded-lg hover:bg-teal/5 -mx-1 px-1">
                      <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">
                        {l.n ? `الدرس ${toArabicDigits(l.n)}` : STATUS_LABEL[l.status]}
                        {l.title ? ` · ${l.title}` : ''}
                      </p>
                      <p className="text-[11.5px] text-text-muted">
                        {STATUS_LABEL[l.status]} · {WEEKDAY_AR[new Date(l.date).getDay()]} {toArabicDigits(new Date(l.date).getDate())}/
                        {toArabicDigits(new Date(l.date).getMonth() + 1)} · {clockAr(l.date)}
                        {l.durationMin ? ` · ${durationAr(l.durationMin)}` : ''}
                      </p>
                      {l.notes ? (
                        <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/80 leading-relaxed whitespace-pre-line text-pretty">
                          {l.notes}
                        </p>
                      ) : null}
                    </button>
                  </motion.li>
                ))}
              </ol>
            </Card>
          )}
        </section>

        {/* Schedule + reminders */}
        <section className="flex flex-col gap-2.5">
          <SectionTitle
            title="المواعيد والتنبيهات"
            action={
              <Button size="sm" variant="ghost" onClick={() => setEdit({ step: 2 })}>
                تعديل
              </Button>
            }
          />
          <Card className="p-1.5">
            {c.slots.map((s, i) => (
              <div key={i} className={['flex items-center gap-3 px-3 py-3', i ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''].join(' ')}>
                <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center">
                  <Clock size={17} />
                </span>
                <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">
                  كل {WEEKDAY_AR[s.weekday]} · {clockAr(s.time)}
                </span>
                <span className="text-xs text-text-muted">{durationAr(s.durationMin ?? 60)}</span>
              </div>
            ))}
            {c.sessions
              .filter((s) => s.at > now - 86_400_000)
              .map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-3 border-t border-black/[0.04] dark:border-white/[0.05] first:border-t-0">
                  <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center">
                    <Clock size={17} />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">جلسة: {whenAr(s.at, now)}</span>
                </div>
              ))}
            {c.dailyGoal?.enabled && c.format === 'series' ? (
              <div className="flex items-center gap-3 px-3 py-3 border-t border-black/[0.04] dark:border-white/[0.05] first:border-t-0">
                <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center">
                  <CircleCheck size={17} />
                </span>
                <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">
                  هدف يومي: {c.dailyGoal.lessons === 1 ? 'درس' : `${toArabicDigits(c.dailyGoal.lessons)} دروس`} · {clockAr(c.dailyGoal.time)}
                </span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                updateCircle(c.id, { remindersEnabled: !c.remindersEnabled });
                toast.info(c.remindersEnabled ? 'أُوقفت تنبيهات المواعيد' : 'فُعّلت تنبيهات المواعيد');
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] hover:bg-teal/5 text-start border-t border-black/[0.04] dark:border-white/[0.05] first:border-t-0"
            >
              <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center">
                {c.remindersEnabled ? <Bell size={17} /> : <BellOff size={17} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">
                  {c.remindersEnabled ? 'التنبيهات مفعّلة' : 'التنبيهات متوقفة'}
                </span>
                <span className="block text-[11px] text-text-muted truncate">
                  {c.remindersEnabled
                    ? c.reminderOffsets.map((o) => (o === 0 ? 'عند البدء' : `قبل ${durationAr(o)}`)).join('، ')
                    : 'اضغط لتفعيلها'}
                </span>
              </span>
            </button>
          </Card>
        </section>

        {/* Linked tasks */}
        <section className="flex flex-col gap-2.5">
          <SectionTitle
            title="مهام الحلقة"
            subtitle="واجبات، مراجعة، حفظ متن…"
            action={
              <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={() => setTaskSheet({})}>
                مهمة
              </Button>
            }
          />
          {tasks.length ? (
            <Card className="p-1.5">
              {tasks.map((t, i) => (
                <TaskRow key={t.id} t={t} now={now} first={i === 0} onOpen={() => setTaskSheet({ task: t })} />
              ))}
            </Card>
          ) : null}
        </section>

        {/* Manage */}
        <div className="flex flex-wrap gap-2">
          {c.status === 'active' ? (
            <Button variant="secondary" leftIcon={<Pause size={16} />} onClick={() => setStatus(c.id, 'paused')}>
              إيقاف مؤقت
            </Button>
          ) : (
            <Button variant="secondary" leftIcon={<Play size={16} />} onClick={() => setStatus(c.id, 'active')}>
              استئناف
            </Button>
          )}
          {c.status !== 'done' ? (
            <Button variant="secondary" leftIcon={<CircleCheck size={16} />} onClick={() => { setStatus(c.id, 'done'); toast.success('أتممت الحلقة، بارك الله فيك'); }}>
              أتممتها
            </Button>
          ) : null}
          <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
            حذف
          </Button>
        </div>
      </div>

      <CircleFormSheet open={!!edit} onClose={() => setEdit(null)} editing={c} startStep={edit?.step} />
      <LogSheet c={c} entry={logOpen?.entry} open={!!logOpen} onClose={() => setLogOpen(null)} />
      <TaskEditSheet open={!!taskSheet} task={taskSheet?.task} defaultCircleId={c.id} onClose={() => setTaskSheet(null)} />
      <ConfirmDialog
        open={confirmDelete}
        title="حذف الحلقة؟"
        message="سيُحذف سجل دروسها وتُلغى تنبيهاتها."
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeCircle(c.id);
          setConfirmDelete(false);
          navigate('/study');
        }}
      />
    </div>
  );
}

export default CircleDetailPage;
