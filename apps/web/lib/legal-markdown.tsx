/**
 * Server-side markdown renderer for the /legal pages.
 *
 * Reads a canonical .md source from apps/web/legal/*.md and renders it
 * as accessible JSX. Kept minimal on purpose: no runtime deps, no client
 * bundle cost, no MDX toolchain. This is not a general-purpose markdown
 * engine; it handles exactly the subset used by our legal drafts:
 *
 *   - #, ##, ### headings
 *   - Paragraphs
 *   - Unordered lists (- item)
 *   - Bold via **...**, inline code via `...`, links via [text](url)
 *   - Pipe tables with a separator row
 *   - Horizontal rule (---)
 *
 * PRE-PROCESSING for the live public pages
 * ---------------------------------------
 * The source .md files carry the DRAFT FOR COUNSEL REVIEW banner as
 * their second paragraph, and inline [COUNSEL NOTE: ...] markers at
 * clauses where counsel is expected to weigh in. The public pages are
 * for real users, so both are stripped before rendering. The .md source
 * retains them for the next counsel round.
 */

import fs from 'fs';
import path from 'path';
import React from 'react';

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'rule' }
  | { kind: 'table'; header: string[]; rows: string[][] };

function stripCounselNotes(md: string): string {
  // Strip: [COUNSEL NOTE: ...] (may span multiple sentences, no closing bracket inside)
  let out = md.replace(/\s*\[COUNSEL NOTE:[^\]]*\]/g, '');
  // Strip the whole "DRAFT FOR COUNSEL REVIEW." banner paragraph.
  out = out.replace(/^\*\*DRAFT FOR COUNSEL REVIEW\.\*\*[^\n]*(?:\n[^\n]+)*/m, '');
  // Also strip a "Last updated: ... (draft)" line if present; layout injects a
  // canonical last-updated instead.
  out = out.replace(/^\*\*Last updated:\*\*[^\n]*\n?/m, '');
  return out.trim();
}

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();

    // horizontal rule
    if (line === '---') {
      blocks.push({ kind: 'rule' });
      i++;
      continue;
    }

    // heading
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! });
      i++;
      continue;
    }

    // unordered list
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^-\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // table
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1]!.trim())) {
      const header = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i]!.trim())) {
        rows.push(lines[i]!.trim().split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    // blank line
    if (!line) {
      i++;
      continue;
    }

    // paragraph: consume until blank line
    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,3})\s+/.test(lines[i]!.trim())) {
      paraLines.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join(' ') });
  }
  return blocks;
}

/**
 * Render inline formatting: **bold**, `code`, [text](url). Returns a JSX
 * fragment that is safe to embed inside <p>, <li>, <td>, etc.
 */
function renderInline(text: string, keyPrefix = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < text.length) {
    // link
    const linkMatch = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const isExternal = /^https?:/i.test(linkMatch[2]!);
      const href = linkMatch[2]!;
      out.push(
        <a
          key={`${keyPrefix}-l${n++}`}
          href={href}
          className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 transition hover:text-brand-200"
          {...(isExternal ? { rel: 'noopener noreferrer', target: '_blank' } : {})}
        >
          {linkMatch[1]}
        </a>,
      );
      i += linkMatch[0].length;
      continue;
    }
    // bold
    if (text.slice(i, i + 2) === '**') {
      const end = text.indexOf('**', i + 2);
      if (end > i) {
        out.push(
          <strong key={`${keyPrefix}-b${n++}`} className="font-semibold text-ink-primary">
            {text.slice(i + 2, end)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // inline code
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        out.push(
          <code
            key={`${keyPrefix}-c${n++}`}
            className="rounded bg-surface/60 px-1.5 py-0.5 text-[0.85em] text-ink-primary"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    // plain run: advance to next marker or end of string
    let next = text.length;
    for (const marker of ['**', '`', '[']) {
      const idx = text.indexOf(marker, i + 1);
      if (idx > 0 && idx < next) next = idx;
    }
    out.push(<React.Fragment key={`${keyPrefix}-t${n++}`}>{text.slice(i, next)}</React.Fragment>);
    i = next;
  }
  return out;
}

function renderBlocks(blocks: Block[]): React.ReactNode {
  return blocks.map((block, idx) => {
    switch (block.kind) {
      case 'rule':
        return <hr key={idx} className="my-8 border-surface-border" />;
      case 'heading': {
        const cls =
          block.level === 1
            ? 'mt-0 mb-3 text-3xl font-semibold tracking-tight text-ink-primary'
            : block.level === 2
              ? 'mt-10 mb-3 text-xl font-semibold text-ink-primary'
              : 'mt-6 mb-2 text-base font-semibold text-ink-primary';
        const inner = renderInline(block.text, `h${idx}`);
        if (block.level === 1) return <h1 key={idx} className={cls}>{inner}</h1>;
        if (block.level === 2) return <h2 key={idx} className={cls}>{inner}</h2>;
        return <h3 key={idx} className={cls}>{inner}</h3>;
      }
      case 'paragraph':
        return (
          <p key={idx} className="my-4 leading-7 text-ink-secondary">
            {renderInline(block.text, `p${idx}`)}
          </p>
        );
      case 'ul':
        return (
          <ul key={idx} className="my-4 list-disc space-y-1.5 pl-5 leading-7 text-ink-secondary">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, `p${idx}i${j}`)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={idx} className="my-4 list-decimal space-y-1.5 pl-5 leading-7 text-ink-secondary">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, `p${idx}i${j}`)}</li>
            ))}
          </ol>
        );
      case 'table':
        return (
          <div key={idx} className="my-6 overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface/50">
                <tr>
                  {block.header.map((h, j) => (
                    <th
                      key={j}
                      className="border-b border-surface-border px-3 py-2 text-left font-semibold text-ink-primary"
                    >
                      {renderInline(h, `p${idx}h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-surface-border last:border-b-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2 align-top text-ink-secondary">
                        {renderInline(cell, `p${idx}r${ri}c${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export function readLegalMarkdown(slug: 'terms' | 'privacy' | 'refunds' | 'organizer'): string {
  const filepath = path.join(process.cwd(), 'legal', `${slug}.md`);
  return fs.readFileSync(filepath, 'utf8');
}

export function LegalMarkdown({ source }: { source: string }) {
  const cleaned = stripCounselNotes(source);
  const blocks = parseBlocks(cleaned);
  return <>{renderBlocks(blocks)}</>;
}
