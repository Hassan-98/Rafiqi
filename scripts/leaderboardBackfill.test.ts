// Run: npx esbuild scripts/leaderboardBackfill.test.ts --bundle --format=esm --platform=node --alias:@=./src
//   "--define:import.meta.env={\"VITE_SUPABASE_URL\":\"http://x\",\"VITE_SUPABASE_PUBLISHABLE_KEY\":\"k\"}" (+ the usual font/css loaders)
//   --outfile=.tmp-test/leaderboardBackfill.mjs && node .tmp-test/leaderboardBackfill.mjs
import assert from 'node:assert/strict';
import { backfillDays } from '@/services/leaderboard';

const at = (s: string) => new Date(`${s}T12:00:00`);
// Tue 17 Nov 2026: the month from the 1st (the week began Sat 14th, inside it) up to the 15th.
const nov17 = backfillDays(at('2026-11-17'));
assert.equal(nov17[0], '2026-11-01');
assert.equal(nov17.at(-1), '2026-11-15', 'today and yesterday go up on every push, not here');
assert.equal(nov17.length, 15);
// Tue 3 Nov: the week began Sat 31 Oct — before the month — so it starts there.
assert.deepEqual(backfillDays(at('2026-11-03')), ['2026-10-31', '2026-11-01']);
// Sun 1 Nov: the week began Sat 31 Oct = yesterday, which is pushed anyway → nothing older.
assert.deepEqual(backfillDays(at('2026-11-01')), []);
// Sat 14 Nov (week starts today): the month's 1st–12th.
assert.equal(backfillDays(at('2026-11-14')).length, 12);
console.log('leaderboardBackfill: ok');
