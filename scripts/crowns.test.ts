/**
 * Executable check for «التيجان» (services/crowns.ts).
 *   npx esbuild scripts/crowns.test.ts --bundle --format=esm --platform=node --alias:@=./src \
 *     --outfile=.tmp-test/crowns.mjs "--define:import.meta.env={}" && node .tmp-test/crowns.mjs
 */
import assert from 'node:assert/strict';
import type { LbRow } from '@/services/leaderboard';
import {
  crownOf,
  crownTitle,
  emblemLabel,
  emblemOf,
  leaderOf,
  liveCrowns,
  lostSince,
  momentKey,
  newlyWon,
  samePerson,
  streakText,
  winnerOf,
  type CrownKeys,
  type Crowns,
} from '@/services/crowns';

const row = (rank: number, points: number, name: string | null, tag: number, total: number, isMe = false): LbRow => ({ rank, points, name, tag, isMe, total });
const KEYS: CrownKeys = { day: '2026-11-18', week: '2026-11-15', month: '2026-11-01' };
const sara = { name: 'سارة', tag: 4217, isMe: false };
const me = { name: 'عبد الله', tag: 7731, isMe: true };

// ── leader: alone at the top, with someone to lead ──
assert.equal(leaderOf([row(1, 120, 'سارة', 4217, 1)]), null, 'one participant: no crown');
assert.equal(leaderOf([row(1, 90, 'سارة', 4217, 6), row(1, 90, 'خالد', 4528, 6)]), null, 'a tie for first crowns no one');
assert.equal(leaderOf([]), null);
const l = leaderOf([row(2, 80, 'خالد', 4528, 6), row(1, 100, 'سارة', 4217, 6), row(9, 20, 'عبد الله', 7731, 6, true)]);
assert.equal(l?.row.name, 'سارة', 'the top row, whatever the order');
assert.equal(l?.second, 80);

// ── margin, field size, dominance ──
const board = (p1: number, p2: number, total: number) => [row(1, p1, 'سارة', 4217, total), row(2, p2, 'خالد', 4528, total)];
const c1 = crownOf(board(125, 100, 30), KEYS.week)!;
assert.equal(c1.lead, 0.25);
assert.equal(c1.streak, 1);
assert.equal(emblemOf({ week: c1 }, sara)!.dominant, true, '25% ahead = dominant');
assert.equal(emblemOf({ week: crownOf(board(124, 100, 30), KEYS.week)! }, sara)!.dominant, false, '24% is not');
const small = crownOf(board(300, 100, 3), KEYS.week)!;
assert.equal(emblemOf({ week: small }, sara)!.quiet, true, '2–4 participants: the quiet crown');
assert.equal(emblemOf({ week: small }, sara)!.dominant, false, 'no flourish in a tiny field');
assert.equal(emblemOf({ week: crownOf(board(130, 100, 5), KEYS.week)! }, sara)!.quiet, false, 'five is a full field');
assert.equal(crownOf(board(130, 100, 1), KEYS.week), null, 'fewer than 2 participants: no crown');

// ── streaks: consecutive past wins of the same person, newest first ──
const s3 = crownOf(board(130, 100, 20), KEYS.day, [sara, { ...sara }, { name: 'خالد', tag: 4528, isMe: false }, sara])!;
assert.equal(s3.streak, 3, 'today + yesterday + the day before; the run stops at someone else');
assert.equal(crownOf(board(130, 100, 20), KEYS.day, [null, sara])!.streak, 1, 'a day without a winner breaks the run');
assert.equal(crownOf(board(130, 100, 20), KEYS.day, [{ ...sara, tag: 9999 }])!.streak, 1, 'same name, other tag: someone else');
assert.equal(crownOf(board(130, 100, 20), KEYS.day, [{ ...sara, name: 'سارة م' }])!.streak, 1, 'tag collision: the name must match too');
const mine = crownOf([row(1, 200, 'عبد الله', 7731, 9, true), row(2, 50, 'سارة', 4217, 9)], KEYS.day, [{ name: 'عبدالله', tag: 7731, isMe: true }])!;
assert.equal(mine.streak, 2, 'my own rows match through isMe even after a rename');
assert.equal(samePerson(sara, { ...sara }), true);
assert.equal(winnerOf(board(90, 90, 4)), null, 'a tied day has no winner');
assert.deepEqual(winnerOf(board(91, 90, 4)), sara);

