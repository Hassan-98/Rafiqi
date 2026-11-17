// npx esbuild scripts/postPrayer.test.ts --bundle --format=esm --platform=node --alias:@=./src --outfile=.tmp-test/postPrayer.test.mjs && node .tmp-test/postPrayer.test.mjs
import assert from 'node:assert/strict';
import { postPrayerAdhkar } from '@/data/adhkar';
import { postPrayerItems, prayerForAdhkar } from '@/components/adhkar/postPrayer';

const ids = (p: Parameters<typeof postPrayerItems>[0]) => postPrayerItems(p, postPrayerAdhkar).map((x) => x.id);
const count = (p: Parameters<typeof postPrayerItems>[0], id: string) => postPrayerItems(p, postPrayerAdhkar).find((x) => x.id === id)?.count;

// الفجر: everything; المغرب: all but the Fajr-only du'a; the others: neither the 10 tahlil nor «أجرني من النار».
assert.equal(ids('fajr').length, postPrayerAdhkar.length);
assert.ok(ids('fajr').includes('postPrayer-ib83'));
assert.ok(!ids('maghrib').includes('postPrayer-ib83'));
assert.ok(ids('maghrib').includes('postPrayer-ib82') && ids('maghrib').includes('postPrayer-ib84'));
for (const p of ['dhuhr', 'asr', 'isha'] as const) {
  assert.ok(!ids(p).some((id) => ['postPrayer-ib82', 'postPrayer-ib83', 'postPrayer-ib84'].includes(id)), p);
  assert.equal(count(p, 'postPrayer-ib80'), 1, `${p} المعوذات once`);
}
assert.equal(count('fajr', 'postPrayer-ib80'), 3);
assert.equal(count('maghrib', 'postPrayer-ib80'), 3);

// The prayer that just passed; before Fajr it is last night's العشاء.
const day = (h: number, m = 0) => new Date(2026, 10, 8, h, m);
const t = { fajr: day(4, 40), dhuhr: day(11, 40), asr: day(14, 45), maghrib: day(17, 5), isha: day(18, 25) };
assert.deepEqual(prayerForAdhkar(day(12, 0), t), { prayer: 'dhuhr', dateKey: '2026-11-08' });
assert.deepEqual(prayerForAdhkar(day(23, 0), t), { prayer: 'isha', dateKey: '2026-11-08' });
assert.deepEqual(prayerForAdhkar(day(2, 0), t), { prayer: 'isha', dateKey: '2026-11-07' });

console.log('postPrayer: ok');
