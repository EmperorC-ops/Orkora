/**
 * Minimal Markdown -> HTML for campaign bodies.
 *
 * Slice A is intentionally small: paragraphs, bold, italic, links,
 * line breaks, ordered + unordered lists. NO raw HTML pass-through
 * (XSS hazard), NO images (Slice B adds R2-hosted images with a
 * paste-from-URL flow), NO tables (Slice C if anyone asks).
 *
 * Everything else in the body is rendered as plain text inside <p>.
 * The wrap template adds the brand header + footer + unsubscribe link.
 */

export function markdownToHtml(input: string): string {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Unordered list block
    if (/^[*-]\s/.test(trimmed)) {
      out.push('<ul>');
      while (i < lines.length && /^[*-]\s/.test((lines[i] ?? '').trim())) {
        const item = (lines[i] ?? '').trim().replace(/^[*-]\s/, '');
        out.push(`  <li>${inline(item)}</li>`);
        i++;
      }
      out.push('</ul>');
      continue;
    }

    // Ordered list block
    if (/^\d+\.\s/.test(trimmed)) {
      out.push('<ol>');
      while (i < lines.length && /^\d+\.\s/.test((lines[i] ?? '').trim())) {
        const item = (lines[i] ?? '').trim().replace(/^\d+\.\s/, '');
        out.push(`  <li>${inline(item)}</li>`);
        i++;
      }
      out.push('</ol>');
      continue;
    }

    // Paragraph: collect consecutive non-empty lines, join with <br>
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^[*-]\s/.test((lines[i] ?? '').trim()) &&
      !/^\d+\.\s/.test((lines[i] ?? '').trim())
    ) {
      para.push(inline((lines[i] ?? '').trim()));
      i++;
    }
    if (para.length > 0) {
      out.push(`<p>${para.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/**
 * Inline transforms: bold (**x**), italic (*x*), link ([text](url)).
 * All text passes through escape() first so any embedded < > & are
 * neutralised before transformation. Token swaps happen later, per
 * recipient, AFTER markdown rendering.
 */
function inline(text: string): string {
  let s = escape(text);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safe = sanitizeUrl(url);
    return `<a href="${safe}" style="color:#6D28D9;">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only allow http(s) + mailto + tel. Anything else (javascript:,
 * data:) becomes #.
 */
function sanitizeUrl(url: string): string {
  const safe = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : '#';
  // We already passed url through escape() via the outer inline()
  // call, so quotes and angle brackets are already entity-encoded.
  return safe;
}

/**
 * Personalisation token swap. Runs per-recipient, AFTER markdown
 * rendering, so any tokens inside body remain literal in the markdown
 * source and only get expanded at send time. Unknown tokens stay as-is
 * (visible) so the organizer sees the typo in their inbox preview.
 */
export function applyTokens(html: string, ctx: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, name) => {
    const v = ctx[name];
    return v === undefined ? m : escape(v);
  });
}
