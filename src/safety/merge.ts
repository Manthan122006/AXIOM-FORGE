import { diffArrays } from 'diff';

/**
 * Merge several independently proposed versions of ONE file into a single proposal.
 *
 * Each source was computed against the same base text (the file as it was when the turn paused).
 * We diff base → source line by line, turn each difference into an operation on a base line range,
 * and apply every operation at once. Two operations from different sources CONFLICT when their base
 * ranges overlap or touch (adjacent lines, or insertions at the same point): that is the same
 * conservative rule `git merge` uses, so nothing is silently overwritten or reordered. Identical
 * operations proposed twice are applied once.
 */
export interface MergeSource {
  id: string;
  text: string;
}

export interface LineOp {
  source: string;
  /** Base line range [start, end), 0-based. start === end means a pure insertion before `start`. */
  start: number;
  end: number;
  lines: string[];
}

export type MergeResult =
  | { ok: true; text: string; ops: LineOp[]; merged: string[]; refused: MergeConflict[] }
  | { ok: false; refused: MergeConflict[] };

export interface MergeConflict {
  /** The source that could not be merged. */
  source: string;
  /** The already-merged source it collides with. */
  with: string;
  /** 1-based base line range of the collision, for the message shown to the model and user. */
  lines: [number, number];
  reason: string;
}

const toLf = (t: string) => t.replace(/\r\n/g, '\n');

/** Line operations that turn `base` into `next` (both LF, split on '\n' so a final newline is a trailing ''). */
export function lineOps(base: string[], next: string[], source: string): LineOp[] {
  const out: LineOp[] = [];
  let i = 0;
  let cur: LineOp | null = null;
  for (const c of diffArrays(base, next)) {
    if (!c.added && !c.removed) {
      if (cur) out.push(cur);
      cur = null;
      i += c.value.length;
      continue;
    }
    cur ??= { source, start: i, end: i, lines: [] };
    if (c.removed) {
      i += c.value.length;
      cur.end = i;
    } else cur.lines.push(...c.value);
  }
  if (cur) out.push(cur);
  return out;
}

const same = (a: LineOp, b: LineOp) => a.start === b.start && a.end === b.end && a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i]);
/** Overlapping or touching ranges (conservative: adjacent edits are a conflict too). */
const collides = (a: LineOp, b: LineOp) => a.start <= b.end && b.start <= a.end;

/**
 * Merge sources in order. A source whose changes collide with an earlier accepted source is refused
 * as a whole (never partially applied) and reported, so the caller can deny that tool call with a
 * reason the model can act on. `ok` is false only if no source could be merged.
 */
export function mergeFileVersions(base: string, sources: MergeSource[]): MergeResult {
  const crlf = base.includes('\r\n');
  const baseLines = toLf(base).split('\n');
  const accepted: LineOp[] = [];
  const merged: string[] = [];
  const refused: MergeConflict[] = [];

  for (const s of sources) {
    const ops = lineOps(baseLines, toLf(s.text).split('\n'), s.id);
    if (ops.length === 0) {
      refused.push({ source: s.id, with: s.id, lines: [1, 1], reason: 'it does not change the file' });
      continue;
    }
    const fresh: LineOp[] = [];
    let clash: MergeConflict | null = null;
    for (const op of ops) {
      const dup = accepted.find((a) => same(a, op));
      if (dup) continue; // identical change already present
      const hit = accepted.find((a) => collides(a, op));
      if (hit) {
        clash = {
          source: s.id,
          with: hit.source,
          lines: [Math.min(hit.start, op.start) + 1, Math.max(hit.end, op.end, Math.min(hit.start, op.start) + 1)],
          reason: 'it changes the same or adjacent lines as an earlier proposal for this file',
        };
        break;
      }
      fresh.push(op);
    }
    if (clash) {
      refused.push(clash);
      continue;
    }
    accepted.push(...fresh);
    merged.push(s.id);
  }

  if (merged.length === 0) return { ok: false, refused };
  const lines = [...baseLines];
  for (const op of [...accepted].sort((a, b) => b.start - a.start || b.end - a.end)) lines.splice(op.start, op.end - op.start, ...op.lines);
  const text = lines.join('\n');
  return { ok: true, text: crlf ? text.replace(/\n/g, '\r\n') : text, ops: accepted, merged, refused };
}
