import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Clock, ExternalLink, Plus, Radio } from 'lucide-react';
import { motion } from '@/lib/motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/Ornament';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useStudyStore } from '@/store/studyStore';
import {
  FORMAT_LABEL, SUBJECT_LABEL, WEEKDAY_AR, clockAr, completion, dayKey, inAr, lessonsDone, lessonsOnDay, nextSession,
  type StudyCircle,
} from '@/store/studyModel';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { PlatformChip, SUBJECT_ICON, openLink, useNow } from './studyUi';
import { CircleFormSheet } from './CircleFormSheet';

/** "الأحد ٩:٠٠ م · بعد ٣ ساعات" — or "اليوم" / "غداً" for the near ones. */
export function whenAr(at: number, now: number): string {
  const today = dayKey(now);
  const k = dayKey(at);
  const tomorrow = dayKey(new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + 1));
  const day = k === today ? 'اليوم' : k === tomorrow ? 'غداً' : WEEKDAY_AR[new Date(at).getDay()];
  return `${day} ${clockAr(at)}`;
}

/** The one-tap "I did it" for a circle — attendance for live, a lesson for series/channel. */
export function useQuickLog(c: StudyCircle) {
  const markLessonDone = useStudyStore((s) => s.markLessonDone);
  const undoLastLesson = useStudyStore((s) => s.undoLastLesson);
  const loggedToday = lessonsOnDay(c, dayKey(Date.now())) > 0;
  const label = c.format === 'live' ? 'سجّل حضوري' : 'شاهدت الدرس';
  const log = () => {
    markLessonDone(c.id);
    const done = lessonsDone(c) + 1;
    toast.success(
      c.format === 'live' ? 'سُجّل حضورك، بارك الله فيك' : `أحسنت، الدرس ${toArabicDigits(done)}${c.totalLessons ? ` من ${toArabicDigits(c.totalLessons)}` : ''}`,
    );
  };
  return { loggedToday, label, log, undo: () => undoLastLesson(c.id) };
}

export function CircleCard({ c, now }: { c: StudyCircle; now: number }) {
  const navigate = useNavigate();
  const Icon = SUBJECT_ICON[c.subject];
  const next = c.status === 'active' ? nextSession(c, now) : null;
  const pct = completion(c);
  const done = lessonsDone(c);
  const { loggedToday, label, log } = useQuickLog(c);

  return (
    <Card className="p-4" pressable onClick={() => navigate(`/study/circle/${c.id}`)}>
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <Icon size={20} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-text-primary dark:text-text-on-dark leading-snug text-balance">{c.title}</h3>
          <p className="text-xs text-text-muted truncate mt-0.5">
            {[c.teacher, SUBJECT_LABEL[c.subject], FORMAT_LABEL[c.format]].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PlatformChip platform={c.platform} />
            {c.status !== 'active' ? (
              <span className="rounded-full bg-gold/15 text-gold-dark dark:text-gold-light px-2 py-0.5 text-[11px] font-semibold">
                {c.status === 'paused' ? 'متوقفة مؤقتاً' : 'مكتملة'}
              </span>
            ) : null}
          </div>
        </div>
        {pct !== null ? (
          <ProgressRing value={pct * 100} size={52} strokeWidth={5} animate={false} />
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[13px] text-text-secondary dark:text-text-on-dark/80">
        {next?.live ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
            <Radio size={15} className="motion-safe:animate-pulse" />
            يُبث الآن
          </span>
        ) : next ? (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Clock size={14} className="text-teal dark:text-teal-light shrink-0" />
            <span className="truncate">
              {whenAr(next.at, now)} · <span className="text-text-muted">{inAr(next.at - now)}</span>
            </span>
          </span>
        ) : c.totalLessons ? (
          <span>
            الدرس {toArabicDigits(done)} من {toArabicDigits(c.totalLessons)}
          </span>
        ) : (
          <span className="text-text-muted">{done ? `${toArabicDigits(done)} درس مسجّل` : 'لا مواعيد بعد'}</span>
        )}
      </div>

      {c.status === 'active' ? (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant={loggedToday ? 'secondary' : 'soft'}
            className="flex-1"
            leftIcon={<Check size={15} />}
            onClick={log}
          >
            {loggedToday ? (c.format === 'live' ? 'حضرت اليوم' : 'شاهدت درساً آخر') : label}
          </Button>
          {c.link ? (
            <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={15} />} onClick={() => void openLink(c.link)}>
              افتح الرابط
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function CirclesView({ addRequest = 0 }: { addRequest?: number }) {
  const circles = useStudyStore((s) => s.circles);
  const now = useNow();
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (addRequest > 0) setAdding(true);
  }, [addRequest]);
  const [showArchive, setShowArchive] = useState(false);

  const { active, archived } = useMemo(() => {
    const act = circles.filter((c) => c.status === 'active');
    // Soonest session first; unscheduled series keep their saved order after.
    const soon = (c: StudyCircle) => nextSession(c, now)?.at ?? Number.MAX_SAFE_INTEGER;
    return {
      active: [...act].sort((a, b) => soon(a) - soon(b)),
      archived: circles.filter((c) => c.status !== 'active'),
    };
  }, [circles, now]);

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="حلقاتي"
        subtitle={circles.length ? `${toArabicDigits(active.length)} حلقة نشطة` : 'دروسك المباشرة والمسجّلة في مكان واحد'}
        action={
          circles.length ? (
            <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={() => setAdding(true)}>
              حلقة
            </Button>
          ) : null
        }
      />

      {circles.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            title="ابدأ أول حلقة علم"
            description="أضف درساً تتابعه على تيليجرام أو يوتيوب أو زووم، أو درساً في المسجد، وسنذكّرك قبل موعده ونحفظ تقدّمك."
            cta={{ label: 'أضف حلقة', onClick: () => setAdding(true) }}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.04 }}
            >
              <CircleCard c={c} now={now} />
            </motion.div>
          ))}
          {archived.length ? (
            <button
              type="button"
              onClick={() => setShowArchive((v) => !v)}
              aria-expanded={showArchive}
              className="self-start px-2 min-h-11 text-sm font-semibold text-teal dark:text-teal-light"
            >
              {showArchive ? 'إخفاء' : 'عرض'} المتوقفة والمكتملة ({toArabicDigits(archived.length)})
            </button>
          ) : null}
          {showArchive ? archived.map((c) => <CircleCard key={c.id} c={c} now={now} />) : null}
        </div>
      )}

      <CircleFormSheet open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
