import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from '@/lib/motion';
import {
  HandHeart,
  Plus,
  Search,
  Pencil,
  Trash2,
  Sparkles,
  Heart,
  ShieldAlert,
  Sprout,
  Flame,
  Tag as TagIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextInput, TextArea } from '@/components/ui/TextInput';
import { Toggle } from '@/components/ui/Toggle';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, SectionTitle, ArchMotif } from '@/components/ui/Ornament';
import { useI18n } from '@/hooks/useI18n';
import { storageService } from '@/services/StorageService';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { DuaaEntry } from '@/types';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

const STORAGE_KEY = 'duaa:entries';

/** Format an ISO date safely — returns '' for missing/corrupt values instead
 *  of letting date-fns throw and crash the whole entry list. */
function safeFormat(iso: string | undefined | null, fmt: string, opts?: Parameters<typeof format>[2]): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, fmt, opts);
}

function loadEntries(): DuaaEntry[] {
  return storageService.get<DuaaEntry[]>(STORAGE_KEY) ?? [];
}

function saveEntries(entries: DuaaEntry[]) {
  storageService.set(STORAGE_KEY, entries);
}

// ─── Mood tags (نبرة الدعاء) ──────────────────────────────────────────────────
type MoodId = 'shakir' | 'kha2if' | 'raj' | 'mulihh';

const MOODS: { id: MoodId; label: string; icon: typeof Heart }[] = [
  { id: 'shakir', label: 'شاكر', icon: Heart },
  { id: 'kha2if', label: 'خائف', icon: ShieldAlert },
  { id: 'raj', label: 'راجٍ', icon: Sprout },
  { id: 'mulihh', label: 'مُلِحّ', icon: Flame },
];

const MOOD_BY_ID: Record<string, { label: string; icon: typeof Heart }> = MOODS.reduce(
  (acc, m) => ({ ...acc, [m.id]: { label: m.label, icon: m.icon } }),
  {} as Record<string, { label: string; icon: typeof Heart }>,
);

// ─── Categories (تصنيف الدعاء) ────────────────────────────────────────────────
const CATEGORIES: { id: string; label: string }[] = [
  { id: 'general', label: 'عام' },
  { id: 'family', label: 'الأهل' },
  { id: 'rizq', label: 'الرزق' },
  { id: 'shifa', label: 'الشفاء' },
  { id: 'hidaya', label: 'الهداية' },
  { id: 'akhira', label: 'الآخرة' },
];

const CATEGORY_LABEL: Record<string, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.id]: c.label }),
  {} as Record<string, string>,
);

type FilterView = 'all' | 'answered';

interface DuaaForm {
  title: string;
  body: string;
  answered: boolean;
  category: string;
  tags: string[];
}

