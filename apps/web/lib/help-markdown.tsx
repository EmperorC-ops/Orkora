import React from 'react';

/**
 * Small Markdown renderer for help content, safe to use in client components
 * (no fs). Supports: "## " and "### " headings, paragraphs (consecutive lines
 * joined with line breaks), "- " and "1. " lists, pipe tables with a separator
 * row, **bold**, `code` and [text](href) links. Anything else renders as text,
 * so content can never inject HTML.
 */

type Block =
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

export function parseHelpBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line || line === '---') {
      i++;
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: h[1]!.length === 2 ? 'h2' : 'h3', text: h[2]! });
      i++;
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^-\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }
    if (
      /^\|.*\|$/.test(line) &&
      i + 1 < lines.length &&
      /^\|[-:\s|]+\|$/.test(lines[i + 1]!.trim())
    ) {
      const split = (l: string) => l.trim().split('|').slice(1, -1).map((c) => c.trim());
      const header = split(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i]!.trim())) {
        rows.push(split(lines[i]!));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!.trim();
      if (!l || /^#{2,3}\s/.test(l) || /^-\s+/.test(l) || /^\d+\.\s+/.test(l) || /^\|.*\|$/.test(l)) break;
      para.push(l);
      i++;
    }
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buf = '';
  let n = 0;
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
    if (link) {
      flush();
      const href = link[2]!;
      // Only same-site paths and mailto links; anything else renders as text.
      if (href.startsWith('/') || href.startsWith('mailto:')) {
        out.push(
          <a key={`${key}-a${n++}`} href={href} className="font-semibold text-brand-300 underline hover:text-brand-200">
            {link[1]}
          </a>,
        );
      } else {
        out.push(link[1]!);
      }
      i += link[0].length;
      continue;
    }
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push(
          <strong key={`${key}-b${n++}`} className="font-semibold text-ink-primary">
            {text.slice(i + 2, end)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push(
          <code key={`${key}-c${n++}`} className="rounded bg-surface/60 px-1.5 py-0.5 text-[0.85em] text-ink-primary">
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

export function HelpMarkdown({ source }: { source: string }) {
  const blocks = parseHelpBlocks(source);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-secondary">
      {blocks.map((b, bi) => {
        const k = `b${bi}`;
        switch (b.kind) {
          case 'h2':
            return (
              <h2 key={k} className="pt-6 text-xl font-semibold text-ink-primary">
                {inline(b.text, k)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={k} className="pt-2 text-base font-semibold text-ink-primary">
                {inline(b.text, k)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={k} className="list-disc space-y-1 pl-5">
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `${k}-${ii}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={k} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, ii) => (
                  <li key={ii}>{inline(it, `${k}-${ii}`)}</li>
                ))}
              </ol>
            );
          case 'table':
            return (
              <div key={k} className="overflow-x-auto rounded-xl border border-surface-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface/60 text-xs uppercase tracking-wider text-ink-muted">
                    <tr>
                      {b.header.map((h, hi) => (
                        <th key={hi} className="px-3 py-2">
                          {inline(h, `${k}-h${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {b.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci} className="px-3 py-2 align-top">
                            {inline(c, `${k}-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={k}>
                {b.lines.map((l, li) => (
                  <React.Fragment key={li}>
                    {li > 0 ? <br /> : null}
                    {inline(l, `${k}-${li}`)}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
