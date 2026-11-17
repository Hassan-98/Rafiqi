/**
 * Zakat calculation service.
 *
 * Nisab is the minimum threshold above which zakat is due. It's pegged to the
 * value of either 85 g of gold or 595 g of silver — we use silver by default
 * because it's the lower threshold (safer / more conservative). The user can
 * override prices in the calculator UI when the API is unreachable.
 *
 * Zakat rate: 2.5% on assets held for a lunar year.
 */

export interface ZakatInputs {
  cash: number;
  savings: number;
  goldGrams: number;
  silverGrams: number;
  businessInventory: number;
  receivables: number;
  stocksValue: number;
  debts: number;
  /** Per-gram prices in the user's chosen currency. */
  goldPricePerGram: number;
  silverPricePerGram: number;
}

export interface ZakatResult {
  nisabValue: number;
  nisabBasis: 'silver' | 'gold';
  totalAssets: number;
  netZakatable: number;
  isAboveNisab: boolean;
  zakatDue: number;
}

const NISAB_GOLD_GRAMS = 85;
const NISAB_SILVER_GRAMS = 595;
const RATE = 0.025;

export function computeZakat(inputs: ZakatInputs): ZakatResult {
  // Metal prices drive the nisab threshold; a zero/negative price (typed by
  // hand) would yield a meaningless nisab, so clamp them to a sane minimum.
  const goldPrice = Math.max(0, inputs.goldPricePerGram);
  const silverPrice = Math.max(0, inputs.silverPricePerGram);
  const goldValue = inputs.goldGrams * goldPrice;
  const silverValue = inputs.silverGrams * silverPrice;
  const totalAssets =
    inputs.cash + inputs.savings + goldValue + silverValue +
    inputs.businessInventory + inputs.receivables + inputs.stocksValue;

  const netZakatable = Math.max(0, totalAssets - inputs.debts);

  // Nisab = the LOWER of the two metal thresholds — but only among metals
  // with a real price. A cleared/zero price used to make min() return 0,
  // which charged zakat on ANY wealth: a religious-correctness bug, not a
  // rounding detail. With no valid price at all the nisab is unknowable →
  // never assert that zakat is due.
  const candidates: Array<{ basis: 'silver' | 'gold'; value: number }> = [];
  if (silverPrice > 0) candidates.push({ basis: 'silver', value: NISAB_SILVER_GRAMS * silverPrice });
  if (goldPrice > 0) candidates.push({ basis: 'gold', value: NISAB_GOLD_GRAMS * goldPrice });
  const nisab = candidates.sort((a, b) => a.value - b.value)[0] ?? null;

  const isAboveNisab = nisab ? netZakatable >= nisab.value : false;
  const zakatDue = isAboveNisab ? netZakatable * RATE : 0;

  return {
    nisabValue: nisab?.value ?? 0,
    nisabBasis: nisab?.basis ?? 'silver',
    totalAssets,
    netZakatable,
    isAboveNisab,
    zakatDue,
  };
}
