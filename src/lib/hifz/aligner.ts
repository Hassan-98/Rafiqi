import { wordsMatch, similarity, levenshtein } from '@/utils/arabicMatch';

/**
 * The recitation alignment engine (Hifz 2.0).
 *
 * Consumes a stream of normalized ASR tokens and aligns them against the
 * expected (known) sequence of Quran words, classifying every expected word as
 * correct / wrong / skipped / peeked and counting extra spoken words — the
 * Tarteel-style per-word verdict the old forward-only matcher couldn't give.
 *
 * Design notes (each guards a real ASR failure mode):
 * - **Lookahead window**: a token may match a word a few positions ahead
 *   (ASR merged or dropped the in-between words, or the reciter skipped).
 *   Words jumped over become *tentative* skips, never instant errors.
 * - **Confirmation debounce**: a tentative wrong/skip is only COMMITTED after
 *   the reciter has correctly matched ≥2 later words. Partial transcripts
 *   retract and revise; committing instantly is how false positives happen
 *   (the #1 complaint against recitation apps, including Tarteel itself).
 * - **Self-correction**: until committed, re-reciting a flagged word clears it
 *   (recorded as selfCorrected — shown clean, but counted in the summary).
 * - **Repeats**: re-reciting recently-credited words (backing up to recall) is
 *   silently ignored — normal hifz behavior, never an error.
 * - **Stability gating**: the trailing token of a *partial* transcript may
 *   still be revised, so it can trigger matches (low risk) but never mistakes.
 * - **Muqattaʿat**: letter-name recitation ("الف لام ميم" for الم) is consumed
 *   token-by-token into the single expected word.
 */

export type WordState =
  | 'correct'
  | 'self-corrected'
  | 'wrong-pending'
  | 'wrong'
  | 'skipped-pending'
  | 'skipped'
  | 'peek';

export interface TrackerChange {
  index: number;
  state: WordState;
}

export interface TrackerStats {
  correct: number;
  wrong: number;
  skipped: number;
  peek: number;
  extra: number;
  selfCorrected: number;
}

export interface PushResult {
  changes: TrackerChange[];
  pointer: number;
  /** An extra (out-of-text) spoken word was detected on this push. */
  extra: boolean;
  /** A mistake was COMMITTED on this push (drive haptics off this, not pending marks). */
  committed: boolean;
}

/** Final per-word verdicts — only definitive states, for session records. */
export type FinalVerdict = Exclude<WordState, 'wrong-pending' | 'skipped-pending'>;

// ── tuning ──────────────────────────────────────────────────────────────────
/** How many expected words ahead a token may match (k=0 is the next word). */
const LOOKAHEAD = 4;
/** Correct matches required after a tentative mark before it commits. */
const CONFIRM_AFTER = 2;
/** Consecutive unmatched stable tokens before the awaited word goes wrong-pending. */
const WRONG_STREAK = 2;
/** How far back (in expected indices) repeats / self-corrections are accepted. */
const LOOKBACK = 10;
/** Similarity floor for lookahead (k>0) matches — stricter than the k=0 path. */
const LOOKAHEAD_SIM = 0.72;

// ── muqattaʿat (letter-name) handling ───────────────────────────────────────
const MUQATTAAT = new Set([
  'الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس',
  'ص', 'حم', 'عسق', 'ق', 'ن',
]);
/** Normalized letter-name skeletons per letter (post-normalizeArabic forms). */
const LETTER_NAMES: Record<string, string[]> = {
  'ا': ['الف'],
  'ل': ['لام'],
  'م': ['ميم'],
  'ص': ['صاد'],
  'ر': ['را', 'راء'],
  'ك': ['كاف'],
  'ه': ['ها', 'هاء'],
  'ي': ['يا', 'ياء'],
  'ع': ['عين'],
  'ط': ['طا', 'طاء'],
  'س': ['سين'],
  'ح': ['حا', 'حاء'],
  'ق': ['قاف'],
  'ن': ['نون'],
};

function isMuqattaa(skeleton: string): boolean {
  return MUQATTAAT.has(skeleton);
}

/**
 * UNWEIGHTED similarity for lookahead gating. `similarity()` is
 * confusable-weighted (lenient — right for crediting the awaited word, wrong
 * for jumping the pointer, which marks words as skipped).
 */
function plainSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Does a single ASR token cover the CONCATENATION of consecutive expected
 * words? Tight tolerance — looser would over-consume the page.
 */
function compoundMatches(concat: string, token: string): boolean {
  if (concat === token) return true;
  const len = Math.max(concat.length, token.length);
  const dist = levenshtein(concat, token);
  return dist <= Math.max(1, Math.floor(len / 6)) || similarity(concat, token) >= 0.84;
}