// ── combos and the combined emblem ──
const day = crownOf(board(120, 100, 20), KEYS.day, [sara, sara])!; // ×3 days, 20% ahead
const week = crownOf(board(110, 100, 20), KEYS.week, [sara])!; // ×2 weeks
const monthKhalid = crownOf([row(1, 900, 'خالد', 4528, 40), row(2, 800, 'سارة', 4217, 40)], KEYS.month)!;
const all: Crowns = { day, week, month: monthKhalid };
const eSara = emblemOf(all, sara)!;
assert.deepEqual(eSara.periods, ['day', 'week']);
assert.equal(eSara.full, false);
assert.equal(eSara.weight, 3);
assert.deepEqual(eSara.streak, { period: 'day', n: 3 }, 'the longest run');
assert.equal(eSara.dominant, false, 'neither lead reaches 25%');
assert.deepEqual(emblemOf(all, { name: 'خالد', tag: 4528, isMe: false })!.periods, ['month']);
assert.equal(emblemOf(all, me), null, 'no crown, no emblem');
const full = emblemOf({ day, week, month: crownOf(board(500, 300, 40), KEYS.month)! }, sara)!;
assert.equal(full.full, true);
assert.equal(full.weight, 6);
assert.equal(full.dominant, true, 'the month lead is 67%');
assert.deepEqual(
  emblemOf({ day: crownOf(board(130, 100, 20), KEYS.day, [sara])!, week: crownOf(board(130, 100, 20), KEYS.week, [sara])! }, sara)!.streak,
  { period: 'week', n: 2 },
  'equal runs: the higher period',
);

// ── words ──
assert.equal(crownTitle(['week']), 'تاج الأسبوع');
assert.equal(crownTitle(['day', 'month']), 'تاج اليوم والشهر');
assert.equal(crownTitle(['day', 'week', 'month']), 'التاج الكامل');
assert.equal(streakText('day', 2), 'يومان متتاليان');
assert.equal(streakText('week', 3), '٣ أسابيع متتالية');
assert.equal(streakText('day', 11), '١١ يوماً متتالياً');
assert.equal(emblemLabel(eSara), 'تاج اليوم والأسبوع · ٣ أيام متتالية');
assert.equal(emblemLabel(full), 'التاج الكامل · ٣ أيام متتالية · بفارق واسع');

// ── a crown vanishes when the period rolls over ──
const held: Crowns = { day, week, month: monthKhalid };
assert.deepEqual(Object.keys(liveCrowns(held, KEYS)), ['day', 'week', 'month']);
const tomorrow = { ...KEYS, day: '2026-11-19' };
assert.deepEqual(Object.keys(liveCrowns(held, tomorrow)), ['week', 'month'], 'midnight: the day crown is gone');
assert.deepEqual(Object.keys(liveCrowns(held, { day: '2026-12-01', week: '2026-11-29', month: '2026-12-01' })), [], 'new month: all gone');
assert.equal(emblemOf(liveCrowns(held, tomorrow), sara)!.periods.join(), 'week');

// ── …and the moment the lead is lost ──
const myDay = crownOf([row(1, 150, 'عبد الله', 7731, 12, true), row(2, 140, 'سارة', 4217, 12)], KEYS.day)!;
const overtaken = crownOf([row(1, 160, 'سارة', 4217, 12), row(2, 150, 'عبد الله', 7731, 12, true)], KEYS.day)!;
assert.ok(emblemOf({ day: myDay }, me));
assert.equal(emblemOf({ day: overtaken }, me), null, 'overtaken: the crown moved');
assert.ok(emblemOf({ day: overtaken }, sara));
assert.deepEqual(lostSince({ day: myDay }, { day: overtaken }, KEYS), ['day']);
assert.deepEqual(lostSince({ day: myDay }, {}, KEYS), ['day'], 'caught up to a tie: lost too');
assert.deepEqual(lostSince({ day: myDay }, { day: myDay }, KEYS), []);
assert.deepEqual(lostSince({ day: myDay }, { day: overtaken }, tomorrow), [], 'a rollover is not a loss');
assert.deepEqual(lostSince({ day: overtaken }, {}, KEYS), [], 'never held');

// ── celebrate each (period, key) once ──
const myWeek = crownOf([row(1, 900, 'عبد الله', 7731, 30, true), row(2, 600, 'سارة', 4217, 30)], KEYS.week)!;
assert.deepEqual(newlyWon({ day: myDay, week: myWeek }, []), ['day', 'week']);
assert.deepEqual(newlyWon({ day: myDay, week: myWeek }, [momentKey('day', KEYS.day)]), ['week']);
assert.deepEqual(newlyWon({ day: myDay }, [`lost|${momentKey('day', KEYS.day)}`]), ['day'], 'a lost note is not a celebration');
assert.deepEqual(newlyWon({ day: { ...myDay, key: '2026-11-19' } }, [momentKey('day', KEYS.day)]), ['day'], 'a new day, a new moment');
assert.deepEqual(newlyWon({ day: overtaken }, []), [], 'only my crowns');

console.log('crowns: all assertions passed');
