'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

function renderInlineMarkdown(line: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex =
    /(`[^`\n]+`)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*\n]+)\*\*)|(__([^_\n]+)__)|(\*([^*\n]+)\*)|(https?:\/\/[^\s<>"')]+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index));
    }
    const key = `${keyPrefix}-${tokenIdx++}`;
    if (match[1]) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[12px] text-[#0F172A]"
        >
          {match[1].slice(1, -1)}
        </code>
      );
    } else if (match[2] && match[4]) {
      const safeHref = match[4];
      nodes.push(
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#1553A2] underline decoration-blue-300 underline-offset-2 hover:text-[#1E3A8A]"
        >
          {match[3]}
        </a>
      );
    } else if (match[5] || match[7]) {
      const boldText = match[6] || match[8] || '';
      nodes.push(
        <strong key={key} className="font-bold text-[#0F172A]">
          {boldText}
        </strong>
      );
    } else if (match[9]) {
      nodes.push(
        <em key={key} className="italic text-slate-700">
          {match[10]}
        </em>
      );
    } else if (match[11]) {
      const rawUrl = match[11];
      const cleanedUrl = rawUrl.replace(/[.,;:!?]+$/, '');
      const trailing = rawUrl.slice(cleanedUrl.length);
      nodes.push(
        <React.Fragment key={key}>
          <a
            href={cleanedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-medium text-[#1553A2] underline decoration-blue-300 underline-offset-2 hover:text-[#1E3A8A]"
          >
            {cleanedUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx));
  }
  return nodes.length > 0 ? nodes : [line];
}

function ChatCodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={() => {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
              void navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed select-text">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseMarkdownTableCells(rowLine: string): string[] {
  const trimmed = rowLine.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

export function renderChatMarkdown(text: string): React.ReactNode {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      const codeLines: string[] = [];
      const startIdx = i;
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(<ChatCodeBlock key={`code-${startIdx}`} lang={lang} code={codeLines.join('\n')} />);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*$/.test(lines[i + 1])
    ) {
      const tableStart = i;
      const headers = parseMarkdownTableCells(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
        bodyRows.push(parseMarkdownTableCells(lines[i]));
        i += 1;
      }
      blocks.push(
        <div
          key={`tbl-${tableStart}`}
          className="my-2 overflow-x-auto rounded-xl border border-slate-200 bg-white"
        >
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="bg-slate-100 text-[#0F172A]">
              <tr>
                {headers.map((h, hIdx) => (
                  <th
                    key={`th-${tableStart}-${hIdx}`}
                    className="border-b border-slate-200 px-3 py-1.5 font-bold whitespace-nowrap"
                  >
                    {renderInlineMarkdown(h, `th-${tableStart}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyRows.map((row, rIdx) => (
                <tr key={`tr-${tableStart}-${rIdx}`} className="hover:bg-slate-50/70">
                  {headers.map((_, cIdx) => (
                    <td
                      key={`td-${tableStart}-${rIdx}-${cIdx}`}
                      className="px-3 py-1.5 text-slate-700 align-top"
                    >
                      {renderInlineMarkdown(row[cIdx] ?? '', `td-${tableStart}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*(?:---+|===+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-2 border-slate-200" />);
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls =
        level === 1
          ? 'text-[15px] font-extrabold text-[#0F172A] pt-1'
          : level === 2
            ? 'text-[14px] font-extrabold text-[#0F172A] pt-0.5'
            : 'text-[13px] font-bold text-[#17253F]';
      blocks.push(
        <div key={`h-${i}`} className={cls}>
          {renderInlineMarkdown(headingMatch[2].trim(), `h-${i}`)}
        </div>
      );
      i += 1;
      continue;
    }

    const bulletMatch = line.match(/^(\s*)(?:[-*•])\s+(.+)$/);
    if (bulletMatch) {
      const listItems: Array<{ indent: boolean; content: string; lineNo: number }> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:[-*•])\s+(.+)$/);
        if (!m) break;
        listItems.push({ indent: m[1].length >= 2, content: m[2], lineNo: i });
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${listItems[0].lineNo}`} className="space-y-1 py-0.5">
          {listItems.map((item) => (
            <li
              key={`li-${item.lineNo}`}
              className={`flex items-start gap-2 ${item.indent ? 'pl-4 text-[12.5px] text-slate-700' : ''}`}
            >
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span className="min-w-0 flex-1">
                {renderInlineMarkdown(item.content, `li-${item.lineNo}`)}
              </span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    const orderedMatch = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      const orderedItems: Array<{ num: string; content: string; lineNo: number }> = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(\d+)[.)]\s+(.+)$/);
        if (!m) break;
        orderedItems.push({ num: m[1], content: m[2], lineNo: i });
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${orderedItems[0].lineNo}`} className="space-y-1 py-0.5">
          {orderedItems.map((item) => (
            <li key={`oli-${item.lineNo}`} className="flex items-start gap-2">
              <span className="shrink-0 font-bold text-[#1553A2]">{item.num}.</span>
              <span className="min-w-0 flex-1">
                {renderInlineMarkdown(item.content, `oli-${item.lineNo}`)}
              </span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInlineMarkdown(line, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <div className="space-y-1.5">{blocks}</div>;
}
