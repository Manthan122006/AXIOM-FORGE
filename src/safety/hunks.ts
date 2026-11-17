import { structuredPatch } from 'diff';

export interface RawHunk {
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines prefixed with ' ', '+', '-'. No "\ No newline" markers (handled separately). */
  lines: string[];
}

export class HunkConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HunkConflictError';
  }
}

interface Normalised {
  text: string;
  eol: '\n' | '\r\n';
  finalNewline: boolean;
}

function normalise(text: string): Normalised {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lf = text.replace(/\r\n/g, '\n');
  const finalNewline = lf.length === 0 || lf.endsWith('\n');
  return { text: finalNewline ? lf : `${lf}\n`, eol, finalNewline };
}

/** Lines of an LF-normalised text that ends with '\n' (empty text → []). */
function toLines(text: string): string[] {
  if (text === '') return [];
  return text.slice(0, -1).split('\n');
}

/**
 * Compute reviewable hunks between `base` and `proposed`.
 * Uses jsdiff's Myers diff with 3 lines of context (same as `git diff`).
 */
export function computeHunks(base: string, proposed: string, context = 3): RawHunk[] {
  const a = normalise(base);
  const b = normalise(proposed);
  const patch = structuredPatch('a', 'b', a.text, b.text, '', '', { context });
  return patch.hunks.map((h, index) => ({
    index,
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.filter((l) => !l.startsWith('\\')),
  }));
}

/**
 * Apply only the hunks whose index is in `accepted` to `base`.
 * Every hunk's old side (context + removed lines) must match `base` exactly, otherwise
 * HunkConflictError is thrown and nothing is produced — callers never write a partial result.
 */
export function applyHunks(base: string, proposed: string, hunks: RawHunk[], accepted: ReadonlySet<number>): string {
  const a = normalise(base);
  const b = normalise(proposed);
  const baseLines = toLines(a.text);
  const out: string[] = [];
  let cursor = 0; // index into baseLines
  let touchesEnd = false;
  let endAccepted = false;

  const ordered = [...hunks].sort((x, y) => x.oldStart - y.oldStart);
  for (const hunk of ordered) {
    const start = hunk.oldLines === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < cursor) throw new HunkConflictError(`Hunk ${hunk.index + 1} overlaps a previous hunk.`);
    const oldSide = hunk.lines.filter((l) => l[0] !== '+').map((l) => l.slice(1));
    const newSide = hunk.lines.filter((l) => l[0] !== '-').map((l) => l.slice(1));
    for (let i = 0; i < oldSide.length; i++) {
      if (baseLines[start + i] !== oldSide[i]) {
        throw new HunkConflictError(
          `Hunk ${hunk.index + 1} no longer matches the file at line ${start + i + 1}; the file changed since the proposal.`,
        );
      }
    }
    out.push(...baseLines.slice(cursor, start));
    const isAccepted = accepted.has(hunk.index);
    out.push(...(isAccepted ? newSide : oldSide));
    cursor = start + oldSide.length;
    if (cursor >= baseLines.length) {
      touchesEnd = true;
      endAccepted = isAccepted;
    }
  }
  out.push(...baseLines.slice(cursor));

  const finalNewline = touchesEnd && endAccepted ? b.finalNewline : a.finalNewline;
  let text = out.join('\n');
  if (out.length > 0 && finalNewline) text += '\n';
  return a.eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
}

/** Number of added/removed lines in a hunk, for review summaries. */
export function hunkStats(h: RawHunk): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of h.lines) {
    if (l[0] === '+') added++;
    else if (l[0] === '-') removed++;
  }
  return { added, removed };
}
