import assert from 'node:assert/strict';
import {
  clockToMin,
  episodesIn,
  jsonAfter,
  parseOpenGraph,
  parseYoutubePlaylist,
  parseYoutubeVideo,
  totalMinutes,
  typicalMinutes,
  youtubeRef,
} from '@/services/lessonLink';

// ── which links are a series ──
assert.deepEqual(youtubeRef('https://www.youtube.com/playlist?list=PLabc'), { video: undefined, list: 'PLabc' });
assert.deepEqual(youtubeRef('https://youtu.be/vid123?t=4'), { video: 'vid123', list: undefined });
assert.deepEqual(youtubeRef('m.youtube.com/watch?v=vid123&list=PLabc&index=2'), { video: 'vid123', list: 'PLabc' }, 'a lesson inside a series: both known — inspectLink reads the LESSON (owner 2026-11-19)');
assert.deepEqual(youtubeRef('https://www.youtube.com/watch?v=vid123&list=RDvid123'), { video: 'vid123', list: undefined }, 'a mix is not a series');
assert.deepEqual(youtubeRef('https://youtube.com/shorts/s1'), { video: 's1', list: undefined });
assert.deepEqual(youtubeRef('https://www.youtube.com/live/l1?si=x'), { video: 'l1', list: undefined });
assert.equal(youtubeRef('https://www.youtube.com/@channel'), null, 'a channel → read as a page');
assert.equal(youtubeRef('https://t.me/somechannel/12'), null);
assert.equal(youtubeRef('not a url'), null);

// ── lengths ──
assert.equal(clockToMin('15:40'), 16);
assert.equal(clockToMin('1:02:03'), 62);
assert.equal(clockToMin('0:20'), 1, 'at least a minute');
assert.equal(clockToMin('LIVE'), undefined);
assert.equal(clockToMin(undefined), undefined);

// ── the inline JSON, braces and «};» inside strings included ──
const tricky = { a: 'x}; </script> {y', b: { c: '\\"q\\"' } };
assert.deepEqual(jsonAfter(`<script>var ytInitialData = ${JSON.stringify(tricky)};</script>`, 'ytInitialData'), tricky);
assert.equal(jsonAfter('<p>nothing here</p>', 'ytInitialData'), null);

// ── a playlist page (today's «lockup» shape, as served 2026-11) ──
const lockup = (id: string, title: string, badge: string) => ({
  lockupViewModel: {
    contentId: id,
    contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: badge } }] } }] } },
    metadata: {
      lockupMetadataViewModel: {
        title: { content: title },
        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'الشيخ فلان' } }] }] } },
      },
    },
  },
});
const playlistData = {
  metadata: { playlistMetadataRenderer: { title: 'شرح الأربعين النووية' } },
  contents: [
    lockup('v1', 'الدرس الأول: إنما الأعمال بالنيات', '45:10'),
    lockup('v2', 'الدرس الثاني', '1:02:00'),
    lockup('v3', 'الدرس الثالث', '50:00'),
    { lockupViewModel: { contentId: 'PLother', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' } },
    { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'TOKEN1', request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } } },
  ],
};
const page = parseYoutubePlaylist(`<script>var ytInitialData = ${JSON.stringify(playlistData)};</script>"INNERTUBE_CLIENT_VERSION":"2.2026"`);
assert.ok(page);
assert.equal(page.info.kind, 'playlist');
assert.equal(page.info.title, 'شرح الأربعين النووية');
assert.equal(page.info.author, 'الشيخ فلان');
assert.equal(page.info.episodes?.length, 3, 'only videos, not other playlists');
assert.deepEqual(page.info.episodes?.[1], { title: 'الدرس الثاني', durationMin: 62, url: 'https://www.youtube.com/watch?v=v2' });
assert.equal(page.continuation, 'TOKEN1');
assert.equal(page.clientVersion, '2.2026');
assert.equal(totalMinutes(page.info.episodes ?? []), 45 + 62 + 50);
assert.equal(typicalMinutes(page.info.episodes ?? []), 50, 'the median lesson');
assert.equal(typicalMinutes([{ title: 'x' }]), undefined);

// …and the older renderer shape, in case YouTube serves it again.
assert.deepEqual(episodesIn({ x: [{ playlistVideoRenderer: { videoId: 'o1', title: { runs: [{ text: 'قديم' }] }, lengthSeconds: '600' } }] }), [
  { title: 'قديم', durationMin: 10, url: 'https://www.youtube.com/watch?v=o1' },
]);
assert.equal(parseYoutubePlaylist('<html>consent wall</html>'), null);

// ── one lesson ──
const player = { videoDetails: { videoId: 'v1', title: ' درس في التوحيد ', author: 'قناة العلم', lengthSeconds: '3125' } };
assert.deepEqual(parseYoutubeVideo(`<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = 1;</script>`), {
  kind: 'video',
  title: 'درس في التوحيد',
  author: 'قناة العلم',
  durationMin: 52,
});
assert.equal(parseYoutubeVideo('<html></html>'), null);

// ── any other page ──
assert.deepEqual(parseOpenGraph('<meta property="og:title" content="دورة الفقه &amp; أصوله"><meta property="og:site_name" content="Telegram">'), {
  kind: 'page',
  title: 'دورة الفقه & أصوله',
  durationMin: undefined,
});
assert.equal(parseOpenGraph('<head><title>درس</title><meta itemprop="duration" content="PT1H5M"></head>')?.durationMin, 65);
assert.equal(parseOpenGraph('<meta content="90" property="og:video:duration"><title>x</title>')?.durationMin, 2, 'content before property');
assert.equal(parseOpenGraph('<html></html>'), null);

console.log('lessonLink: all checks passed');