interface Tentative {
  kind: 'wrong' | 'skipped';
  /** Correct matches seen since the mark — commits at CONFIRM_AFTER. */
  confirmations: number;
}

/**
 * Per-page recitation tracker. Indices are positions within the `expected`
 * array (the page scope's real words, in reading order). Create a fresh
 * tracker per page; accumulate session stats outside (the hook does).
 */
export class RecitationTracker {
  private expected: string[];
  private resolved = new Map<number, FinalVerdict>();
  private tentative = new Map<number, Tentative>();
  private ptr = 0;
  private wrongStreak = 0;
  private extraCount = 0;
  /** Remaining letter-names while consuming a muqattaʿa word at the pointer. */
  private muqRemaining: string[] | null = null;

  constructor(expectedSkeletons: string[]) {
    this.expected = expectedSkeletons;
  }

  get pointer(): number {
    return this.ptr;
  }

  get done(): boolean {
    return this.ptr >= this.expected.length;
  }

  /** Current displayable state for an index (resolved beats tentative). */
  stateOf(index: number): WordState | null {
    const r = this.resolved.get(index);
    if (r) return r;
    const t = this.tentative.get(index);
    if (t) return t.kind === 'wrong' ? 'wrong-pending' : 'skipped-pending';
    return null;
  }

