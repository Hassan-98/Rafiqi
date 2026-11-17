/**
 * Lightly format tafsir / dhikr text for comfortable reading: preserve the
 * source's own paragraphs, and if the text arrives as one long run-on block,
 * split it into paragraphs at sentence boundaries.
 *
 * Deliberately NO inline decoration (gold Quran-citation spans, quote
 * guillemets, attribution bolding). An earlier version did that with chained
 * regex replacements, but a later replacement would match the `class="t-…"`
 * attribute of a span an earlier step had just inserted and double-wrap it —
 * leaking literal `t-quran` text into the output and breaking contrast. Plain,
 * correct, readable paragraphs are what the content actually needs.
 */
export function formatTafsirHtml(html: string): string {
  if (!html) return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body><div id="root">${html}</div></body>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return escapeHtml(html);

  const hasStructure = root.querySelectorAll('p, br, div, li').length > 0;

  if (!hasStructure) {
    // One flat block → split into readable paragraphs at sentence ends or the
    // classic tafsir close "والله أعلم".
    const raw = root.textContent ?? '';
    const parts = raw
      .split(/(?:(?<=[.!؟])\s+(?=[؀-ۿ]))|(?<=والله أعلم)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    }
    return `<p>${escapeHtml(raw)}</p>`;
  }

  // Already-structured HTML: keep the text + basic block/line structure, but
  // drop any tags/attributes (classes, styles, scripts) so nothing from the
  // source can fight the app's theme or inject markup.
  return sanitizeStructure(root);
}

/** Rebuild only safe block structure (<p>, <br>) from arbitrary source HTML. */
function sanitizeStructure(root: HTMLElement): string {
  const blocks: string[] = [];
  const pushText = (el: Element) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) blocks.push(`<p>${escapeHtml(text)}</p>`);
  };

  // Treat each top-level block child as a paragraph; fall back to the whole
  // text if there are no element children.
  const blockEls = Array.from(root.children).filter(
    (c) => /^(p|div|li|section|article)$/i.test(c.tagName),
  );
  if (blockEls.length === 0) {
    const text = (root.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text ? `<p>${escapeHtml(text)}</p>` : '';
  }
  blockEls.forEach(pushText);
  return blocks.join('');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
