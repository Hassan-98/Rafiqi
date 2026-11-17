import { useEffect, useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { TextArea } from '@/components/ui/TextInput';
import { allBuiltinItems } from '@/components/adhkar/adhkarSets';
import { useCustomAzkarStore, makeCustomDhikr } from '@/store/customAzkarStore';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { DhikrItem } from '@/types';

interface CustomAzkarSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

/**
 * Build a custom azkar set: name it, add your own dhikr (text + count), and/or
 * pick from the built-in morning / evening / sleep / post-prayer pools.
 */
export function CustomAzkarSheet({ open, onClose, onCreated }: CustomAzkarSheetProps) {
  const addSet = useCustomAzkarStore((s) => s.addSet);

  const [name, setName] = useState('');
  const [items, setItems] = useState<DhikrItem[]>([]);
  const [customText, setCustomText] = useState('');
  const [customCount, setCustomCount] = useState(3);
  const [pool, setPool] = useState<DhikrItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setItems([]);
    setCustomText('');
    setCustomCount(3);
    allBuiltinItems()
      .then(setPool)
      .catch(() => undefined);
  }, [open]);

  const inSet = (id: string) => items.some((i) => i.id === id);
  const toggle = (it: DhikrItem) =>
    setItems((prev) => (prev.some((i) => i.id === it.id) ? prev.filter((i) => i.id !== it.id) : [...prev, it]));

  const addCustom = () => {
    if (!customText.trim()) return;
    setItems((prev) => [...prev, makeCustomDhikr(customText, customCount)]);
    setCustomText('');
    setCustomCount(3);
  };

  const save = () => {
    if (items.length === 0) {
      toast.error('أضف ذكراً واحداً على الأقل');
      return;
    }
    const s = addSet(name, items);
    toast.success('تم إنشاء المجموعة');
    onCreated?.(s.id);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="مجموعة أذكار جديدة">
      <div className="flex flex-col gap-4">
        <Input
          label="اسم المجموعة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: أذكاري المختارة"
        />

        {/* Selected items */}
        {items.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold text-text-muted">
              المختارة ({toArabicDigits(items.length)})
            </p>
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-teal/8 dark:bg-teal/15"
              >
                <span className="flex-1 min-w-0 text-sm font-arabic text-text-primary dark:text-text-on-dark line-clamp-1">
                  {it.arabic}
                </span>
                <span className="text-[11px] font-counter text-text-muted shrink-0">
                  ×{toArabicDigits(it.count)}
                </span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  className="p-1 text-text-muted hover:text-danger shrink-0"
                  aria-label="حذف"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Add custom dhikr */}
        <div className="rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface p-3 flex flex-col gap-2">
          <p className="text-[11px] font-bold text-text-muted">أضف ذكراً مخصّصاً</p>
          <TextArea
            value={customText}
            onValueChange={setCustomText}
            placeholder="اكتب الذكر هنا…"
            rows={2}
            dir="rtl"
            className="w-full rounded-xl border border-teal/15 dark:border-dark-border bg-white dark:bg-dark-card p-2.5 text-base font-ornate text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">عدد المرات</span>
            <NumberInput
              min={1}
              max={1000}
              value={customCount}
              onValueChange={setCustomCount}
              className="w-20 min-h-10 text-center text-sm bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark rounded-xl px-2 py-1 font-counter border border-teal/15 dark:border-dark-border"
              dir="ltr"
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={addCustom}
              disabled={!customText.trim()}
              className="ms-auto"
            >
              إضافة
            </Button>
          </div>
        </div>

        {/* Pick from existing */}
        {pool.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold text-text-muted">أو اختر من الأذكار الموجودة</p>
            <div className="max-h-60 overflow-y-auto flex flex-col gap-1.5 pe-1">
              {pool.map((it) => {
                const selected = inSet(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it)}
                    className={[
                      'flex items-center gap-2 p-2.5 rounded-xl text-start transition-colors',
                      selected
                        ? 'bg-teal/12 dark:bg-teal/20 ring-1 ring-teal/40'
                        : 'bg-cream-dark dark:bg-dark-card hover:bg-teal/8',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                        selected ? 'bg-teal border-teal text-on-accent' : 'border-teal/30',
                      ].join(' ')}
                    >
                      {selected ? <Check size={13} /> : null}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-arabic text-text-primary dark:text-text-on-dark line-clamp-1">
                      {it.arabic}
                    </span>
                    <span className="text-[11px] font-counter text-text-muted shrink-0">
                      ×{toArabicDigits(it.count)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <Button variant="primary" fullWidth onClick={save} disabled={items.length === 0}>
          حفظ المجموعة
        </Button>
      </div>
    </BottomSheet>
  );
}
