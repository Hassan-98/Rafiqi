import { useState, useMemo, type ReactNode } from 'react';
import { motion } from '@/lib/motion';
import {
  Coins,
  Info,
  Wallet,
  Landmark,
  TrendingUp,
  Package,
  HandCoins,
  CircleDollarSign,
  Scale,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { parseNumber } from '@/components/ui/NumberInput';
import { Section } from '@/components/ui/Section';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, ArchMotif } from '@/components/ui/Ornament';
import { ProgressGauge } from '@/components/stats/ProgressGauge';
import { StatTile } from '@/components/stats/StatTile';
import { computeZakat, type ZakatInputs } from '@/services/ZakatService';
import { toArabicDigits } from '@/utils/arabicFormat';

const DEFAULT: ZakatInputs = {
  cash: 0,
  savings: 0,
  goldGrams: 0,
  silverGrams: 0,
  businessInventory: 0,
  receivables: 0,
  stocksValue: 0,
  debts: 0,
  // Egyptian pounds (owner 2026-11-19: the app is Egyptian), approximate 24k gold and pure
  // silver per gram, late 2025 — the page asks to confirm them before trusting the nisab.
  goldPricePerGram: 6000,
  silverPricePerGram: 75,
};

// Persist the calculator between visits (people revisit zakat over days) and
// remember WHEN the metal prices were last confirmed — stale/default prices
// silently produce a wrong nisab, i.e. a wrong religious obligation.
const STORAGE_KEY = 'myzikr:zakat-calc';
const PRICE_KEYS: Array<keyof ZakatInputs> = ['goldPricePerGram', 'silverPricePerGram'];
const PRICE_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SavedCalc {
  inputs: ZakatInputs;
  pricesUpdatedAt: number | null;
}

function loadSaved(): SavedCalc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedCalc>;
      return {
        inputs: {
          ...DEFAULT,
          ...(parsed.inputs ?? {}),
          // Prices never confirmed are the old riyal defaults: start them over in pounds.
          ...(parsed.pricesUpdatedAt ? {} : { goldPricePerGram: DEFAULT.goldPricePerGram, silverPricePerGram: DEFAULT.silverPricePerGram }),
        },
        pricesUpdatedAt: parsed.pricesUpdatedAt ?? null,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { inputs: DEFAULT, pricesUpdatedAt: null };
}

function saveCalc(saved: SavedCalc): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* storage full — non-fatal */
  }
}

/** Currency-style formatting with Arabic-Indic digits + thousands grouping. */
function formatCurrency(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const grouped = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return toArabicDigits(grouped);
}

interface FieldDef {
  label: string;
  key: keyof ZakatInputs;
  hint?: string;
  unit?: string;
  icon?: ReactNode;
}