  /**
   * Feed one normalized token. `stable=false` for the trailing token of a
   * partial transcript (may match, must never create a mistake).
   */
  push(token: string, stable: boolean): PushResult {
    const changes: TrackerChange[] = [];
    let extra = false;
    let committed = false;
    if (!token || this.done) return { changes, pointer: this.ptr, extra, committed };

    // 1) Muqattaʿa in progress — consume letter names one token at a time.
    if (this.muqRemaining && this.muqRemaining.length > 0) {
      const next = this.muqRemaining[0];
      if (wordsMatch(next, token)) {
        this.muqRemaining.shift();
        if (this.muqRemaining.length === 0) {
          this.muqRemaining = null;
          this.resolveCorrect(this.ptr, changes);
          committed = this.confirmTentatives(changes) || committed;
        }
        return { changes, pointer: this.ptr, extra, committed };
      }
      // Letter-name recitation abandoned midway (we only enter this mode after
      // the FIRST name matched) — credit the muqattaʿa and fall through so the
      // current token is matched normally against the words after it.
      this.muqRemaining = null;
      this.resolveCorrect(this.ptr, changes);
      committed = this.confirmTentatives(changes) || committed;
    }

    // 2) The AWAITED word itself — always checked FIRST. Quran text repeats
    //    short words constantly (لا، ما، هم، إن) and contains near-twins
    //    (يؤمنون/يوقنون): if repeat-absorption ran first (as it used to), a
    //    correctly-recited awaited word could be swallowed as a "repeat" of an
    //    earlier occurrence, the next token would then lookahead-match, and a
    //    perfectly-recited word got falsely marked SKIPPED (orange).
    {
      const exp = this.expected[this.ptr];
      if (isMuqattaa(exp)) {
        const names = [...exp].map((ch) => LETTER_NAMES[ch]?.[0] ?? ch);
        // Letter-name recitation ("الف لام ميم"): engage when the token reads
        // as the FIRST letter name more than as the compact skeleton (e.g.
        // "الف" engages, while a literal "الم" matches directly below).
        if (
          names.length > 1 &&
          wordsMatch(names[0], token) &&
          similarity(names[0], token) > similarity(exp, token)
        ) {
          this.muqRemaining = names.slice(1);
          return { changes, pointer: this.ptr, extra, committed };
        }
      }
      if (wordsMatch(exp, token)) {
        if (this.tentative.has(this.ptr)) {
          // The awaited word was pending wrong/skip and the reciter fixed it
          // before commitment — record the recovery, not a plain correct.
          this.tentative.delete(this.ptr);
          this.resolved.set(this.ptr, 'self-corrected');
          changes.push({ index: this.ptr, state: 'self-corrected' });
          this.ptr += 1;
          while (this.ptr < this.expected.length && this.resolved.has(this.ptr)) this.ptr += 1;
        } else {
          this.resolveCorrect(this.ptr, changes);
        }
        committed = this.confirmTentatives(changes) || committed;
        if (this.wrongStreak === 1) {
          this.extraCount += 1;
          extra = true;
        }
        this.wrongStreak = 0;
        return { changes, pointer: this.ptr, extra, committed };
      }
    }

    // 3) Self-correction: token matches a tentatively-flagged earlier word.
    for (const [idx, t] of this.tentative) {
      if (idx < this.ptr - LOOKBACK) continue;
      if (wordsMatch(this.expected[idx], token)) {
        this.tentative.delete(idx);
        this.resolved.set(idx, 'self-corrected');
        changes.push({ index: idx, state: 'self-corrected' });
        this.wrongStreak = 0;
        // If the corrected word was the awaited one, move on past it (and any
        // already-resolved words) so the "current word" cue doesn't lag.
        if (idx === this.ptr) {
          this.ptr = idx + 1;
          while (this.ptr < this.expected.length && this.resolved.has(this.ptr)) this.ptr += 1;
        }
        return { changes, pointer: this.ptr, extra, committed };
      }
      void t;
    }

    // 4) Benign repeat: token EXACTLY equals an already-credited recent word.
    //    Strictly exact — fuzzy matching here is how near-twins of the awaited
    //    word used to get swallowed (the awaited word was already given its
    //    chance in step 2, so anything absorbed here is a true re-recitation).
    for (let idx = this.ptr - 1; idx >= 0 && idx >= this.ptr - LOOKBACK; idx--) {
      const r = this.resolved.get(idx);
      if ((r === 'correct' || r === 'self-corrected') && this.expected[idx] === token) {
        this.wrongStreak = 0;
        return { changes, pointer: this.ptr, extra, committed };
      }
    }

    // 5) Lookahead match (the reciter or the ASR jumped words).
    //    - UNSTABLE (still-revising) trailing tokens never look ahead:
    //      lookahead jumps from a half-revised token fabricate "skipped" marks
    //      that the final text would never produce.
    //    - Gate on PLAIN (unweighted) similarity: jumping the pointer forward
    //      marks words as skipped, so it demands much stronger evidence than
    //      crediting the awaited word does.
    //    - The recognizer routinely GLUES short words into one token
    //      ("لا ريب" → "لاريب", "يا أيها" → "ياأيها"), so a token may also
    //      match the CONCATENATION of 2–3 consecutive expected words.
    const maxK = stable ? LOOKAHEAD : 0;
    let matchAt = -1;
    let span = 1; // how many consecutive expected words this token covers
    outer: for (let k = 0; k <= maxK; k++) {
      const idx = this.ptr + k;
      if (idx >= this.expected.length) break;
      const exp = this.expected[idx];

      if (
        k > 0 &&
        token.length >= 3 &&
        exp.length >= 3 &&
        (exp === token || plainSimilarity(exp, token) >= LOOKAHEAD_SIM)
      ) {
        matchAt = k;
        break;
      }

      // Merged-token compound match (start positions ptr / ptr+1 only).
      if (k <= 1 && token.length >= 4) {
        let concat = exp;
        for (let j = 1; j <= 2; j++) {
          const nextIdx = idx + j;
          if (nextIdx >= this.expected.length) break;
          concat += this.expected[nextIdx];
          if (concat.length > token.length + 2) break;
          if (compoundMatches(concat, token)) {
            matchAt = k;
            span = j + 1;
            break outer;
          }
        }
      }
    }

    if (matchAt >= 0) {
      // Anything the reciter (or the ASR) jumped over → tentative skip.
      for (let i = this.ptr; i < this.ptr + matchAt; i++) {
        if (!this.resolved.has(i) && !this.tentative.has(i)) {
          this.tentative.set(i, { kind: 'skipped', confirmations: 0 });
          changes.push({ index: i, state: 'skipped-pending' });
        }
      }
      this.ptr += matchAt;
      for (let s = 0; s < span; s++) {
        this.resolveCorrect(this.ptr, changes);
        committed = this.confirmTentatives(changes) || committed;
      }
      // A lone unmatched token right before a successful match = extra word.
      if (this.wrongStreak === 1) {
        this.extraCount += 1;
        extra = true;
      }
      this.wrongStreak = 0;
      return { changes, pointer: this.ptr, extra, committed };
    }

    // 5) No match anywhere.
    if (!stable || token.length < 2) {
      return { changes, pointer: this.ptr, extra, committed };
    }
    this.wrongStreak += 1;
    if (this.wrongStreak >= WRONG_STREAK) {
      this.wrongStreak = 0;
      const idx = this.ptr;
      if (idx < this.expected.length && !this.resolved.has(idx) && !this.tentative.has(idx)) {
        this.tentative.set(idx, { kind: 'wrong', confirmations: 0 });
        changes.push({ index: idx, state: 'wrong-pending' });
      }
    }
    return { changes, pointer: this.ptr, extra, committed };
  }

