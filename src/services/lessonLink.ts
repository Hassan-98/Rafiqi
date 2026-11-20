import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * «حلقات العلم»: read a pasted lesson link — one lesson or a series, its title,
 * teacher, episodes and their lengths — so adding a circle is one paste.
 *
 * Keyless: YouTube's own pages (ytInitialData / ytInitialPlayerResponse) and the
 * page's OpenGraph tags elsewhere. Browsers can't read them (CORS), so the
 * request goes through the shell's native HTTP: CapacitorHttp on Android, a
 * `desktopShell.fetchText` bridge on desktop when the shell has one. Anything
 * that fails returns null and the form stays manual.
 * Parsing is pure and tested: scripts/lessonLink.test.ts.
 */

export interface LessonEpisode {
  title: string;
  durationMin?: number;
  url?: string;
}

export interface LinkInfo {
  kind: 'video' | 'playlist' | 'page';
  title?: string;
  /** Channel / teacher. */
  author?: string;
  /** One lesson's length. */
  durationMin?: number;
  /** A series, in order. */
  episodes?: LessonEpisode[];
}

// ── YouTube URLs ─────────────────────────────────────────────────────────────

/** Auto-made lists (mixes, watch later, liked) are not a series. */
const NOT_A_SERIES = /^(RD|UL|LL|WL|LM)/;

/** The video and/or playlist a YouTube link points at; null for other sites. */
export function youtubeRef(link: string): { video?: string; list?: string } | null {
  let u: URL;
  try {
    u = new URL(/^https?:/i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  const list = u.searchParams.get('list') ?? undefined;
  const path = u.pathname.split('/').filter(Boolean);
  const video =
    host === 'youtu.be'
      ? path[0]
      : (u.searchParams.get('v') ?? (['shorts', 'live', 'embed', 'v'].includes(path[0]) ? path[1] : undefined));
  const out = { video: video || undefined, list: list && !NOT_A_SERIES.test(list) ? list : undefined };
  return out.video || out.list ? out : null;
}

// ── parsing (pure) ───────────────────────────────────────────────────────────

/** The JSON object assigned right after `marker` in a page's inline script (brace-balanced, string-aware). */
export function jsonAfter(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf('{', at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** «1:02:03» / «15:40» → minutes (at least one). */
export function clockToMin(text: string | undefined): number | undefined {
  if (!text || !/^\d+(:\d{1,2}){1,2}$/.test(text.trim())) return undefined;
  const sec = text
    .trim()
    .split(':')
    .reduce((s, p) => s * 60 + Number(p), 0);
  return Math.max(1, Math.round(sec / 60));
}

const secToMin = (s: unknown): number | undefined => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n / 60)) : undefined;
};

/** Every object under `o` that has `key`, depth-first in document order. */
function collect<T>(o: unknown, key: string, out: T[] = []): T[] {
  if (!o || typeof o !== 'object') return out;
  const rec = o as Record<string, unknown>;
  if (key in rec) out.push(rec[key] as T);
  for (const k in rec) collect(rec[k], key, out);
  return out;
}

interface Lockup {
  contentId?: string;
  contentType?: string;
  metadata?: { lockupMetadataViewModel?: { title?: { content?: string } } };
  contentImage?: unknown;
}
interface OldRenderer {
  videoId?: string;
  title?: { runs?: { text: string }[]; simpleText?: string };
  lengthSeconds?: string;
}

/** A playlist page's (or a continuation's) videos, both the current «lockup» and the older renderer shape. */
export function episodesIn(data: unknown): LessonEpisode[] {
  const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
  const lockups = collect<Lockup>(data, 'lockupViewModel')
    .filter((l) => l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && l.contentId)
    .map((l) => ({
      title: l.metadata?.lockupMetadataViewModel?.title?.content?.trim() ?? '',
      durationMin: clockToMin(collect<{ text?: string }>(l.contentImage, 'thumbnailBadgeViewModel')[0]?.text),
      url: watch(l.contentId!),
    }));
  if (lockups.length) return lockups;
  return collect<OldRenderer>(data, 'playlistVideoRenderer')
    .filter((r) => r.videoId)
    .map((r) => ({
      title: (r.title?.simpleText ?? r.title?.runs?.map((x) => x.text).join('') ?? '').trim(),
      durationMin: secToMin(r.lengthSeconds),
      url: watch(r.videoId!),
    }));
}

const continuationOf = (data: unknown): string | undefined =>
  collect<{ token?: string; request?: string }>(data, 'continuationCommand').find((c) => c.request === 'CONTINUATION_REQUEST_TYPE_BROWSE')?.token;

export function parseYoutubePlaylist(html: string): { info: LinkInfo; continuation?: string; clientVersion?: string } | null {
  const data = jsonAfter(html, 'ytInitialData');
  if (!data) return null;
  const episodes = episodesIn(data);
  if (!episodes.length) return null;
  const meta = collect<{ title?: string }>(data, 'playlistMetadataRenderer')[0];
  const author =
    collect<{ text?: { content?: string } }>(collect(data, 'lockupMetadataViewModel')[0], 'metadataParts')
      .flat()
      .map((p) => (p as { text?: { content?: string } }).text?.content)
      .find(Boolean) ?? undefined;
  return {
    info: { kind: 'playlist', title: meta?.title?.trim(), author, episodes },
    continuation: continuationOf(data),
    clientVersion: html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1],
  };
}