export function DuaaJournalModule() {
  const { t } = useI18n();
  const locale = arSA;
  const [entries, setEntries] = useState<DuaaEntry[]>(() => loadEntries());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<DuaaEntry | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<FilterView>('all');
  const [toDelete, setToDelete] = useState<DuaaEntry | null>(null);

  const [form, setForm] = useState<DuaaForm>({
    title: '',
    body: '',
    answered: false,
    category: 'general',
    tags: [],
  });

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', body: '', answered: false, category: 'general', tags: [] });
    setSheetOpen(true);
  };

  const openEdit = (entry: DuaaEntry) => {
    setEditing(entry);
    setForm({
      title: entry.text.split('\n')[0] ?? '',
      body: entry.text,
      answered: entry.answered ?? false,
      category: entry.category ?? 'general',
      tags: entry.tags ?? [],
    });
    setSheetOpen(true);
  };

  const handleSave = useCallback(() => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    // When editing and the body is cleared, keep the original text rather than
    // collapsing the entry down to just its title (which would lose content).
    const fullText = form.body.trim() || (editing ? editing.text : form.title.trim());

    let updated: DuaaEntry[];
    if (editing) {
      updated = entries.map((e) =>
        e.id === editing.id
          ? {
              ...e,
              text: fullText,
              answered: form.answered,
              // Stamp answeredAt the first time it flips to answered; clear when un-answered.
              answeredAt: form.answered ? (e.answeredAt ?? now) : undefined,
              category: form.category,
              tags: form.tags,
              updatedAt: now,
            }
          : e,
      );
    } else {
      const newEntry: DuaaEntry = {
        id: `duaa_${Date.now()}`,
        text: fullText,
        category: form.category,
        tags: form.tags,
        createdAt: now,
        updatedAt: now,
        answered: form.answered,
        answeredAt: form.answered ? now : undefined,
      };
      updated = [newEntry, ...entries];
    }

    setEntries(updated);
    saveEntries(updated);
    setSheetOpen(false);
  }, [editing, entries, form]);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = entries.filter((e) => e.id !== id);
      setEntries(updated);
      saveEntries(updated);
    },
    [entries],
  );

  // Quick answered toggle directly from the card (extends behavior additively).
  const toggleAnswered = useCallback(
    (entry: DuaaEntry) => {
      const now = new Date().toISOString();
      const nextAnswered = !entry.answered;
      const updated = entries.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              answered: nextAnswered,
              answeredAt: nextAnswered ? (e.answeredAt ?? now) : undefined,
              updatedAt: now,
            }
          : e,
      );
      setEntries(updated);
      saveEntries(updated);
    },
    [entries],
  );

  const toggleFormTag = (id: MoodId) =>
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(id) ? f.tags.filter((x) => x !== id) : [...f.tags, id],
    }));

  const answeredCount = useMemo(() => entries.filter((e) => e.answered).length, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (view === 'answered') list = list.filter((e) => e.answered);
    if (search) list = list.filter((e) => e.text?.includes(search));
    return list;
  }, [entries, view, search]);

  const field =
    'w-full rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-4 text-base text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';
  const chip = (on: boolean, tone: 'teal' | 'gold' = 'teal') =>
    [
      'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-sm font-semibold transition-colors',
      on
        ? tone === 'gold'
          ? 'bg-gold/15 text-gold-dark dark:text-gold-light ring-1 ring-gold/40'
          : 'bg-[image:var(--gradient-teal)] text-on-accent'
        : 'bg-cream-dark/55 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/75 hover:bg-teal/10',
    ].join(' ');

  return (
    <div className="flex flex-col gap-6">
      {/* ── Hero ─────────────────────────────────────────── */}
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="flex items-center gap-4">
          <Medallion size={64} tone="gold">
            <span className="text-xl text-gold-dark dark:text-gold-light">{toArabicDigits(entries.length)}</span>
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-text-primary dark:text-text-on-dark">{t('duaa_journal')}</p>
            <p className="text-xs text-text-muted mt-0.5">دعوات تحفظها وتتعاهدها</p>
            {answeredCount > 0 ? (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-gold/15 text-gold-dark dark:text-gold-light text-[11px] font-bold">
                <Sparkles size={11} /> {toArabicDigits(answeredCount)} أُجيبت بفضل الله
              </span>
            ) : null}
          </div>
        </div>
        <p className="font-quran text-center text-[15px] text-teal dark:text-teal-light mt-4 leading-loose">
          ﴿وَقَالَ رَبُّكُمُ ادْعُونِي أَسْتَجِبْ لَكُمْ﴾
        </p>
        <Button variant="primary" fullWidth className="mt-3" onClick={openNew} leftIcon={<Plus size={16} />} haptic="medium">
          {t('duaa_add')}
        </Button>
      </Card>

      <section className="flex flex-col gap-3">
        {entries.length > 0 ? (
          <SectionTitle title="دعواتي" subtitle={`${toArabicDigits(filtered.length)} من ${toArabicDigits(entries.length)}`} />
        ) : null}

        {entries.length > 0 ? (
          <>
            <div className="relative">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3.5 text-text-muted pointer-events-none" />
              <TextInput
                value={search}
                onValueChange={setSearch}
                placeholder={t('search_duaa')}
                aria-label={t('search_duaa')}
                className={`${field} min-h-11 ps-10 bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07]`}
              />
            </div>
            <div role="radiogroup" aria-label="تصفية الأدعية" className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
              {([
                { id: 'all' as const, label: 'الكل', count: entries.length },
                { id: 'answered' as const, label: t('duaa_answered'), count: answeredCount },
              ]).map((tab) => {
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setView(tab.id)}
                    className={[
                      'flex-1 min-h-10 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors',
                      active
                        ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                        : 'text-text-secondary dark:text-text-on-dark/70',
                    ].join(' ')}
                  >
                    {tab.id === 'answered' ? <Sparkles size={14} /> : null}
                    {tab.label}
                    <span className="font-counter text-text-muted">{toArabicDigits(tab.count)}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            title={entries.length === 0 ? t('no_duaa_yet') : view === 'answered' ? 'لم تُسجَّل دعوات مُجابة بعد' : 'لا نتائج'}
            description={
              entries.length === 0
                ? 'اكتب ما تسأل الله، وارجع إليه في أوقات الإجابة.'
                : view === 'answered'
                  ? 'عند إجابة دعائك علّمه ليبقى شاهداً على فضل الله عليك.'
                  : 'جرّب كلمة أخرى.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {filtered.map((entry, i) => {
                const moodTags = (entry.tags ?? []).filter((tg) => MOOD_BY_ID[tg]);
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.02 }}
                  >
                    <Card variant={entry.answered ? 'gold-rim' : 'plain'} className="p-4">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleAnswered(entry)}
                          aria-pressed={!!entry.answered}
                          aria-label={entry.answered ? 'مُجابة، اضغط للإلغاء' : 'علّمها مُجابة'}
                          className={[
                            'w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors',
                            entry.answered
                              ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                              : 'bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light hover:bg-teal/20',
                          ].join(' ')}
                        >
                          {entry.answered ? <Sparkles size={18} /> : <HandHeart size={18} />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-text-primary dark:text-text-on-dark leading-relaxed whitespace-pre-line line-clamp-4 text-pretty">
                            {entry.text}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {entry.category ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light">
                                <TagIcon size={11} className="shrink-0" />
                                {CATEGORY_LABEL[entry.category] ?? entry.category}
                              </span>
                            ) : null}
                            {moodTags.map((tg) => {
                              const MoodIcon = MOOD_BY_ID[tg].icon;
                              return (
                                <span
                                  key={tg}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/15 text-gold-dark dark:text-gold-light"
                                >
                                  <MoodIcon size={11} className="shrink-0" />
                                  {MOOD_BY_ID[tg].label}
                                </span>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-text-muted mt-2 font-counter tabular-nums">
                            {toArabicDigits(safeFormat(entry.createdAt, 'd MMMM yyyy', { locale }))}
                            {entry.answered && entry.answeredAt ? (
                              <span className="text-gold-dark dark:text-gold-light">
                                {'، أُجيبت '}
                                {toArabicDigits(safeFormat(entry.answeredAt, 'd MMMM', { locale }))}
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <div className="flex flex-col shrink-0 -me-1.5 -mt-1">
                          <button
                            type="button"
                            onClick={() => openEdit(entry)}
                            aria-label={t('duaa_edit')}
                            className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-teal/10 hover:text-teal"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(entry)}
                            aria-label={t('duaa_delete')}
                            className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── Create / edit sheet ──────────────────────────────── */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? t('edit_duaa') : t('new_duaa')}>
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">{t('duaa_title')}</span>
            <TextInput
              value={form.title}
              onValueChange={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder={t('duaa_title_placeholder')}
              className={`${field} min-h-12`}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">{t('duaa_body')}</span>
            <TextArea
              value={form.body}
              onValueChange={(v) => setForm((f) => ({ ...f, body: v }))}
              rows={4}
              placeholder={t('duaa_body_placeholder')}
              className={`${field} py-3 resize-none leading-relaxed`}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">{t('duaa_category')}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('duaa_category')}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="radio"
                  aria-checked={form.category === cat.id}
                  onClick={() => setForm((f) => ({ ...f, category: cat.id }))}
                  className={chip(form.category === cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">نبرة الدعاء</span>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((mood) => {
                const active = form.tags.includes(mood.id);
                const MoodIcon = mood.icon;
                return (
                  <button
                    key={mood.id}
                    type="button"
                    onClick={() => toggleFormTag(mood.id)}
                    aria-pressed={active}
                    className={chip(active, 'gold')}
                  >
                    <MoodIcon size={14} className="shrink-0" />
                    {mood.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={[
              'flex items-center gap-3 px-3.5 py-3 rounded-[var(--radius-inner)] transition-colors',
              form.answered ? 'bg-gold/10 ring-1 ring-gold/35' : 'bg-cream-dark/45 dark:bg-dark-surface',
            ].join(' ')}
          >
            <Sparkles size={18} className={form.answered ? 'text-gold-dark dark:text-gold-light shrink-0' : 'text-text-muted shrink-0'} />
            <span className="flex-1 text-sm font-semibold text-text-primary dark:text-text-on-dark">أُجيبت دعوتي</span>
            <Toggle
              checked={form.answered}
              onChange={(v) => setForm((f) => ({ ...f, answered: v }))}
              size="sm"
              label="أُجيبت دعوتي"
              hideLabel
            />
          </div>

          <Button variant="primary" fullWidth onClick={handleSave} disabled={!form.title.trim()}>
            {t('save')}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الدعاء"
        message="سيُحذف هذا الدعاء من مفكّرتك نهائياً."
        confirmLabel="حذف"
        confirmVariant="danger"
        onConfirm={() => {
          if (toDelete) handleDelete(toDelete.id);
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