export function ZakatPage() {
  const [saved] = useState(loadSaved);
  const [inputs, setInputs] = useState<ZakatInputs>(saved.inputs);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState<number | null>(saved.pricesUpdatedAt);
  const [confirmReset, setConfirmReset] = useState(false);
  /** Text as typed per field (see renderField); absent = show the stored amount. */
  const [rawAmounts, setRawAmounts] = useState<Partial<Record<keyof ZakatInputs, string>>>({});
  const result = useMemo(() => computeZakat(inputs), [inputs]);
  const update = (patch: Partial<ZakatInputs>) => {
    const touchedPrices = PRICE_KEYS.some((k) => k in patch);
    setInputs((s) => {
      const next = { ...s, ...patch };
      const at = touchedPrices ? Date.now() : pricesUpdatedAt;
      saveCalc({ inputs: next, pricesUpdatedAt: at });
      return next;
    });
    if (touchedPrices) setPricesUpdatedAt(Date.now());
  };

  // Never let a default/stale metal price masquerade as a live one.
  const pricesNeverConfirmed = pricesUpdatedAt === null;
  const pricesStale = pricesUpdatedAt !== null && Date.now() - pricesUpdatedAt > PRICE_STALE_MS;
  const priceWarning = pricesNeverConfirmed
    ? 'أسعار الذهب والفضة أدناه تقديرية — حدّثها بالأسعار الحالية قبل الاعتماد على النتيجة.'
    : pricesStale
      ? `لم تُحدَّث أسعار المعادن منذ ${toArabicDigits(Math.round((Date.now() - pricesUpdatedAt) / (24 * 60 * 60 * 1000)))} يوماً — راجعها قبل الاعتماد على النتيجة.`
      : null;

  // Nisab progress: how close the net zakatable wealth is to the threshold.
  const nisabPct = result.nisabValue > 0
    ? Math.min(100, Math.round((result.netZakatable / result.nisabValue) * 100))
    : 0;

  // The field shows exactly what was typed; the store gets the parsed amount.
  // Rendering `String(amount || '')` rewrote every keystroke: a typed «0» vanished
  // and «1.» collapsed to «1», so decimals (and Arabic-Indic digits) were impossible.
  const renderField = (f: FieldDef) => (
    <Input
      key={f.key}
      label={f.label}
      type="text"
      inputMode="decimal"
      dir="ltr"
      value={rawAmounts[f.key] ?? (inputs[f.key] ? String(inputs[f.key]) : '')}
      onChange={(e) => {
        const text = e.target.value;
        setRawAmounts((r) => ({ ...r, [f.key]: text }));
        const n = parseNumber(text);
        update({ [f.key]: Number.isFinite(n) && n > 0 ? n : 0 } as Partial<ZakatInputs>);
      }}
      hint={f.hint}
      leftIcon={f.icon}
      rightIcon={<span className="text-[11px] text-text-muted">{f.unit ?? 'ج.م'}</span>}
    />
  );

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="حاسبة الزكاة" subtitle="زكاة المال والذهب والفضة وعروض التجارة" showBack />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6">
        {/* Hero card */}
        <Card variant="gradient-edge" className="p-5">
          <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
          <div className="flex items-center gap-4">
            <Medallion size={60} tone="gold">
              <Coins size={22} className="text-gold-dark dark:text-gold-light" />
            </Medallion>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl text-text-primary dark:text-text-on-dark leading-tight">
                الزكاة المستحقة
              </h1>
              <p className="mt-1 text-3xl font-counter font-bold text-teal dark:text-teal-light tabular-nums leading-none">
                {formatCurrency(result.zakatDue)}
                <span className="text-base font-normal text-text-muted"> ج.م</span>
              </p>
              <p className="mt-1.5 text-[11px] text-text-secondary leading-relaxed">
                {result.isAboveNisab
                  ? 'بلغت مالك النصاب — تجب الزكاة بنسبة ٢٫٥٪ من الصافي.'
                  : 'مالك أقل من النصاب — لا تجب الزكاة عليك حالياً.'}
              </p>
            </div>
          </div>

          {/* Nisab progress gauge */}
          <div className="mt-4 flex justify-center">
            <ProgressGauge
              value={result.netZakatable}
              max={result.nisabValue || 1}
              variant="semicircle"
              size={188}
              label="بلوغ النصاب"
              sublabel={`النصاب على أساس ${result.nisabBasis === 'silver' ? 'الفضة' : 'الذهب'}`}
              formatValue={() => `${toArabicDigits(nisabPct)}٪`}
            />
          </div>
        </Card>

        {priceWarning ? (
          <div className="rounded-[var(--radius-inner)] px-3.5 py-3 flex items-start gap-2 text-xs ring-1 ring-gold/40 bg-gold/10">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-gold-dark dark:text-gold-light" />
            <p className="leading-relaxed text-text-secondary dark:text-text-on-dark/80">{priceWarning}</p>
          </div>
        ) : null}

        {/* Result tiles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid grid-cols-2 gap-2"
        >
          <StatTile
            label="النصاب"
            value={formatCurrency(result.nisabValue)}
            icon={<Scale size={14} />}
            accent="gold"
          />
          <StatTile
            label="إجمالي الأصول"
            value={formatCurrency(result.totalAssets)}
            icon={<Wallet size={14} />}
          />
          <StatTile
            label="الصافي الزكوي"
            value={formatCurrency(result.netZakatable)}
            icon={<CircleDollarSign size={14} />}
          />
          <StatTile
            label="الزكاة المستحقة (٢٫٥٪)"
            value={formatCurrency(result.zakatDue)}
            icon={<Coins size={14} />}
            accent="gold"
          />
        </motion.div>

        <Card variant="inset" className="p-4 flex items-start gap-2 text-xs text-text-secondary dark:text-text-on-dark/75">
          <Info size={14} className="shrink-0 mt-0.5 text-teal dark:text-teal-light" />
          <p className="leading-relaxed">
            تُحسب الزكاة بنسبة ٢٫٥٪ على ما يفوق النصاب (٥٩٥ غرام فضة أو ٨٥ غرام ذهب). أدخل قيمة
            ممتلكاتك بعد مرور حول كامل عليها — تُحدّث النتيجة تلقائياً.
          </p>
        </Card>

        <Section title="الأصول" subtitle="ما مضى عليه حول كامل">
          <Card className="p-4 flex flex-col gap-3">
          {renderField({ label: 'النقد', key: 'cash', icon: <Wallet size={15} /> })}
          {renderField({ label: 'المدخرات', key: 'savings', icon: <Landmark size={15} /> })}
          {renderField({ label: 'قيمة الأسهم', key: 'stocksValue', icon: <TrendingUp size={15} /> })}
          {renderField({ label: 'عروض التجارة', key: 'businessInventory', icon: <Package size={15} /> })}
          {renderField({ label: 'الديون المستحقة لك', key: 'receivables', icon: <HandCoins size={15} /> })}
          </Card>
        </Section>

        <Section title="الذهب والفضة" subtitle="بالغرام، مع سعر اليوم">
          <Card className="p-4 flex flex-col gap-3">
          {renderField({ label: 'الذهب', key: 'goldGrams', unit: 'غرام' })}
          {renderField({
            label: 'سعر غرام الذهب',
            key: 'goldPricePerGram',
            hint: 'حدّث السعر الحالي',
          })}
          {renderField({ label: 'الفضة', key: 'silverGrams', unit: 'غرام' })}
          {renderField({ label: 'سعر غرام الفضة', key: 'silverPricePerGram' })}
          </Card>
        </Section>

        <Section title="الالتزامات" subtitle="تُخصم من الأصول">
          <Card className="p-4 flex flex-col gap-3">
          {renderField({ label: 'الديون المستحقة عليك', key: 'debts', icon: <HandCoins size={15} /> })}
          </Card>
        </Section>

        <Button variant="ghost" fullWidth leftIcon={<RotateCcw size={16} />} onClick={() => setConfirmReset(true)}>
          إعادة تعيين
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="إعادة تعيين الحاسبة"
        message="ستُمسح كل القيم التي أدخلتها وأسعار المعادن."
        confirmLabel="إعادة التعيين"
        confirmVariant="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
            setConfirmReset(false);
            setInputs(DEFAULT);
            setRawAmounts({});
            setPricesUpdatedAt(null);
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {
              /* ignore */
            }
          }}
      />
    </div>
  );
}
