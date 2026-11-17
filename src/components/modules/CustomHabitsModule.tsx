import { useState } from 'react';
import { format } from 'date-fns';
import { motion } from '@/lib/motion';
import { Plus, Pencil, Trash2, Check, Bell, Clock, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextInput } from '@/components/ui/TextInput';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { SoundSelector } from '@/components/settings/SoundPicker';
import { useSettingsStore } from '@/store/settingsStore';
import { useProgressStore } from '@/store/progressStore';
import { useI18n } from '@/hooks/useI18n';
import { hapticsService } from '@/services/HapticsService';
import { pickCustomSound } from '@/services/customSound';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { SoundKey } from '@/services/notifications/sounds';
import type { CustomHabit } from '@/types';

const EMOJI_OPTIONS = ['⭐', '📖', '🕌', '💪', '🌙', '🤲', '❤️', '🌿', '📿', '🔔'];

interface HabitForm {
  name: string;
  icon: string;
  reminderEnabled: boolean;
  times: string[]; // "HH:mm", sorted + unique
  soundKey: SoundKey;
  customChannelId?: string;
  customSoundLabel?: string;
  newTime: string; // buffer for the add-time picker
}

const EMPTY_FORM: HabitForm = {
  name: '',
  icon: '⭐',
  reminderEnabled: false,
  times: [],
  soundKey: 'habits',
  customChannelId: undefined,
  customSoundLabel: undefined,
  newTime: '08:00',
};

/** Insert a time, keeping the list sorted and free of duplicates. */
function withTime(times: string[], time: string): string[] {
  if (!time || times.includes(time)) return times;
  return [...times, time].sort();
}

const FIELD =
  'w-full min-h-12 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-4 text-base text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';

/**
 * Custom habits: today's check-list plus create/edit with per-habit reminder
 * times and ringtone. Each habit's done state is stored in progressStore under
 * the habit's own id (what Home's «ملخص اليوم» and the habits stats read), and
 * the aggregate 'habits' module rate follows it.
 */
