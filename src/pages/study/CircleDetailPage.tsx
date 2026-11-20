import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Bell, BellOff, Check, ChevronDown, ChevronUp, CircleCheck, Clock, ExternalLink, MoreHorizontal, Pencil, Plus, Radio, Trash2, Undo2, X } from 'lucide-react';
import { motion } from '@/lib/motion';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle, Medallion } from '@/components/ui/Ornament';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import { useStudyStore } from '@/store/studyStore';
import { useTasksStore } from '@/store/tasksStore';
import {
  FORMAT_LABEL, SUBJECT_LABEL, WEEKDAY_AR, attendanceRate, clockAr, completion, durationAr, hhmm, inAr,
  applyLessonRows, isSingleLesson, lessonList, lessonProgress, lessonsDone, platformPhrase, progressLogs, reachLogs,
  type LessonLog, type LessonRow, type LessonStatus, type StudyCircle,
} from '@/store/studyModel';
import { rescheduleAllStudy } from '@/services/studyReminders';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { Field, Pill, PlatformChip, SUBJECT_ICON, Segmented, fieldClass, openLink, useNow } from '@/components/study/studyUi';
import { CircleFormSheet } from '@/components/study/CircleFormSheet';
import { CircleActionsSheet, doneNumbers, hoursAr, lessonsAr, nextLessonN, upNext, useQuickLog, whenAr } from '@/components/study/CirclesView';
import { TaskRow } from '@/components/study/TasksView';
import { TaskEditSheet } from '@/components/study/TaskEditSheet';
import type { Task } from '@/store/studyModel';

const ar = toArabicDigits;
const STATUS_LABEL: Record<LessonStatus, string> = { attended: 'حضرت', watched: 'شاهدت', missed: 'فاتني' };
/** «سجل واحد» / «سجلّان» / «٣ سجلات» / «١٢ سجلاً». */
const entriesAr = (n: number) => (n === 1 ? 'سجل واحد' : n === 2 ? 'سجلّان' : `${ar(n)} ${n <= 10 ? 'سجلات' : 'سجلاً'}`);
const dateAr = (ms: number) => `${WEEKDAY_AR[new Date(ms).getDay()]} ${ar(new Date(ms).getDate())}/${ar(new Date(ms).getMonth() + 1)}`;

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

function LogSheet({ c, entry, preset, open, onClose }: { c: StudyCircle; entry?: LessonLog; preset?: number; open: boolean; onClose: () => void }) {
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
    // A new entry in a series starts as its next lesson (or the one tapped) — title and length from its link.
    const num = entry?.n ?? (c.format === 'live' ? undefined : (preset ?? nextLessonN(c)));
    const ep = entry || !num ? undefined : c.episodes?.[num - 1];
    setStatus(entry?.status ?? (c.format === 'live' ? 'attended' : 'watched'));
    setTitle(entry?.title ?? ep?.title ?? '');
    setN(num ? String(num) : '');
    setAt(entry?.date ?? Date.now());
    const dm = entry?.durationMin ?? ep?.durationMin;
    setDur(dm ? String(dm) : '');
    setNotes(entry?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, preset]);

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

/**
 * «سجّل تقدّمك» (owner 2026-11-19: record progress quickly — minutes attended;
 * in a series which lesson you reached and how far into the current one):
 * - a live majlis: how many minutes you attended;
 * - a recorded lesson / series: the lesson (by name; a later one marks those
 *   before it as watched before — no points), and where you stopped in it —
 *   quarter chips or a slider of its length, or «أكملته».
 * Progress inside a lesson is kept as partial logs (studyModel.progressLogs).
 */
