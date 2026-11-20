import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardPaste, Info, Link2, ListVideo, Loader2, PlayCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { TextInput } from '@/components/ui/TextInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { SoundSelector } from '@/components/settings/SoundPicker';
import { useStudyStore } from '@/store/studyStore';
import {
  FORMAT_LABEL, LESSON_MINUTES, PLATFORMS, PLATFORM_LABEL, SUBJECTS, SUBJECT_LABEL, WEEKDAY_AR, detectPlatform, durationAr, hhmm,
  type CircleFormat, type OneOffSession, type Platform, type StudyCircle, type StudySubject, type WeeklySlot,
} from '@/store/studyModel';
import type { SoundKey } from '@/services/notifications/sounds';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { canInspectLinks, inspectLink, totalMinutes, typicalMinutes, type LinkInfo } from '@/services/lessonLink';
import { Field, Pill, PlatformGlyph, fieldClass } from './studyUi';

const OFFSETS = [0, 10, 15, 30, 60, 1440];

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hhmm(d)}`;
};

interface Draft {
  platform: Platform;
  link: string;
  title: string;
  teacher: string;
  subject: StudySubject;
  format: CircleFormat;
  durationMin: number;
  totalLessons: string;
  slots: WeeklySlot[];
  sessions: OneOffSession[];
  remindersEnabled: boolean;
  reminderOffsets: number[];
  goalEnabled: boolean;
  goalTime: string;
  goalLessons: string;
  soundKey: SoundKey;
  fullScreen: boolean;
  episodes?: StudyCircle['episodes'];
}

const blank = (): Draft => ({
  platform: 'telegram',
  link: '',
  title: '',
  teacher: '',
  subject: 'fiqh',
  format: 'live',
  durationMin: 60,
  totalLessons: '',
  slots: [],
  sessions: [],
  remindersEnabled: true,
  reminderOffsets: [10],
  goalEnabled: true,
  goalTime: '20:00',
  goalLessons: '1',
  soundKey: 'target',
  fullScreen: false,
});

const fromCircle = (c: StudyCircle): Draft => ({
  platform: c.platform,
  link: c.link ?? '',
  title: c.title,
  teacher: c.teacher ?? '',
  subject: c.subject,
  format: c.format,
  durationMin: c.durationMin ?? c.slots[0]?.durationMin ?? (c.format === 'live' ? 60 : 30),
  totalLessons: c.totalLessons ? String(c.totalLessons) : '',
  slots: c.slots,
  sessions: c.sessions,
  remindersEnabled: c.remindersEnabled,
  reminderOffsets: c.reminderOffsets,
  goalEnabled: c.dailyGoal?.enabled ?? false,
  goalTime: c.dailyGoal?.time ?? '20:00',
  goalLessons: String(c.dailyGoal?.lessons ?? 1),
  soundKey: c.soundKey ?? 'target',
  fullScreen: !!c.fullScreen,
  episodes: c.episodes,
});

/** «درس واحد» / «درسان» / «٣ دروس» / «٢٤ درساً». */
const lessonsAr = (n: number) => (n === 1 ? 'درس واحد' : n === 2 ? 'درسان' : `${toArabicDigits(n)} ${n <= 10 ? 'دروس' : 'درساً'}`);
/** A series' total, in whole hours past the first. */
const totalAr = (min: number) => (min >= 60 ? durationAr(Math.round(min / 60) * 60) : durationAr(min));

/**
 * What a read link means for the form — title, teacher, series size, lesson length,
 * episodes. Title and teacher are replaced only when empty or still what the last
 * read (`auto`) put there: never over what the user typed.
 */
function fromLink(info: LinkInfo, d: Draft, auto: { title: string; teacher: string }): Partial<Draft> {
  const eps = (info.episodes ?? []).filter((e) => e.title);
  const recorded = info.kind === 'playlist' || info.kind === 'video';
  const typed = (v: string, was: string) => !!v.trim() && v !== was;
  return {
    title: typed(d.title, auto.title) ? d.title : (info.title ?? d.title),
    teacher: typed(d.teacher, auto.teacher) ? d.teacher : recorded ? (info.author ?? '') : d.teacher,
    format: recorded ? 'series' : d.format,
    totalLessons: info.kind === 'playlist' && eps.length ? String(eps.length) : info.kind === 'video' ? '1' : d.totalLessons,
    durationMin: (info.kind === 'playlist' ? typicalMinutes(eps) : info.durationMin) ?? d.durationMin,
    episodes: info.kind === 'playlist' && eps.length ? eps : d.episodes,
  };
}

type ReadState = { status: 'idle' } | { status: 'reading' } | { status: 'done'; info: LinkInfo } | { status: 'failed' };

/** What the read link is — and that the form below was filled from it. */
function ReadResult({ info, onReread }: { info: LinkInfo; onReread: () => void }) {
  const eps = info.episodes ?? [];
  const total = totalMinutes(eps);
  const Icon = info.kind === 'playlist' ? ListVideo : info.kind === 'video' ? PlayCircle : Link2;
  const summary =
    info.kind === 'playlist'
      ? `سلسلة من ${lessonsAr(eps.length)}${total ? `، نحو ${totalAr(total)}` : ''}`
      : info.kind === 'video'
        ? `درس واحد${info.durationMin ? `، ${durationAr(info.durationMin)}` : ''}`
        : info.durationMin
          ? durationAr(info.durationMin)
          : 'وجدنا الصفحة';
  return (
    <div className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-teal/25 p-3 flex flex-col gap-2.5" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-teal dark:text-teal-light">{summary}</p>
          <p className="text-sm font-bold text-text-primary dark:text-text-on-dark leading-snug text-pretty line-clamp-2">{info.title}</p>
          {info.author && info.kind !== 'page' ? <p className="text-xs text-text-muted truncate">{info.author}</p> : null}
        </div>
        <Button variant="icon" aria-label="اقرأ الرابط من جديد" title="اقرأ الرابط من جديد" onClick={onReread}>
          <RefreshCw size={16} />
        </Button>
      </div>
      {eps.length ? (
        <ol className="flex flex-col gap-1 border-t border-black/[0.05] dark:border-white/[0.06] pt-2">
          {eps.slice(0, 3).map((e, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <span className="text-text-muted font-counter tabular-nums w-4 shrink-0">{toArabicDigits(i + 1)}</span>
              <span dir="auto" className="flex-1 min-w-0 truncate text-start text-text-secondary dark:text-text-on-dark/80">
                {e.title}
              </span>
              {e.durationMin ? <span className="shrink-0 text-text-muted">{durationAr(e.durationMin)}</span> : null}
            </li>
          ))}
          {eps.length > 3 ? <li className="text-xs text-text-muted ps-6">و{lessonsAr(eps.length - 3)} غيرها</li> : null}
        </ol>
      ) : null}
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-success">
        <Check size={14} className="shrink-0" aria-hidden />
        عبّأنا بيانات الحلقة أدناه، فراجعها وعدّل ما شئت
      </p>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3 id={id} className="scroll-mt-4 flex items-center gap-2 text-[13px] font-bold text-teal dark:text-teal-light">
      {children}
      <span aria-hidden className="h-px flex-1 bg-teal/15 dark:bg-teal-light/15" />
    </h3>
  );
}

/**
 * Add or edit a circle on ONE page (owner 2026-11-19: the old four-step wizard
 * only filled the form when its preview card was confirmed, and a link typed in
 * the details step was never read). The link comes first: paste it (or type it
 * and pause) → the platform is set and, where this shell can read other sites
 * (lessonLink.canInspectLinks), its title, teacher, series size, lesson length
 * and episodes go straight into the fields below. A read never overwrites what
 * the user typed, only what the previous read filled. `initialLink` (pasted on
 * the circles page) starts it reading; `startStep` 2/3 scrolls an edit to
 * «المواعيد» / «التنبيهات».
 */
export function CircleFormSheet({
  open,
  onClose,
  editing,
  startStep,
  initialLink,
}: {
  open: boolean;
  onClose: () => void;
  editing?: StudyCircle;
  startStep?: number;
  initialLink?: string;
}) {
  const addCircle = useStudyStore((s) => s.addCircle);
  const updateCircle = useStudyStore((s) => s.updateCircle);
  const [d, setD] = useState<Draft>(blank);
  const [read, setRead] = useState<ReadState>({ status: 'idle' });
  const readSeq = useRef(0);
  /** The link text last read (or the saved one when editing): it isn't read again until it changes. */
  const readFor = useRef('');
  /** What the last read filled in — the next read may replace it, never what the user typed. */
  const auto = useRef({ title: '', teacher: '' });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const canRead = canInspectLinks();

  /** Read `link` and fill the form from it; a newer read (or closing) drops this one. */
  const readLink = (link: string, key = link) => {
    readFor.current = key;
    if (!canRead) return;
    const seq = ++readSeq.current;
    setRead({ status: 'reading' });
    void inspectLink(link).then((info) => {
      if (seq !== readSeq.current) return;
      if (!info?.title) {
        setRead({ status: 'failed' });
        return;
      }
      setRead({ status: 'done', info });
      setD((x) => {
        const next = { ...x, ...fromLink(info, x, auto.current) };
        auto.current = { title: next.title, teacher: next.teacher };
        return next;
      });
    });
  };

  /** Pasted text: the link in it (a shared invite's other words become the title), read at once. */
  const takeText = (text: string) => {
    const hit = detectPlatform(text);
    if (!hit) {
      set({ link: text });
      return;
    }
    const rest = text.replace(hit.link.replace(/^https:\/\//, ''), '').replace(/https?:\/\//, '').replace(/\s+/g, ' ').trim();
    setD((x) => ({
      ...x,
      link: hit.link,
      platform: hit.platform,
      format: hit.platform === 'youtube' ? 'series' : x.format,
      title: x.title || rest.slice(0, 80),
    }));
    readLink(hit.link);
  };

  useEffect(() => {
    if (!open) return;
    const start = editing ? fromCircle(editing) : blank();
    setD(start);
    setRead({ status: 'idle' });
    readSeq.current++;
    readFor.current = start.link.trim();
    auto.current = { title: '', teacher: '' };
    if (editing) {
      // Bring the requested section into view once the sheet has opened.
      const sec = startStep && startStep > 1 ? startStep : 0;
      if (sec) setTimeout(() => document.getElementById(`circle-sec-${sec}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 380);
    } else if (initialLink?.trim()) takeText(initialLink.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  // Typed (not pasted) links: read once the typing pauses on a recognisable link.
  useEffect(() => {
    if (!open) return;
    const text = d.link.trim();
    const hit = text && text !== readFor.current ? detectPlatform(text) : null;
    if (!hit) return;
    const t = setTimeout(() => readLink(hit.link, text), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.link, open]);

  const typeLink = (value: string) => {
    const hit = detectPlatform(value);
    setD((x) => ({ ...x, link: value, ...(hit ? { platform: hit.platform, format: hit.platform === 'youtube' ? 'series' : x.format } : {}) }));
    if (!value.trim()) setRead({ status: 'idle' });
  };

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) takeText(text);
    } catch {
      toast.info('الصق الرابط في الحقل');
    }
  };

  const save = () => {
    if (!d.title.trim()) {
      document.getElementById('circle-title')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast.error('اكتب اسم الحلقة');
      return;
    }
    const total = Math.round(Number(d.totalLessons));
    const input = {
      title: d.title.trim(),
      teacher: d.teacher.trim() || undefined,
      platform: d.platform,
      link: d.link.trim() || undefined,
      subject: d.subject,
      format: d.format,
      durationMin: d.durationMin,
      slots: d.slots,
      sessions: d.sessions,
      remindersEnabled: d.remindersEnabled,
      reminderOffsets: d.reminderOffsets.length ? d.reminderOffsets : [0],
      totalLessons: d.format === 'series' && total > 0 ? total : undefined,
      dailyGoal:
        d.format === 'series'
          ? { enabled: d.goalEnabled, time: d.goalTime || '20:00', lessons: Math.max(1, Math.round(Number(d.goalLessons) || 1)) }
          : undefined,
      soundKey: d.soundKey,
      fullScreen: d.fullScreen,
      episodes: d.format === 'series' && d.episodes?.length ? d.episodes : undefined,
    };
    if (editing) {
      updateCircle(editing.id, input);
      toast.success('حُفظت التعديلات');
    } else {
      addCircle(input);
      toast.success('أُضيفت الحلقة، نفع الله بها');
    }
    onClose();
  };

  const detected = d.link.trim() ? detectPlatform(d.link.trim()) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'تعديل الحلقة' : 'حلقة علم جديدة'}>
      <div className="flex flex-col gap-6">
        {/* ── 1 · the link: the quickest way in ── */}
        <section className="flex flex-col gap-3">
          <SectionHeading id="circle-sec-0">الرابط</SectionHeading>
          <div className="rounded-[var(--radius-inner)] bg-teal/5 dark:bg-teal/10 ring-1 ring-teal/15 p-3 flex flex-col gap-2.5">
            <p className="text-xs text-text-secondary dark:text-text-on-dark/75 text-pretty">
              {canRead
                ? 'الصق رابط الدرس أو السلسلة، فنملأ عنك الاسم والشيخ وعدد الدروس ومدّتها.'
                : 'الصق الرابط فنتعرّف على المنصة: تيليجرام، يوتيوب، زووم، جوجل ميت…'}
            </p>
            <div className="flex gap-2">
              <TextInput
                value={d.link}
                onValueChange={typeLink}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text').trim();
                  if (!text) return;
                  e.preventDefault();
                  takeText(text);
                }}
                placeholder="https://youtube.com/playlist?list=…"
                dir="ltr"
                inputMode="url"
                className={fieldClass}
                aria-label="رابط الحلقة"
              />
              <Button variant="soft" size="md" aria-label="لصق من الحافظة" title="لصق من الحافظة" onClick={() => void pasteFromClipboard()} leftIcon={<ClipboardPaste size={17} />} />
            </div>
            {detected ? (
              <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-secondary dark:text-text-on-dark/80">
                <PlatformGlyph platform={detected.platform} size={13} />
                {PLATFORM_LABEL[detected.platform]}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted">حلقة حضورية؟ اتركه فارغاً واختر «حضوري» أدناه.</p>
            )}
          </div>
          {read.status === 'reading' ? (
            <div className="rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-teal/20 p-3 flex items-center gap-3" role="status">
              <Loader2 size={20} className="text-teal dark:text-teal-light animate-spin motion-reduce:animate-none shrink-0" aria-hidden />
              <span className="flex-1 text-sm text-text-secondary dark:text-text-on-dark/80">نقرأ الرابط…</span>
            </div>
          ) : read.status === 'done' ? (
            <ReadResult info={read.info} onReread={() => readLink(d.link.trim())} />
          ) : read.status === 'failed' ? (
            <p className="flex items-start gap-2 text-xs text-text-muted text-pretty" role="status">
              <Info size={14} className="shrink-0 mt-0.5" aria-hidden />
              لم نستطع قراءة تفاصيل الرابط، فأكمل البيانات بنفسك.
            </p>
          ) : editing && canRead && d.link.trim() ? (
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => readLink(d.link.trim())}>
              اقرأ الرابط وحدّث الدروس
            </Button>
          ) : null}
        </section>

        {/* ── 2 · the circle ── */}
        <section className="flex flex-col gap-4">
          <SectionHeading id="circle-sec-1">بيانات الحلقة</SectionHeading>
          <Field label="اسم الحلقة أو الدرس">
            <TextInput id="circle-title" value={d.title} onValueChange={(v) => set({ title: v })} placeholder="شرح الأربعين النووية" className={fieldClass} />
          </Field>
          <Field label="الشيخ / المعلّم (اختياري)">
            <TextInput value={d.teacher} onValueChange={(v) => set({ teacher: v })} placeholder="الشيخ …" className={fieldClass} />
          </Field>
          <Field label="المنصّة">
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <Pill key={p} active={d.platform === p} onClick={() => set({ platform: p })} className="inline-flex items-center gap-1.5">
                  <PlatformGlyph platform={p} size={14} />
                  {PLATFORM_LABEL[p]}
                </Pill>
              ))}
            </div>
          </Field>
          <Field label="نوع الحلقة">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FORMAT_LABEL) as CircleFormat[]).map((f) => (
                <Pill key={f} active={d.format === f} onClick={() => set({ format: f })}>
                  {FORMAT_LABEL[f]}
                </Pill>
              ))}
            </div>
          </Field>
          {d.format === 'series' ? (
            <Field
              label="عدد دروس السلسلة"
              hint={d.episodes?.length ? `قرأنا من الرابط ${lessonsAr(d.episodes.length)} بعناوينها ومدّتها` : 'اتركه فارغاً إن لم تعرفه بعد'}
            >
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={d.totalLessons}
                onChange={(e) => set({ totalLessons: e.target.value })}
                className={fieldClass}
                placeholder="٤٠"
              />
            </Field>
          ) : null}
          {d.format === 'series' && (d.episodes?.length ?? Number(d.totalLessons)) !== 1 ? (
            <p className="text-[11.5px] text-text-muted text-pretty">
              لكل درس في السلسلة مدّته الخاصة، تُقرأ من الرابط أو تكتبها في «جدول المتابعة»، وبها تُحسب نقاطه.
            </p>
          ) : (
          <Field label={d.format === 'live' ? 'مدة المجلس' : 'مدة الدرس'} hint="نقاط الدرس في الترتيب بحسب مدته">
            <div className="flex flex-wrap gap-2">
              {/* A length read from the link (e.g. ٢٠ دقيقة) shows as its own pill. */}
              {(LESSON_MINUTES.includes(d.durationMin) ? LESSON_MINUTES : [...LESSON_MINUTES, d.durationMin].sort((a, b) => a - b)).map((m) => (
                <Pill key={m} active={d.durationMin === m} onClick={() => set({ durationMin: m })}>
                  {durationAr(m)}
                </Pill>
              ))}
            </div>
          </Field>
          )}
          <Field label="المادّة">
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <Pill key={s} active={d.subject === s} onClick={() => set({ subject: s })}>
                  {SUBJECT_LABEL[s]}
                </Pill>
              ))}
            </div>
          </Field>
        </section>

        {/* ── 3 · when ── */}
        <section className="flex flex-col gap-4">
          <SectionHeading id="circle-sec-2">المواعيد</SectionHeading>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">مواعيد أسبوعية</p>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<Plus size={15} />}
                onClick={() => set({ slots: [...d.slots, { weekday: new Date().getDay(), time: '20:00', durationMin: d.durationMin }] })}
              >
                موعد
              </Button>
            </div>
            {d.slots.length === 0 ? (
              <p className="text-xs text-text-muted">
                {d.format === 'series' ? 'سلسلة مسجّلة؟ لا تحتاج مواعيد — اضبط هدفاً يومياً في الأسفل.' : 'أضف يوم الدرس ووقته ليصلك التذكير كل أسبوع.'}
              </p>
            ) : null}
            {d.slots.map((s, i) => (
              <div key={i} className="rounded-[var(--radius-inner)] bg-cream-dark/40 dark:bg-white/[0.04] p-3 flex flex-col gap-2.5">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                  {WEEKDAY_AR.map((w, wd) => (
                    <Pill
                      key={w}
                      active={s.weekday === wd}
                      className="px-2.5"
                      onClick={() => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, weekday: wd } : x)) })}
                    >
                      {w}
                    </Pill>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <Field label="الوقت">
                    <input
                      type="time"
                      value={s.time}
                      onChange={(e) => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, time: e.target.value || x.time } : x)) })}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="المدة (دقيقة)">
                    <NumberInput
                      min={5}
                      max={600}
                      value={s.durationMin ?? 60}
                      onValueChange={(n) => set({ slots: d.slots.map((x, j) => (j === i ? { ...x, durationMin: n } : x)) })}
                      className={fieldClass}
                    />
                  </Field>
                  <Button variant="icon" aria-label="حذف الموعد" onClick={() => set({ slots: d.slots.filter((_, j) => j !== i) })}>
                    <Trash2 size={17} />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">جلسات لمرة واحدة</p>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<Plus size={15} />}
                onClick={() => {
                  const at = new Date();
                  at.setDate(at.getDate() + 1);
                  at.setHours(20, 0, 0, 0);
                  set({ sessions: [...d.sessions, { id: at.getTime().toString(36), at: at.getTime(), durationMin: d.durationMin }] });
                }}
              >
                جلسة
              </Button>
            </div>
            {d.sessions.map((s) => (
              <div key={s.id} className="flex items-end gap-2">
                <Field label="الموعد">
                  <input
                    type="datetime-local"
                    value={toLocalInput(s.at)}
                    onChange={(e) => {
                      const at = new Date(e.target.value).getTime();
                      if (Number.isFinite(at)) set({ sessions: d.sessions.map((x) => (x.id === s.id ? { ...x, at } : x)) });
                    }}
                    className={fieldClass}
                  />
                </Field>
                <Button variant="icon" aria-label="حذف الجلسة" onClick={() => set({ sessions: d.sessions.filter((x) => x.id !== s.id) })}>
                  <Trash2 size={17} />
                </Button>
              </div>
            ))}

            {d.format === 'series' ? (
              <div className="rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/25 p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">هدف يومي</span>
                    <span className="block text-xs text-text-muted">تذكير يومي حتى تنهي دروس اليوم</span>
                  </span>
                  <Toggle checked={d.goalEnabled} onChange={(v) => set({ goalEnabled: v })} label="هدف يومي" hideLabel />
                </div>
                {d.goalEnabled ? (
                  <div className="flex gap-2">
                    <Field label="وقت التذكير">
                      <input type="time" value={d.goalTime} onChange={(e) => set({ goalTime: e.target.value })} className={fieldClass} />
                    </Field>
                    <Field label="دروس في اليوم">
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={d.goalLessons}
                        onChange={(e) => set({ goalLessons: e.target.value })}
                        className={fieldClass}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
        </section>

        {/* ── 4 · reminders ── */}
        <section className="flex flex-col gap-4">
          <SectionHeading id="circle-sec-3">التنبيهات</SectionHeading>
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تنبيهات المواعيد</span>
                <span className="block text-xs text-text-muted">قبل كل موعد أسبوعي أو جلسة</span>
              </span>
              <Toggle checked={d.remindersEnabled} onChange={(v) => set({ remindersEnabled: v })} label="تنبيهات المواعيد" hideLabel />
            </div>
            {d.remindersEnabled ? (
              <Field label="متى أذكّرك؟" hint="اختر أكثر من وقت إن شئت">
                <div className="flex flex-wrap gap-2">
                  {OFFSETS.map((o) => {
                    const on = d.reminderOffsets.includes(o);
                    return (
                      <Pill
                        key={o}
                        active={on}
                        onClick={() =>
                          set({ reminderOffsets: on ? d.reminderOffsets.filter((x) => x !== o) : [...d.reminderOffsets, o].sort((a, b) => a - b) })
                        }
                      >
                        {o === 0 ? 'عند البدء' : `قبل ${durationAr(o)}`}
                      </Pill>
                    );
                  })}
                </div>
              </Field>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary dark:text-text-on-dark">نغمة التنبيه</span>
              <SoundSelector value={d.soundKey} onChange={(k) => set({ soundKey: k })} ariaLabel="نغمة الحلقة" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تنبيه بملء الشاشة</span>
                <span className="block text-xs text-text-muted">مثل المكالمة، لدروس لا تريد أن تفوتك</span>
              </span>
              <Toggle checked={d.fullScreen} onChange={(v) => set({ fullScreen: v })} label="تنبيه بملء الشاشة" hideLabel />
            </div>
            {d.slots.length + d.sessions.length === 0 && !(d.format === 'series' && d.goalEnabled) ? (
              <p className="text-xs text-warning">لا توجد مواعيد بعد، فلن يصلك تنبيه. أضفها من «المواعيد» أعلاه.</p>
            ) : (
              <p className="text-xs text-text-muted">
                {toArabicDigits(d.slots.length)} موعد أسبوعي · {toArabicDigits(d.sessions.length)} جلسة
              </p>
            )}
        </section>

        <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 bg-white dark:bg-dark-surface">
          <Button fullWidth onClick={save}>
            {editing ? 'حفظ التعديلات' : 'أضف الحلقة'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
