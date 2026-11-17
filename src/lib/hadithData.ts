/** Bundled hadith files (public/hadith) — shared by the page and the search worker. */
const BASE = `${import.meta.env.BASE_URL}hadith/`;

/** Fetch a bundled .gz file as text. Checks the gzip magic bytes: a server
 *  that already decoded it (Content-Encoding) hands back plain text. */
export async function fetchGzText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// `.gzip`, never `.gz`: the Android Gradle build un-gzips `*.gz` assets and
// drops the extension, so `.gz` files 404 inside the APK.
export const chunkPath = (book: number, chunk: number) => `b${book}/c${chunk}.json.gzip`;