  /**
   * Re-anchor after the stream and the page lose each other — e.g. recitation
   * that reached the ASR only from MID-page (segments recited while the model
   * was still loading get dropped), or a reciter who consciously jumped far
   * beyond LOOKAHEAD. Scans the page AFTER the pointer for the best window
   * matching the recent stable tokens; on a strong match the pointer jumps
   * there, crediting the matched window but issuing NO verdicts for the words
   * in between — they were never heard, which is not the same as skipped.
   *
   * Returns null (and changes nothing) without strong evidence: ≥80% of the
   * window must match, minimum 3 words.
   */
  resync(recentTokens: string[]): PushResult | null {
    const n = recentTokens.length;
    if (n < 3 || this.done) return null;
    // Scan the WHOLE scope, not just past the pointer — a lost reciter most
    // often restarts from the TOP of the page, i.e. BEHIND the pointer.
    let bestStart = -1;
    let bestScore = 0;
    for (let start = 0; start + n <= this.expected.length; start++) {
      let score = 0;
      for (let j = 0; j < n; j++) {
        if (wordsMatch(this.expected[start + j], recentTokens[j])) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
      }
    }
    if (bestStart < 0 || bestScore < Math.max(3, Math.ceil(n * 0.8))) return null;

    const ptrBefore = this.ptr;
    const changes: TrackerChange[] = [];
    this.tentative.clear();
    this.wrongStreak = 0;
    this.muqRemaining = null;
    this.ptr = bestStart;
    // Hop over anything already credited, then re-walk the recent tokens so
    // the pointer lands right AFTER what was just recited.
    while (this.ptr < this.expected.length && this.resolved.has(this.ptr)) this.ptr += 1;
    for (let j = 0; j < n && this.ptr < this.expected.length; j++) {
      if (wordsMatch(this.expected[this.ptr], recentTokens[j])) {
        this.resolveCorrect(this.ptr, changes);
      }
    }
    if (this.ptr === ptrBefore) return null; // re-anchored to the same stall — report no-op
    return { changes, pointer: this.ptr, extra: false, committed: false };
  }

  /** Reveal the awaited word as a logged peek and move on (Tarteel mechanic). */
  peek(): PushResult {
    const changes: TrackerChange[] = [];
    if (this.done) return { changes, pointer: this.ptr, extra: false, committed: false };
    const idx = this.ptr;
    this.tentative.delete(idx);
    this.resolved.set(idx, 'peek');
    changes.push({ index: idx, state: 'peek' });
    this.ptr = idx + 1;
    this.muqRemaining = null;
    const committed = this.confirmTentatives(changes);
    return { changes, pointer: this.ptr, extra: false, committed };
  }

  /**
   * End of page / session: commit every pending mark (the reciter moved on or
   * stopped — no more confirmations are coming) and return final verdicts.
   */
  finalize(): { changes: TrackerChange[]; verdicts: Map<number, FinalVerdict> } {
    const changes: TrackerChange[] = [];
    for (const [idx, t] of this.tentative) {
      const state: FinalVerdict = t.kind === 'wrong' ? 'wrong' : 'skipped';
      this.resolved.set(idx, state);
      changes.push({ index: idx, state });
    }
    this.tentative.clear();
    return { changes, verdicts: new Map(this.resolved) };
  }

  stats(): TrackerStats {
    const s: TrackerStats = { correct: 0, wrong: 0, skipped: 0, peek: 0, extra: this.extraCount, selfCorrected: 0 };
    for (const v of this.resolved.values()) {
      if (v === 'correct') s.correct += 1;
      else if (v === 'wrong') s.wrong += 1;
      else if (v === 'skipped') s.skipped += 1;
      else if (v === 'peek') s.peek += 1;
      else if (v === 'self-corrected') s.selfCorrected += 1;
    }
    // Pending marks count toward nothing until committed/cleared.
    return s;
  }

  private resolveCorrect(idx: number, changes: TrackerChange[]): void {
    this.tentative.delete(idx);
    this.resolved.set(idx, 'correct');
    changes.push({ index: idx, state: 'correct' });
    this.ptr = idx + 1;
    // Skip over anything already resolved (e.g. peeked words).
    while (this.ptr < this.expected.length && this.resolved.has(this.ptr)) this.ptr += 1;
  }

  /** Bump confirmations on pending marks; commit those that reach the bar. */
  private confirmTentatives(changes: TrackerChange[]): boolean {
    let committedAny = false;
    for (const [idx, t] of [...this.tentative]) {
      t.confirmations += 1;
      if (t.confirmations >= CONFIRM_AFTER) {
        this.tentative.delete(idx);
        const state: FinalVerdict = t.kind === 'wrong' ? 'wrong' : 'skipped';
        this.resolved.set(idx, state);
        changes.push({ index: idx, state });
        committedAny = true;
      }
    }
    return committedAny;
  }
}