export function parseYoutubeVideo(html: string): LinkInfo | null {
  const player = jsonAfter(html, 'ytInitialPlayerResponse') as { videoDetails?: { title?: string; author?: string; lengthSeconds?: string } } | null;
  const v = player?.videoDetails;
  if (!v?.title) return null;
  return { kind: 'video', title: v.title.trim(), author: v.author?.trim(), durationMin: secToMin(v.lengthSeconds) };
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** Any other page: its OpenGraph / <title>, and a duration when it states one. */
export function parseOpenGraph(html: string): LinkInfo | null {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${name}["']`, 'i'))?.[1];
  const title = meta('og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  if (!title?.trim()) return null;
  // «video:duration» is seconds; itemprop duration is ISO 8601 (PT1H2M3S).
  const iso = meta('duration')?.match(/^P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  const durationMin = secToMin(meta('og:video:duration') ?? meta('video:duration')) ?? (iso ? secToMin(+(iso[1] ?? 0) * 3600 + +(iso[2] ?? 0) * 60 + +(iso[3] ?? 0)) : undefined);
  // og:site_name is the platform («YouTube», «Telegram»), not the teacher — left out.
  return { kind: 'page', title: decode(title), durationMin };
}

/** «سلسلة من ٢٤ درساً · ١٨ ساعة» needs the total: minutes of the known lengths. */
export const totalMinutes = (eps: LessonEpisode[]): number => eps.reduce((s, e) => s + (e.durationMin ?? 0), 0);

/** The usual length of a series' lesson (median), snapped to nothing — the form shows it as is. */
export function typicalMinutes(eps: LessonEpisode[]): number | undefined {
  const m = eps.map((e) => e.durationMin).filter((x): x is number => !!x).sort((a, b) => a - b);
  return m.length ? m[Math.floor(m.length / 2)] : undefined;
}

// ── fetching (native HTTP per shell) ─────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
// The desktop page (one parser), in Arabic, past the EU consent wall.
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'ar,en;q=0.8', Cookie: 'SOCS=CAI' };

interface DesktopFetch {
  fetchText?: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<string>;
}

async function request(url: string, init?: { method?: 'POST'; body?: unknown }): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.request({
        url,
        method: init?.method ?? 'GET',
        headers: init?.body ? { ...HEADERS, 'Content-Type': 'application/json' } : HEADERS,
        data: init?.body,
        responseType: 'text',
        connectTimeout: 12_000,
        readTimeout: 12_000,
      });
      if (res.status < 200 || res.status >= 300) return null;
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }
    const shell = (window as unknown as { desktopShell?: DesktopFetch }).desktopShell;
    if (shell?.fetchText) {
      return await shell.fetchText(url, {
        method: init?.method,
        headers: init?.body ? { ...HEADERS, 'Content-Type': 'application/json' } : HEADERS,
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
    }
    // A plain browser can't read YouTube (CORS): in development the Vite server
    // reads it for us (vite.config.ts devFetchText); a built web page has no way.
    if (import.meta.env.DEV) {
      const res = await fetch('/__fetch-text', {
        method: 'POST',
        body: JSON.stringify({
          url,
          init: {
            method: init?.method,
            headers: init?.body ? { ...HEADERS, 'Content-Type': 'application/json' } : HEADERS,
            body: init?.body ? JSON.stringify(init.body) : undefined,
          },
        }),
      });
      return res.ok ? await res.text() : null;
    }
    const res = await fetch(url, init?.body ? { method: 'POST', body: JSON.stringify(init.body), headers: { 'Content-Type': 'application/json' } } : undefined);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Can this shell read other sites at all? (The form says so instead of spinning for nothing.) */
export const canInspectLinks = (): boolean =>
  import.meta.env.DEV ||
  Capacitor.isNativePlatform() ||
  !!(typeof window !== 'undefined' && (window as unknown as { desktopShell?: DesktopFetch }).desktopShell?.fetchText);

/** ponytail: a series is read up to MAX_EPISODES (5 continuation pages); longer ones keep the rest manual. */
const MAX_EPISODES = 500;

/** Read a lesson link. null = nothing could be read (offline, blocked, unknown page). */
export async function inspectLink(link: string): Promise<LinkInfo | null> {
  const yt = youtubeRef(link);
  // A video link is that ONE lesson even when it also names its playlist
  // (watch?v=…&list=…, owner 2026-11-19); only a playlist link is a series.
  if (yt?.list && !yt.video) {
    const html = await request(`https://www.youtube.com/playlist?list=${encodeURIComponent(yt.list)}&hl=ar`);
    const page = html ? parseYoutubePlaylist(html) : null;
    if (page) {
      const episodes = [...(page.info.episodes ?? [])];
      let token = page.continuation;
      while (token && episodes.length < MAX_EPISODES) {
        const json = await request('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
          method: 'POST',
          body: { context: { client: { clientName: 'WEB', clientVersion: page.clientVersion ?? '2.20261118.01.00', hl: 'ar' } }, continuation: token },
        });
        let data: unknown = null;
        try {
          data = json ? JSON.parse(json) : null;
        } catch {
          /* stop here */
        }
        const more = data ? episodesIn(data) : [];
        if (!more.length) break;
        episodes.push(...more);
        token = continuationOf(data);
      }
      return { ...page.info, episodes };
    }
    return null;
  }
  if (yt?.video) {
    const html = await request(`https://www.youtube.com/watch?v=${encodeURIComponent(yt.video)}&hl=ar`);
    return html ? parseYoutubeVideo(html) : null;
  }
  const html = await request(/^https?:/i.test(link) ? link : `https://${link}`);
  return html ? parseOpenGraph(html) : null;
}