function ProgressSheet({ c, open, preset, full, onClose }: { c: StudyCircle; open: boolean; preset?: number; full?: boolean; onClose: () => void }) {
  const logMany = useStudyStore((s) => s.logMany);
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const live = c.format === 'live';
  const list = lessonList(c);
  const single = isSingleLesson(c);
  const series = !live && !single && list.length > 1;
  const current = Math.min(Math.max(1, nextLessonN(c)), Math.max(1, list.length));
  const [n, setN] = useState(current);
  const [min, setMin] = useState(0);
  const [finished, setFinished] = useState(false);
  const [attended, setAttended] = useState(60);
  const len = list[n - 1]?.durationMin ?? (list.length <= 1 ? c.durationMin : undefined);
  const reached = lessonProgress(c, n);

  useEffect(() => {
    if (!open) return;
    const start = preset ?? current;
    setN(start);
    const ep = list[start - 1];
    const l = ep?.durationMin ?? (list.length <= 1 ? c.durationMin : undefined);
    const r = lessonProgress(c, start).minutes;
    setMin(full && l ? l : r);
    setFinished(!!full && !l);
    setAttended(c.durationMin ?? c.slots[0]?.durationMin ?? 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  const pick = (k: number) => {
    setN(k);
    setMin(lessonProgress(c, k).minutes);
    setFinished(false);
  };

  const save = () => {
    const at = Date.now();
    if (live) {
      logMany(c.id, [{ status: 'attended', date: at, durationMin: attended }]);
      toast.success(`تقبّل الله، حضرت ${durationAr(attended)}`);
      return onClose();
    }
    const done = finished || (!!len && min >= len);
    if (done && !len && min <= 0) {
      toast.info('اكتب كم دقيقة شاهدت منه');
      return;
    }
    const logs = [
      ...(series && n > current ? reachLogs(c, n, at) : []),
      ...progressLogs(c, n, done ? Math.max(min, len ?? min, 1) : min, at, done ? (len ?? Math.max(min, 1)) : len),
    ];
    if (!logs.length) {
      toast.info('لا جديد لتسجيله');
      return onClose();
    }
    logMany(c.id, logs);
    // A lesson finished without a known length: what was watched becomes its length.
    if (done && !len && min > 0 && list.length > 1) {
      updateCircle(c.id, { episodes: list.map((e, i) => (i === n - 1 ? { ...e, durationMin: min } : e)), totalLessons: list.length });
    }
    toast.success(done ? 'تقبّل الله، أتممت الدرس' : `حُفظ موضعك: الدقيقة ${ar(min)}`);
    onClose();
  };

  const nameOf = (k: number) => list[k - 1]?.title || (single ? c.title : `الدرس ${ar(k)}`);
  const quarters = len ? [0.25, 0.5, 0.75].map((f) => Math.round(len * f)) : [];
  return (
    <BottomSheet open={open} onClose={onClose} title={live ? 'سجّل حضورك' : 'سجّل تقدّمك'}>
      <div className="flex flex-col gap-5">
        {live ? (
          <Field label="كم حضرت؟">
            <div className="flex flex-wrap gap-2">
              {[...new Set([15, 30, 45, 60, 90, 120, attended])].sort((a, b) => a - b).map((m) => (
                <Pill key={m} active={attended === m} onClick={() => setAttended(m)}>
                  {durationAr(m)}
                </Pill>
              ))}
            </div>
          </Field>
        ) : (
          <>
            {series ? (
              <Field label="وصلت إلى" hint={n > current ? `ما قبله من الدروس يُسجَّل أنك شاهدته من قبل، بلا نقاط` : undefined}>
                <select value={n} onChange={(e) => pick(Number(e.target.value))} className={fieldClass} aria-label="الدرس الذي وصلت إليه">
                  {list.map((e, i) => {
                    const k = i + 1;
                    return (
                      <option key={k} value={k}>
                        {`${k}. ${e.title || `الدرس ${k}`}${lessonProgress(c, k).done ? ' ✓' : ''}`}
                      </option>
                    );
                  })}
                </select>
              </Field>
            ) : null}
            <div className="rounded-[var(--radius-inner)] bg-cream-dark/40 dark:bg-white/[0.04] p-3.5 flex flex-col gap-3">
              <p dir="auto" className="text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark line-clamp-2 text-start">{nameOf(n)}</p>
              {reached.done ? (
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
                  <Check size={14} strokeWidth={3} aria-hidden /> أتممته من قبل
                </p>
              ) : len ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-text-muted">وصلت إلى</span>
                    <span className="font-counter tabular-nums text-[15px] font-bold text-teal dark:text-teal-light">
                      {min >= len ? 'أكملته' : `الدقيقة ${ar(min)} من ${ar(len)}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={len}
                    step={1}
                    value={Math.min(min, len)}
                    onChange={(e) => setMin(Number(e.target.value))}
                    aria-label="الدقيقة التي وصلت إليها"
                    className="w-full accent-[var(--color-teal)]"
                  />
                  <div className="flex flex-wrap gap-2">
                    {quarters.map((q, i) => (
                      <Pill key={q} active={min === q} onClick={() => setMin(q)}>
                        {['ربعه', 'نصفه', 'ثلاثة أرباعه'][i]}
                      </Pill>
                    ))}
                    <Pill active={min >= len} onClick={() => setMin(len)}>
                      أكملته
                    </Pill>
                  </div>
                  {reached.minutes ? <p className="text-[11px] text-text-muted">سجّلت فيه من قبل {durationAr(reached.minutes)}</p> : null}
                </>
              ) : (
                <div className="flex items-end gap-2">
                  <Field label={finished ? 'كم دقيقة كان؟' : 'شاهدت منه (دقيقة)'}>
                    <input type="number" min={0} inputMode="numeric" value={min || ''} onChange={(e) => setMin(Math.max(0, Math.round(Number(e.target.value)) || 0))} className={fieldClass} />
                  </Field>
                  <Pill active={finished} onClick={() => setFinished((v) => !v)} className="min-h-11">
                    أكملته
                  </Pill>
                </div>
              )}
            </div>
          </>
        )}
        <Button fullWidth onClick={save} disabled={!live && reached.done}>
          حفظ
        </Button>
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
        <EmptyState title="لم نجد هذه الحلقة" description="ربما حُذفت." cta={{ label: 'إلى حلقاتي', onClick: () => navigate('/targets?tab=circles') }} />
      </div>
    );
  }
  return <Detail c={c} />;
}

type DetailTab = 'lessons' | 'notes' | 'schedule' | 'tasks';

function Detail({ c }: { c: StudyCircle }) {
  const navigate = useNavigate();
  const allTasks = useTasksStore((s) => s.tasks);
  const tasks = useMemo(() => allTasks.filter((t) => t.circleId === c.id), [allTasks, c.id]);
  const now = useNow();
  const [edit, setEdit] = useState<{ step: number } | null>(null);
  const [logOpen, setLogOpen] = useState<{ entry?: LessonLog; preset?: number } | null>(null);
  const [taskSheet, setTaskSheet] = useState<{ task?: Task } | null>(null);
  const [manage, setManage] = useState(false);
  // A single recorded lesson has no lesson table — its progress lives in the hero.
  const hasSeries = (c.format === 'series' && !isSingleLesson(c)) || (c.episodes?.length ?? 0) > 1;
  const [progress, setProgress] = useState<{ n?: number; full?: boolean } | null>(null);
  const [tab, setTab] = useState<DetailTab>(hasSeries ? 'lessons' : 'notes');

  const tabs: { value: DetailTab; label: string }[] = [
    ...(hasSeries ? [{ value: 'lessons' as const, label: 'الدروس' }] : []),
    { value: 'notes', label: c.format === 'live' ? 'السجل' : 'الفوائد' },
    { value: 'schedule', label: 'المواعيد' },
    { value: 'tasks', label: tasks.length ? `المهام ${ar(tasks.length)}` : 'المهام' },
  ];

  return (
    <div className="min-h-dvh pb-10">
      <TopAppBar
        title={c.title}
        subtitle={[c.teacher, SUBJECT_LABEL[c.subject]].filter(Boolean).join(' · ')}
        showBack
        actions={
          <>
            <Button variant="icon" aria-label="تعديل الحلقة" onClick={() => setEdit({ step: 1 })}>
              <Pencil size={18} />
            </Button>
            <Button variant="icon" aria-label="إدارة الحلقة" onClick={() => setManage(true)}>
              <MoreHorizontal size={20} />
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5 px-4 pt-4">
        <Hero c={c} now={now} onLog={() => setLogOpen({})} onProgress={() => setProgress({})} />

        <Segmented value={tab} onChange={setTab} options={tabs} />

        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {tab === 'lessons' ? (
            <SeriesTable c={c} onEditLog={(entry) => setLogOpen({ entry })} onProgress={(n) => setProgress({ n, full: true })} />
          ) : tab === 'notes' ? (
            <Notebook c={c} onOpen={(entry) => setLogOpen({ entry })} onAdd={() => setLogOpen({})} />
          ) : tab === 'schedule' ? (
            <Schedule c={c} now={now} onEdit={(step) => setEdit({ step })} />
          ) : (
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
              ) : (
                <Card className="p-4">
                  <p className="text-sm text-text-muted text-center text-pretty">أضف واجبات الحلقة ومراجعتها، فتظهر في «مهامي» بتذكيراتها.</p>
                </Card>
              )}
            </section>
          )}
        </motion.div>
      </div>

      <CircleFormSheet open={!!edit} onClose={() => setEdit(null)} editing={c} startStep={edit?.step} />
      <LogSheet c={c} entry={logOpen?.entry} preset={logOpen?.preset} open={!!logOpen} onClose={() => setLogOpen(null)} />
      <ProgressSheet c={c} open={!!progress} preset={progress?.n} full={progress?.full} onClose={() => setProgress(null)} />
      <TaskEditSheet open={!!taskSheet} task={taskSheet?.task} defaultCircleId={c.id} onClose={() => setTaskSheet(null)} />
      <CircleActionsSheet
        c={c}
        open={manage}
        onClose={() => setManage(false)}
        onEdit={(step) => setEdit({ step })}
        onDeleted={() => navigate('/targets?tab=circles', { replace: true })}
      />
    </div>
  );
}

/** What's next and its two actions; the circle's numbers underneath. */
function Hero({ c, now, onLog, onProgress }: { c: StudyCircle; now: number; onLog: () => void; onProgress: () => void }) {
  const Icon = SUBJECT_ICON[c.subject];
  const up = upNext(c, now);
  // One recorded lesson is a lesson, not a series of one (owner 2026-11-19).
  const single = isSingleLesson(c);
  const pct = completion(c);
  const done = lessonsDone(c);
  const rate = c.format === 'live' ? attendanceRate(c, now) : null;
  const prog = up?.kind === 'lesson' ? lessonProgress(c, up.n) : null;
  const len = up?.kind === 'lesson' ? (up.durationMin ?? (single ? c.durationMin : undefined)) : undefined;
  const ring = single
    ? c.status === 'done' || done
      ? 100
      : len && prog
        ? Math.min(100, (prog.minutes / len) * 100)
        : 0
    : pct !== null
      ? pct * 100
      : rate !== null
        ? rate * 100
        : null;
  const minutes = c.log.reduce((s, l) => s + (l.status !== 'missed' && !l.backfill ? (l.durationMin ?? (c.format === 'series' && !single ? 0 : (c.durationMin ?? 0))) : 0), 0);
  const { loggedToday, undo } = useQuickLog(c);
  const openUrl = up?.kind === 'lesson' ? up.url : c.link;

  return (
    <Card variant="gradient-edge" className="p-5">
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <PlatformChip platform={c.platform} />
            <span className="rounded-full bg-teal/10 text-teal dark:text-teal-light px-2 py-0.5 text-[11px] font-semibold leading-5">{single ? 'درس مسجّل' : FORMAT_LABEL[c.format]}</span>
            {c.status !== 'active' ? (
              <span className="rounded-full bg-gold/15 text-gold-dark dark:text-gold-light px-2 py-0.5 text-[11px] font-semibold leading-5">
                {c.status === 'paused' ? 'متوقفة' : 'مكتملة'}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-[11.5px] font-semibold text-teal dark:text-teal-light flex items-center gap-1.5">
            {c.status === 'paused' ? (
              'متوقفة مؤقتاً، بلا تنبيهات'
            ) : c.status === 'done' ? (
              single ? 'أتممته، بارك الله لك فيما تعلّمت' : 'أتممتها، بارك الله لك فيما تعلّمت'
            ) : up?.kind === 'session' && up.live ? (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <Radio size={13} className="motion-safe:animate-pulse" aria-hidden /> يُبث الآن {platformPhrase(c.platform)}
              </span>
            ) : up?.kind === 'session' ? (
              <>
                <Clock size={13} aria-hidden /> {whenAr(up.at, now)} · {inAr(up.at - now)}
              </>
            ) : up?.kind === 'lesson' && single ? (
              prog?.minutes ? `وصلت إلى الدقيقة ${ar(prog.minutes)}${len ? ` من ${ar(len)}` : ''}` : 'لم تبدأه بعد'
            ) : up?.kind === 'lesson' ? (
              `التالي: الدرس ${ar(up.n)}${c.totalLessons ? ` من ${ar(c.totalLessons)}` : ''}${prog?.minutes ? `، وصلت فيه إلى الدقيقة ${ar(prog.minutes)}` : ''}`
            ) : c.format === 'channel' ? (
              'تابع جديدها وسجّل ما تشاهده'
            ) : (
              'لا مواعيد مجدولة'
            )}
          </p>
          {up?.kind === 'lesson' && up.title && !single ? (
            <p dir="auto" className="mt-1 text-[15px] font-bold leading-snug text-text-primary dark:text-text-on-dark text-start text-pretty">
              {up.title}
            </p>
          ) : null}
          {len ? <p className="text-[12px] text-text-muted mt-0.5">{durationAr(len)}</p> : null}
          {len && prog?.minutes && !prog.done ? (
            <div className="mt-2 h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
              <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${Math.min(100, (prog.minutes / len) * 100)}%` }} />
            </div>
          ) : null}
        </div>
        {ring !== null ? (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <ProgressRing value={ring} size={80} strokeWidth={7} />
            <span className="text-[10.5px] text-text-muted">{single ? 'من الدرس' : pct !== null ? 'من السلسلة' : 'الحضور'}</span>
          </div>
        ) : (
          <Medallion size={64} tone="gold">
            <Icon size={22} className="text-gold-dark dark:text-gold-light" aria-hidden />
          </Medallion>
        )}
      </div>

      {c.status === 'active' ? (
        <div className="relative mt-4 flex flex-col gap-2">
          {openUrl ? (
            <Button size="lg" fullWidth leftIcon={<ExternalLink size={19} />} onClick={() => void openLink(openUrl)}>
              {single ? 'افتح الدرس' : up?.kind === 'lesson' && up.url !== c.link ? `افتح الدرس ${ar(up.n)}` : 'افتح الرابط'}
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button variant={openUrl ? 'secondary' : 'primary'} className="flex-1" leftIcon={<Check size={17} />} onClick={onProgress}>
              {c.format === 'live' ? 'سجّل حضورك' : 'سجّل تقدّمك'}
            </Button>
            {loggedToday ? <Button variant="secondary" aria-label="تراجع عن آخر تسجيل" leftIcon={<Undo2 size={17} />} onClick={undo} /> : null}
            <Button variant="secondary" aria-label="تسجيل بالتفصيل" leftIcon={<Plus size={17} />} onClick={onLog} />
          </div>
        </div>
      ) : null}

      <dl className="relative mt-4 grid grid-cols-3 divide-x divide-black/[0.06] dark:divide-white/[0.08] rounded-[var(--radius-inner)] bg-white/60 dark:bg-white/[0.04] py-2.5">
        {[
          { v: ar(done), l: c.format === 'live' ? 'حضرت' : 'أتممت' },
          { v: ar(runStreak(c)), l: 'على التوالي' },
          { v: minutes ? hoursAr(minutes) : rate !== null ? `${ar(Math.round(rate * 100))}٪` : '—', l: minutes ? 'وقت التعلّم' : 'الحضور' },
        ].map((x) => (
          <div key={x.l} className="px-1 text-center min-w-0">
            <dd className="text-[16px] font-counter font-bold tabular-nums text-teal dark:text-teal-light truncate">{x.v}</dd>
            <dt className="text-[10.5px] text-text-muted">{x.l}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** «٤٣ د» — a lesson's length in the table's narrow column. */
const minAr = (m: number) => `${ar(m)} د`;

/**
 * «جدول المتابعة» (owner 2026-11-19: a series is its lessons BY NAME, not numbers;
 * add / remove / rename them): one row per lesson — number, name, length, and
 * where you are with it. The state cell logs it (or opens its log); the name
 * opens the lesson. «تعديل القائمة» edits a draft of the rows (name, length,
 * order, remove, add) saved in one go by applyLessonRows, which keeps every
 * watched mark on its lesson.
 */
function SeriesTable({ c, onEditLog, onProgress }: { c: StudyCircle; onEditLog: (l: LessonLog) => void; onProgress: (n: number) => void }) {
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const [all, setAll] = useState(false);
  const [rows, setRows] = useState<(LessonRow & { key: string })[] | null>(null);
  const [focusKey, setFocusKey] = useState('');
  const list = lessonList(c);
  const total = list.length;
  const done = doneNumbers(c);
  const legacy = !done.size ? lessonsDone(c) : 0; // logged before lessons were numbered
  const isDone = (n: number) => done.has(n) || n <= legacy;
  const next = c.status === 'done' ? 0 : nextLessonN(c);
  const logOf = (n: number) => c.log.find((l) => l.n === n && l.status !== 'missed');
  const nameOf = (i: number) => list[i]?.title || `الدرس ${ar(i + 1)}`;
  const doneCount = list.reduce((s, _, i) => s + (isDone(i + 1) ? 1 : 0), 0);
  const remaining = list.filter((_, i) => !isDone(i + 1));
  const left = remaining.every((e) => e.durationMin) ? remaining.reduce((s, e) => s + (e.durationMin ?? 0), 0) : 0;

  // A lesson not done yet: the progress sheet, set to «أكملته» — or where you stopped in it.
  const tapState = (n: number) => {
    const l = logOf(n);
    if (l) return onEditLog(l);
    onProgress(n);
  };
  const startEdit = (addOne = false) => {
    const base: (LessonRow & { key: string })[] = list.map((e, i) => ({ ...e, orig: i + 1, key: `o${i}` }));
    if (addOne) {
      const key = `n${Date.now()}`;
      base.push({ title: '', orig: null, key });
      setFocusKey(key);
    }
    setRows(base);
  };
  const editRow = (key: string, patch: Partial<LessonRow>) => setRows((r) => r!.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, to: number) =>
    setRows((r) => {
      const x = [...r!];
      [x[i], x[to]] = [x[to], x[i]];
      return x;
    });
  const add = () => {
    const key = `n${Date.now()}`;
    setRows((r) => [...r!, { title: '', orig: null, key }]);
    setFocusKey(key);
  };
  const save = () => {
    updateCircle(c.id, applyLessonRows(c, rows!));
    setRows(null);
    toast.success('حُفظت قائمة الدروس');
  };

  const header = (
    <div className="flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark">جدول المتابعة</p>
        <p className="text-[11.5px] text-text-muted">
          {total
            ? `أتممت ${ar(doneCount)} من ${lessonsAr(total)}${total - doneCount > 0 ? `، بقي ${lessonsAr(total - doneCount)}${left ? ` (نحو ${hoursAr(left)})` : ''}` : '، أتممت السلسلة'}`
            : 'أضف دروس السلسلة بأسمائها لتتابعها درساً درساً'}
        </p>
      </div>
      {rows ? null : (
        <Button size="sm" variant="soft" leftIcon={<Pencil size={14} />} onClick={() => startEdit(!total)}>
          {total ? 'تعديل القائمة' : 'أضف الدروس'}
        </Button>
      )}
    </div>
  );
  const bar = total ? (
    <div className="h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden mx-1" aria-hidden>
      <div className="h-full rounded-full bg-[image:var(--gradient-teal)]" style={{ width: `${(doneCount / total) * 100}%` }} />
    </div>
  ) : null;

  // ── editing the list ──
  if (rows) {
    return (
      <section className="flex flex-col gap-3">
        {header}
        <Card className="p-1.5">
          <ol className="flex flex-col">
            {rows.map((r, i) => (
              <li key={r.key} className={['flex items-center gap-1.5 px-1.5 py-2', i ? 'border-t border-black/[0.05] dark:border-white/[0.06]' : ''].join(' ')}>
                <span className="flex flex-col shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`انقل الدرس ${ar(i + 1)} للأعلى`} className="w-9 h-6 inline-flex items-center justify-center rounded-lg text-text-muted hover:bg-teal/10 disabled:opacity-25">
                    <ChevronUp size={16} aria-hidden />
                  </button>
                  <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} aria-label={`انقل الدرس ${ar(i + 1)} للأسفل`} className="w-9 h-6 inline-flex items-center justify-center rounded-lg text-text-muted hover:bg-teal/10 disabled:opacity-25">
                    <ChevronDown size={16} aria-hidden />
                  </button>
                </span>
                <span className="w-6 shrink-0 text-center font-counter tabular-nums text-[12px] text-text-muted">{ar(i + 1)}</span>
                <TextInput
                  value={r.title}
                  onValueChange={(v) => editRow(r.key, { title: v })}
                  placeholder={`الدرس ${ar(i + 1)}`}
                  dir="auto"
                  autoFocus={r.key === focusKey}
                  className={`${fieldClass} !py-2 text-[13.5px]`}
                  aria-label={`اسم الدرس ${ar(i + 1)}`}
                />
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={r.durationMin ?? ''}
                  onChange={(e) => editRow(r.key, { durationMin: Math.round(Number(e.target.value)) || undefined })}
                  placeholder="د"
                  aria-label={`مدة الدرس ${ar(i + 1)} بالدقائق`}
                  className={`${fieldClass} !w-16 !px-2 !py-2 text-center text-[13px] shrink-0`}
                />
                <Button variant="icon" aria-label={`احذف الدرس ${ar(i + 1)}`} onClick={() => setRows((x) => x!.filter((y) => y.key !== r.key))}>
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
          </ol>
          <Button variant="ghost" fullWidth leftIcon={<Plus size={16} />} onClick={add} className="mt-1">
            أضف درساً
          </Button>
        </Card>
        <p className="text-[11px] text-text-muted text-pretty px-1">الأسهم لترتيب الدروس، والمدة بالدقائق. حذفُ درسٍ شاهدته لا يمحو سجلّه ولا نقاطه.</p>
        <div className="flex gap-2">
          <Button fullWidth onClick={save}>
            حفظ القائمة
          </Button>
          <Button variant="secondary" onClick={() => setRows(null)}>
            إلغاء
          </Button>
        </div>
      </section>
    );
  }

  // ── following it ──
  if (!total) {
    return (
      <section className="flex flex-col gap-3">
        {header}
        <Card className="p-5 text-center flex flex-col items-center gap-2.5">
          <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">لا دروس في القائمة بعد. أضفها بأسمائها، أو الصق رابط السلسلة من «تعديل الحلقة» فنقرأها لك.</p>
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => startEdit(true)}>
            أضف أول درس
          </Button>
        </Card>
      </section>
    );
  }
  const windowed = total > 30 && !all;
  const from = windowed ? Math.max(1, (next || total) - 3) : 1;
  const to = windowed ? Math.min(total, from + 14) : total;
  return (
    <section className="flex flex-col gap-3">
      {header}
      {bar}
      <Card className="p-0 overflow-hidden">
        <div role="table" aria-label="جدول متابعة السلسلة">
          <div role="row" className="grid grid-cols-[2rem_1fr_auto_5.75rem] items-center gap-2 px-3 py-2 bg-cream-dark/55 dark:bg-white/[0.04] text-[11px] font-semibold text-text-muted">
            <span role="columnheader" className="text-center">#</span>
            <span role="columnheader">الدرس</span>
            <span role="columnheader">المدة</span>
            <span role="columnheader" className="text-center">الحالة</span>
          </div>
          {list.slice(from - 1, to).map((e, k) => {
            const n = from + k;
            const l = logOf(n);
            const ok = isDone(n);
            const isNext = n === next;
            const url = e.url ?? (list.length === 1 ? c.link : undefined);
            return (
              <div
                key={n}
                role="row"
                className={[
                  'grid grid-cols-[2rem_1fr_auto_5.75rem] items-center gap-2 px-3 py-2.5 border-t border-black/[0.04] dark:border-white/[0.05]',
                  isNext ? 'bg-teal/[0.07]' : '',
                ].join(' ')}
              >
                <span role="cell" className={['text-center font-counter tabular-nums text-[12.5px]', isNext ? 'font-bold text-teal dark:text-teal-light' : 'text-text-muted'].join(' ')}>
                  {ar(n)}
                </span>
                <span role="cell" className="min-w-0">
                  {url ? (
                    <button type="button" onClick={() => void openLink(url)} className="w-full text-start inline-flex items-start gap-1.5 min-h-9" aria-label={`افتح ${nameOf(n - 1)}`}>
                      <span dir="auto" className={['flex-1 min-w-0 text-[13.5px] leading-snug line-clamp-2 text-start', ok ? 'text-text-muted' : 'font-semibold text-text-primary dark:text-text-on-dark'].join(' ')}>
                        {nameOf(n - 1)}
                      </span>
                      <ExternalLink size={13} className="shrink-0 mt-1 text-text-muted" aria-hidden />
                    </button>
                  ) : (
                    <span dir="auto" className={['block text-[13.5px] leading-snug line-clamp-2 text-start', ok ? 'text-text-muted' : 'font-semibold text-text-primary dark:text-text-on-dark', e.title ? '' : 'italic'].join(' ')}>
                      {nameOf(n - 1)}
                    </span>
                  )}
                </span>
                <span role="cell" className="text-[11.5px] text-text-muted font-counter tabular-nums whitespace-nowrap">
                  {e.durationMin ? minAr(e.durationMin) : '—'}
                </span>
                <span role="cell" className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => (ok && !l ? undefined : tapState(n))}
                    aria-label={l ? `${nameOf(n - 1)}: ${STATUS_LABEL[l.status]} ${dateAr(l.date)} — تعديل` : ok ? `${nameOf(n - 1)}: أتممته` : `سجّل ${nameOf(n - 1)}`}
                    className={[
                      'min-h-9 w-full rounded-xl px-1.5 text-[11.5px] font-semibold inline-flex items-center justify-center gap-1 transition-colors',
                      ok
                        ? 'bg-teal/10 text-teal dark:text-teal-light'
                        : isNext
                          ? 'ring-1 ring-teal text-teal dark:text-teal-light hover:bg-teal/10'
                          : 'text-text-muted ring-1 ring-black/[0.08] dark:ring-white/[0.1] hover:bg-teal/5',
                    ].join(' ')}
                  >
                    {ok ? (
                      <>
                        <Check size={13} strokeWidth={3} aria-hidden />
                        {l ? dateAr(l.date).split(' ').pop() : 'تمّ'}
                      </>
                    ) : lessonProgress(c, n).minutes ? (
                      <span className="font-counter tabular-nums">{minAr(lessonProgress(c, n).minutes)}</span>
                    ) : isNext ? (
                      'التالي'
                    ) : (
                      'سجّل'
                    )}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      {total > 30 ? (
        <Button variant="ghost" size="sm" className="self-center" onClick={() => setAll((v) => !v)}>
          {all ? 'عرض ما حول التالي فقط' : `عرض كل الدروس (${ar(total)})`}
        </Button>
      ) : null}
    </section>
  );
}

/** «الفوائد» / «السجل»: every lesson attended, watched or missed, with what you took from it. */
function Notebook({ c, onOpen, onAdd }: { c: StudyCircle; onOpen: (l: LessonLog) => void; onAdd: () => void }) {
  const withNotes = c.log.filter((l) => l.notes).length;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title={c.format === 'live' ? 'سجل الحضور' : 'دفتر الفوائد'}
        subtitle={c.log.length ? `${entriesAr(c.log.length)}${withNotes ? ` · ${ar(withNotes)} بفوائد` : ''}` : undefined}
        action={
          <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={onAdd}>
            سجّل درساً
          </Button>
        }
      />
      {c.log.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-text-muted text-center text-pretty">سجّل كل درس تحضره أو تشاهده، وأضف فوائده، ليكون لك دفتر علم ترجع إليه.</p>
        </Card>
      ) : (
        <Card className="p-3">
          <ol className="relative">
            {c.log.slice(0, 80).map((l, i, arr) => (
              <li key={l.id} className="relative ps-7 pb-4 last:pb-0">
                {i < arr.length - 1 ? <span aria-hidden className="absolute start-[9px] top-5 bottom-0 w-px bg-teal/20 dark:bg-white/10" /> : null}
                <span
                  aria-hidden
                  className={[
                    'absolute start-0 top-1 w-[19px] h-[19px] rounded-full inline-flex items-center justify-center',
                    l.status === 'missed'
                      ? 'bg-danger/12 text-danger'
                      : l.partial
                        ? 'bg-gold/20 text-gold-dark dark:text-gold-light'
                        : l.backfill
                          ? 'bg-teal/15 text-teal dark:text-teal-light'
                          : 'bg-[image:var(--gradient-teal)] text-on-accent',
                  ].join(' ')}
                >
                  {l.status === 'missed' ? <X size={11} strokeWidth={3} /> : l.partial ? <Clock size={11} strokeWidth={2.6} /> : <Check size={11} strokeWidth={3} />}
                </span>
                <button type="button" onClick={() => onOpen(l)} className="w-full min-h-11 text-start rounded-lg hover:bg-teal/5 -mx-1 px-1">
                  <p dir="auto" className="text-sm font-semibold text-text-primary dark:text-text-on-dark text-start">
                    {l.n ? `الدرس ${ar(l.n)}${l.title ? `: ${l.title}` : ''}` : (l.title ?? `درس ${dateAr(l.date)}`)}
                  </p>
                  <p className="text-[11.5px] text-text-muted">
                    {l.partial ? 'تابعت جزءاً منه' : l.backfill ? 'شاهدته من قبل' : STATUS_LABEL[l.status]}
                    {l.n || l.title ? `، ${dateAr(l.date)}` : ''}، {clockAr(l.date)}
                    {l.durationMin && !l.backfill ? `، ${durationAr(l.durationMin)}` : ''}
                  </p>
                  {l.notes ? (
                    <p className="mt-1.5 rounded-lg bg-gold/[0.08] ring-1 ring-gold/20 px-2.5 py-2 text-[13px] text-text-secondary dark:text-text-on-dark/85 leading-relaxed whitespace-pre-line text-pretty">
                      {l.notes}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}

/** «المواعيد»: weekly slots, one-off sessions, the daily goal and the reminders — each editable. */
function Schedule({ c, now, onEdit }: { c: StudyCircle; now: number; onEdit: (step: number) => void }) {
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const upcoming = c.sessions.filter((s) => s.at > now - 86_400_000);
  const goal = c.dailyGoal?.enabled && c.format === 'series' ? c.dailyGoal : null;
  const empty = !c.slots.length && !upcoming.length && !goal;
  const row = 'flex items-center gap-3 px-3 py-3';
  const sep = 'border-t border-black/[0.04] dark:border-white/[0.05]';
  const chip = (gold = false) =>
    ['w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0', gold ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light'].join(' ');
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="المواعيد والتنبيهات"
        action={
          <Button size="sm" variant="soft" leftIcon={<Pencil size={14} />} onClick={() => onEdit(2)}>
            تعديل
          </Button>
        }
      />
      <Card className="p-1.5">
        {empty ? (
          <button type="button" onClick={() => onEdit(2)} className={`${row} w-full text-start rounded-[var(--radius-inner)] hover:bg-teal/5`}>
            <span className={chip()}>
              <Plus size={17} aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">أضف موعداً</span>
              <span className="block text-[11px] text-text-muted">
                {c.format === 'series' ? 'أو هدفاً يومياً يذكّرك بدرس السلسلة' : 'يوم الدرس ووقته، ليصلك التذكير كل أسبوع'}
              </span>
            </span>
          </button>
        ) : null}
        {c.slots.map((s, i) => (
          <div key={i} className={[row, i ? sep : ''].join(' ')}>
            <span className={chip()}>
              <Clock size={17} aria-hidden />
            </span>
            <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">
              كل {WEEKDAY_AR[s.weekday]} · {clockAr(s.time)}
            </span>
            <span className="text-xs text-text-muted">{durationAr(s.durationMin ?? 60)}</span>
          </div>
        ))}
        {upcoming.map((s, i) => (
          <div key={s.id} className={[row, c.slots.length || i ? sep : ''].join(' ')}>
            <span className={chip(true)}>
              <Clock size={17} aria-hidden />
            </span>
            <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">جلسة: {whenAr(s.at, now)}</span>
          </div>
        ))}
        {goal ? (
          <div className={[row, c.slots.length || upcoming.length ? sep : ''].join(' ')}>
            <span className={chip(true)}>
              <CircleCheck size={17} aria-hidden />
            </span>
            <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">
              هدف يومي: {goal.lessons === 1 ? 'درس' : `${ar(goal.lessons)} دروس`} · {clockAr(goal.time)}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            updateCircle(c.id, { remindersEnabled: !c.remindersEnabled });
            void rescheduleAllStudy();
            toast.info(c.remindersEnabled ? 'أُوقفت تنبيهات المواعيد' : 'فُعّلت تنبيهات المواعيد');
          }}
          aria-pressed={c.remindersEnabled}
          className={`w-full ${row} rounded-[var(--radius-inner)] hover:bg-teal/5 text-start ${sep}`}
        >
          <span className={chip()}>{c.remindersEnabled ? <Bell size={17} aria-hidden /> : <BellOff size={17} aria-hidden />}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{c.remindersEnabled ? 'التنبيهات مفعّلة' : 'التنبيهات متوقفة'}</span>
            <span className="block text-[11px] text-text-muted truncate">
              {c.remindersEnabled ? c.reminderOffsets.map((o) => (o === 0 ? 'عند البدء' : `قبل ${durationAr(o)}`)).join('، ') : 'اضغط لتفعيلها'}
            </span>
          </span>
        </button>
      </Card>
    </section>
  );
}

export default CircleDetailPage;