export function CustomHabitsModule() {
  const { t } = useI18n();
  const { customHabits, addCustomHabit, updateCustomHabit, removeCustomHabit } = useSettingsStore();
  const markModuleComplete = useProgressStore((s) => s.markModuleComplete);
  const unmarkModuleComplete = useProgressStore((s) => s.unmarkModuleComplete);
  const setModuleRate = useProgressStore((s) => s.setModuleRate);
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayModules = useProgressStore((s) => s.dailyProgress[todayKey]?.modules);
  const isDone = (id: string) => !!todayModules?.find((m) => m.moduleId === id)?.completed;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CustomHabit | null>(null);
  const [form, setForm] = useState<HabitForm>(EMPTY_FORM);
  const [blessing, setBlessing] = useState(false);
  const [toDelete, setToDelete] = useState<CustomHabit | null>(null);

  const total = customHabits.length;
  const doneCount = customHabits.filter((h) => isDone(h.id)).length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const toggleHabit = (habit: CustomHabit) => {
    const wasDone = isDone(habit.id);
    void hapticsService.impact(wasDone ? 'light' : 'medium');
    if (wasDone) unmarkModuleComplete(habit.id);
    else markModuleComplete(habit.id, 1);
    const doneNow = doneCount + (wasDone ? -1 : 1);
    setModuleRate('habits', total > 0 ? doneNow / total : 0);
    if (!wasDone && doneNow === total && total > 0) {
      markModuleComplete('habits', 1);
      setBlessing(true);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
  };

  const openEdit = (h: CustomHabit) => {
    setEditing(h);
    setForm({
      name: h.nameAr,
      icon: h.icon ?? '⭐',
      reminderEnabled: h.reminder?.enabled ?? false,
      times: h.reminder?.times ?? [],
      soundKey: h.reminder?.soundKey ?? 'habits',
      customChannelId: h.reminder?.customChannelId,
      customSoundLabel: h.reminder?.customSoundLabel,
      newTime: '08:00',
    });
    setSheetOpen(true);
  };

  const addTime = () => setForm((f) => ({ ...f, times: withTime(f.times, f.newTime), reminderEnabled: true }));
  const removeTime = (time: string) => setForm((f) => ({ ...f, times: f.times.filter((x) => x !== time) }));

  const pickHabitSound = async () => {
    const res = await pickCustomSound(`habit_${editing?.id ?? 'new'}`, `تنبيه ${form.name.trim() || 'عادة'}`);
    if (res) {
      setForm((f) => ({ ...f, customChannelId: res.channelId, customSoundLabel: res.label }));
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    // A reminder with no times is meaningless — treat it as off.
    const enabled = form.reminderEnabled && form.times.length > 0;
    const reminder = {
      enabled,
      times: form.times,
      soundKey: form.customChannelId ? undefined : form.soundKey,
      customChannelId: form.customChannelId,
      customSoundLabel: form.customSoundLabel,
    };
    if (editing) {
      updateCustomHabit(editing.id, { nameAr: form.name.trim(), icon: form.icon, reminder });
    } else {
      const newHabit: CustomHabit = {
        id: `habit_${Date.now()}`,
        nameAr: form.name.trim(),
        nameEn: form.name.trim(),
        icon: form.icon,
        frequency: 'daily',
        createdAt: new Date().toISOString(),
        reminder,
      };
      addCustomHabit(newHabit);
    }
    setSheetOpen(false);
  };

  const confirmDelete = () => {
    if (toDelete) {
      removeCustomHabit(toDelete.id);
      const left = customHabits.filter((h) => h.id !== toDelete.id);
      const doneLeft = left.filter((h) => isDone(h.id)).length;
      setModuleRate('habits', left.length > 0 ? doneLeft / left.length : 0);
    }
    setToDelete(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ─────────────────────────────────────── */}
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="flex items-center gap-4">
          <Medallion size={64} tone="gold">
            <span className="flex flex-col items-center text-gold-dark dark:text-gold-light">
              <span className="text-xl tabular-nums">{toArabicDigits(doneCount)}</span>
              <span className="text-[9.5px] font-semibold mt-0.5">من {toArabicDigits(total)}</span>
            </span>
          </Medallion>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-bold text-text-primary dark:text-text-on-dark">
              {total === 0
                ? 'ابدأ أول عادة'
                : doneCount === total
                  ? 'أتممت عادات اليوم'
                  : `بقي ${toArabicDigits(total - doneCount)} من عادات اليوم`}
            </p>
            <p className="text-xs text-text-muted mt-0.5">القليل الدائم خير من الكثير المنقطع</p>
          </div>
        </div>
        {total > 0 ? (
          <div className="mt-4 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full bg-[image:var(--gradient-teal)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <Button variant="primary" fullWidth className="mt-4" leftIcon={<Plus size={16} />} onClick={openNew} haptic="medium">
          {t('add_habit')}
        </Button>
      </Card>

      {/* ── Today's list ─────────────────────────────── */}
      {total === 0 ? (
        <EmptyState
          title={t('no_habits_yet')}
          description="أضف عادة صغيرة تداوم عليها، كقراءة صفحة أو صدقة يومية، وفعّل لها تذكيراً."
          cta={{ label: t('add_habit'), onClick: openNew }}
        />
      ) : (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="عادات اليوم" subtitle="اضغط العادة لتسجيلها، ومرة أخرى للإلغاء" />
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {customHabits.map((habit) => {
              const done = isDone(habit.id);
              const times = habit.reminder?.enabled ? habit.reminder.times : [];
              return (
                <div key={habit.id} className="flex items-center gap-3 px-2 py-2.5">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleHabit(habit)}
                    aria-pressed={done}
                    aria-label={`${habit.nameAr}: ${done ? 'تمت، اضغط للإلغاء' : 'اضغط للإتمام'}`}
                    className={[
                      'w-11 h-11 rounded-full inline-flex items-center justify-center text-lg shrink-0 transition-colors duration-200',
                      done
                        ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-sm)]'
                        : 'bg-cream-dark/60 dark:bg-dark-surface ring-2 ring-black/[0.06] dark:ring-white/[0.08]',
                    ].join(' ')}
                  >
                    {done ? <Check size={20} strokeWidth={3} /> : <span aria-hidden>{habit.icon ?? '⭐'}</span>}
                  </motion.button>

                  <button type="button" onClick={() => toggleHabit(habit)} className="flex-1 min-w-0 text-start" tabIndex={-1}>
                    <p
                      className={[
                        'text-[15px] font-semibold truncate transition-colors',
                        done ? 'text-teal dark:text-teal-light' : 'text-text-primary dark:text-text-on-dark',
                      ].join(' ')}
                    >
                      {habit.nameAr}
                    </p>
                    {times.length > 0 ? (
                      <p className="text-[11px] text-text-muted inline-flex items-center gap-1 font-counter tabular-nums mt-0.5">
                        <Bell size={11} className="text-gold-dark dark:text-gold-light" />
                        {times.map((x) => toArabicDigits(x)).join('، ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-text-muted mt-0.5">{done ? 'تمت اليوم' : 'يومياً'}</p>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEdit(habit)}
                    aria-label={`تعديل ${habit.nameAr}`}
                    className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-teal/10 hover:text-teal"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setToDelete(habit)}
                    aria-label={`حذف ${habit.nameAr}`}
                    className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {/* ── Create / edit sheet ──────────────────────── */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? t('edit_habit') : t('new_habit')}>
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">{t('habit_name')}</span>
            <TextInput
              value={form.name}
              onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder={t('habit_name_placeholder')}
              className={FIELD}
            />
          </label>

          <div>
            <p className="text-sm font-bold text-text-primary dark:text-text-on-dark mb-2">{t('habit_icon')}</p>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={t('habit_icon')}>
              {EMOJI_OPTIONS.map((emoji) => {
                const on = form.icon === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                    className={[
                      'h-12 rounded-[var(--radius-inner)] text-xl inline-flex items-center justify-center transition-colors',
                      on ? 'bg-teal/12 ring-2 ring-teal' : 'bg-cream-dark/55 dark:bg-dark-surface hover:bg-teal/10',
                    ].join(' ')}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reminder: per-habit daily notification times + ringtone */}
          <div className="rounded-[var(--radius-card)] bg-cream-dark/40 dark:bg-dark-surface/70 ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-3.5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                className={[
                  'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors',
                  form.reminderEnabled ? 'bg-teal/12 text-teal dark:text-teal-light' : 'bg-cream-dark dark:bg-dark-card text-text-muted',
                ].join(' ')}
              >
                <Bell size={16} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">تذكيرات العادة</span>
                <span className="block text-[11px] text-text-muted">نبّهني يومياً في أوقات محدّدة</span>
              </span>
              <Toggle
                checked={form.reminderEnabled}
                onChange={(v) => setForm((f) => ({ ...f, reminderEnabled: v }))}
                size="sm"
                label="تذكيرات العادة"
                hideLabel
              />
            </div>

            {form.reminderEnabled && (
              <div className="flex flex-col gap-3 pt-1">
                {form.times.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {form.times.map((time) => (
                      <span
                        key={time}
                        className="inline-flex items-center gap-1 ps-3 pe-1 h-9 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light text-sm font-counter tabular-nums"
                      >
                        {toArabicDigits(time)}
                        <button
                          type="button"
                          onClick={() => removeTime(time)}
                          aria-label={`حذف وقت ${toArabicDigits(time)}`}
                          className="w-7 h-7 rounded-lg inline-flex items-center justify-center hover:bg-teal/15"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-muted inline-flex items-center gap-1">
                    <Clock size={12} /> أضف وقتاً واحداً على الأقل
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={form.newTime}
                    aria-label="وقت التذكير"
                    onChange={(e) => setForm((f) => ({ ...f, newTime: e.target.value }))}
                    dir="ltr"
                    className="flex-1 h-10 rounded-xl bg-white dark:bg-dark-card ring-1 ring-black/[0.06] dark:ring-white/[0.08] px-3 text-sm font-counter text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal/40"
                  />
                  <Button variant="soft" size="sm" className="min-h-10" leftIcon={<Plus size={14} />} onClick={addTime}>
                    إضافة وقت
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-text-secondary dark:text-text-on-dark/80">النغمة</span>
                  <SoundSelector
                    value={form.soundKey}
                    customLabel={form.customSoundLabel}
                    ariaLabel="نغمة العادة"
                    onChange={(soundKey) =>
                      setForm((f) => ({ ...f, soundKey, customChannelId: undefined, customSoundLabel: undefined }))
                    }
                    onPickCustom={pickHabitSound}
                  />
                </div>
              </div>
            )}
          </div>

          <Button variant="primary" fullWidth onClick={handleSave} disabled={!form.name.trim()}>
            {t('save')}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="حذف العادة"
        message={toDelete ? `ستُحذف «${toDelete.nameAr}» وتذكيراتها. يبقى سجلّ أيامك السابقة كما هو.` : undefined}
        confirmLabel="حذف"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <CompletionBlessing open={blessing} message="ما شاء الله" onDone={() => setBlessing(false)} />
    </div>
  );
}
