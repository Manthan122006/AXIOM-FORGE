import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ContextItem, ContextReceipt, ContextSignal, ExcludedItem, RelevanceCategory } from '../shared/contracts';
import type { FileEntry, RepoIndex } from './indexer';
import { neighbours, type RelationGraph } from './relations';
import { findSymbol, type SymbolIndex } from './symbols';

export const STRATEGY =
  'Hybrid local retrieval: explicit @mentions and the editor selection are always included; other files are scored by ' +
  'IDF-weighted keyword hits, path/name matches, symbol definitions, one-hop import neighbours, and test/doc pairing; ' +
  'then deduplicated and packed greedily into a token budget, sending outlines plus focused line windows for large files.';

export interface AssembleInput {
  task: string;
  mentions?: Array<{ kind: 'file' | 'symbol'; value: string }>;
  selection?: { rel: string; startLine: number; endLine: number };
  budgetTokens?: number;
  perFileCapTokens?: number;
  maxItems?: number;
}

export interface AssembleOutput {
  receipt: ContextReceipt;
  /** Text bundle for the model: file headers + line-numbered content/outlines. */
  bundle: string;
}

const STOP = new Set(
  ('a an and are as at be by can do does for from has have how i in into is it its it\'s must new not of on or ' +
    'our should so that the their then there these this to use used using via was we were what when which while ' +
    'who will with would also any all each every other as well add make makes made update updates prints print value values ' +
    'loaded alongside covered appear appears containing contain contains treat treated list well like same')
    .split(/\s+/),
);

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Pull search terms from a natural-language task: identifiers, words, and quoted strings. */
export function extractTerms(task: string): string[] {
  const terms = new Set<string>();
  for (const q of task.matchAll(/["'`]([^"'`]{2,40})["'`]/g)) terms.add(q[1]!.toLowerCase());
  for (const raw of task.split(/[^A-Za-z0-9_\-.]+/)) {
    const w = raw.replace(/^[-.]+|[-.]+$/g, '').replace(/'s$/, '');
    if (w.length < 3) continue;
    const lw = w.toLowerCase();
    if (STOP.has(lw)) continue;
    terms.add(lw);
    // snake_case / dotted / hyphenated identifiers → parts too
    for (const part of lw.split(/[_.\-]/)) if (part.length >= 3 && !STOP.has(part)) terms.add(part);
    // simple plural/verb stemming
    if (lw.endsWith('s') && lw.length > 4) terms.add(lw.slice(0, -1));
  }
  return [...terms].slice(0, 40);
}

function categorize(rel: string, f: FileEntry): RelevanceCategory {
  if (/(^|\/)tests?\//.test(rel) || /(^|\/)test_[^/]+\.py$/.test(rel) || /\.(test|spec)\.[jt]sx?$/.test(rel)) return 'test';
  if (f.lang === 'docs') return 'documentation';
  if (f.lang === 'config') return 'configuration';
  return 'implementation';
}

interface Candidate {
  f: FileEntry;
  score: number;
  signals: ContextSignal[];
  symbols: Set<string>;
  hitLines: number[];
  forced: boolean;
}

export function assembleContext(
  index: RepoIndex,
  symbols: SymbolIndex,
  graph: RelationGraph,
  input: AssembleInput,
): AssembleOutput {
  const budget = input.budgetTokens ?? 24_000;
  const perFileCap = input.perFileCapTokens ?? 6_000;
  const maxItems = input.maxItems ?? 12;
  const terms = extractTerms(input.task);
  const cands = new Map<string, Candidate>();
  const cand = (f: FileEntry): Candidate => {
    let c = cands.get(f.rel);
    if (!c) cands.set(f.rel, (c = { f, score: 0, signals: [], symbols: new Set(), hitLines: [], forced: false }));
    return c;
  };
  const add = (c: Candidate, signal: string, weight: number, detail: string) => {
    c.score += weight;
    c.signals.push({ signal, weight: Math.round(weight * 10) / 10, detail });
  };

  // 1. Hard includes: mentions + selection
  for (const m of input.mentions ?? []) {
    if (m.kind === 'file') {
      const f = index.byPath.get(m.value.replace(/^\.?\//, ''));
      if (f) {
        const c = cand(f);
        c.forced = true;
        add(c, 'mention', 100, `you mentioned @${f.rel}`);
      }
    } else {
      for (const d of findSymbol(symbols, m.value).slice(0, 3)) {
        const f = index.byPath.get(d.rel);
        if (!f) continue;
        const c = cand(f);
        c.forced = true;
        c.symbols.add(d.name);
        c.hitLines.push(d.line);
        add(c, 'mention', 100, `defines @${m.value} (L${d.line})`);
      }
    }
  }
  if (input.selection) {
    const f = index.byPath.get(input.selection.rel);
    if (f) {
      const c = cand(f);
      c.forced = true;
      c.hitLines.push(input.selection.startLine, input.selection.endLine);
      add(c, 'selection', 80, `contains your selection (L${input.selection.startLine}–${input.selection.endLine})`);
    }
  }

  // 2. Keyword evidence with IDF so ubiquitous words ("flask") don't dominate
  const N = index.files.length || 1;
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, index.files.reduce((n, f) => n + (f.lower.includes(t) ? 1 : 0), 0));
  for (const f of index.files) {
    let kw = 0;
    const hitTerms: string[] = [];
    for (const t of terms) {
      const d = df.get(t)!;
      if (!d || !f.lower.includes(t)) continue;
      const idf = Math.log(1 + N / d);
      const count = Math.min(f.lower.split(t).length - 1, 10);
      kw += idf * (1 + Math.log(count));
      hitTerms.push(t);
    }
    if (kw > 0) {
      const c = cand(f);
      add(c, 'keyword', Math.min(kw * 1.5, 35), `mentions ${hitTerms.slice(0, 5).map((t) => `"${t}"`).join(', ')}`);
    }
    // path / name match
    const stem = path.basename(f.rel).replace(/\.[^.]+$/, '').replace(/^test_/, '').toLowerCase();
    const pathHits = terms.filter((t) => stem === t || stem.split(/[_\-.]/).includes(t));
    if (pathHits.length) add(cand(f), 'path', 25 * Math.min(pathHits.length, 2), `file name matches "${pathHits[0]}"`);
  }

  // 3. Symbol definitions named in the task
  for (const t of terms) {
    for (const d of symbols.byName.get(t) ?? findSymbol(symbols, t).slice(0, 5)) {
      if (d.kind === 'variable') continue;
      const f = index.byPath.get(d.rel);
      if (!f) continue;
      const c = cand(f);
      if (c.symbols.has(d.name)) continue;
      c.symbols.add(d.name);
      c.hitLines.push(d.line);
      add(c, 'symbol_def', d.kind === 'command' ? 30 : 20, `defines ${d.kind} \`${d.name}\` (L${d.line})`);
    }
  }

  // 4. Relationship propagation from the strongest implementation candidates
  const leaders = [...cands.values()]
    .filter((c) => c.forced || categorize(c.f.rel, c.f) === 'implementation')
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const leader of leaders) {
    for (const e of neighbours(graph, leader.f.rel)) {
      const otherRel = e.from === leader.f.rel ? e.to : e.from;
      const f = index.byPath.get(otherRel);
      if (!f) continue;
      const c = cand(f);
      const w = e.kind === 'tests' ? 22 : e.kind === 'documents' ? 18 : 8;
      if (c.signals.some((s) => s.signal === `${e.kind}_pair` && s.detail.includes(leader.f.rel))) continue;
      add(c, e.kind === 'imports' ? 'import' : `${e.kind === 'tests' ? 'test' : 'doc'}_pair`, w, `${e.reason} (related to ${leader.f.rel})`);
    }
  }

  // 5. Line windows for large files: pick the lines carrying the rarest task terms (highest IDF),
  //    spread across the file, rather than simply the first matches.
  const idf = new Map(terms.map((t) => [t, Math.log(1 + N / Math.max(1, df.get(t) ?? 1))]));
  for (const c of cands.values()) {
    if (c.hitLines.length >= 6) continue;
    const lines = c.f.lower.split('\n');
    const scored: Array<{ line: number; s: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      let s = 0;
      const l = lines[i]!;
      for (const t of terms) if (t.length >= 3 && l.includes(t)) s += idf.get(t)!;
      // definitions and decorators are better anchors than prose
      if (s > 0 && /^\s*(@|def |class |async def )/.test(l)) s *= 1.5;
      if (s > 0) scored.push({ line: i + 1, s });
    }
    scored.sort((a, b) => b.s - a.s);
    for (const { line } of scored) {
      if (c.hitLines.length >= 6) break;
      if (c.hitLines.every((h) => Math.abs(h - line) > 25)) c.hitLines.push(line);
    }
  }

  // 6. Rank, dedupe (one entry per file by construction), and pack into the budget
  const ranked = [...cands.values()].sort((a, b) => Number(b.forced) - Number(a.forced) || b.score - a.score);
  const selected: ContextItem[] = [];
  const excluded: ExcludedItem[] = [];
  const parts: string[] = [];
  let used = 0;
  const minScore = Math.max(12, (ranked.find((c) => !c.forced)?.score ?? 0) * 0.25);

  for (const c of ranked) {
    const category = c.forced && c.signals.some((s) => s.signal === 'mention') ? 'explicit_mention' : c.signals.some((s) => s.signal === 'selection') ? 'selection' : categorize(c.f.rel, c.f);
    if (!c.forced && (selected.length >= maxItems || c.score < minScore)) {
      if (excluded.length < 15) excluded.push({ path: c.f.rel, reason: 'low_relevance', detail: `score ${c.score.toFixed(1)} below cut-off ${minScore.toFixed(1)}`, score: round(c.score) });
      continue;
    }
    const full = numbered(c.f.text, 1);
    let inclusion: ContextItem['inclusion'] = { mode: 'full' };
    let body = full;
    if (estimateTokens(full) > perFileCap) {
      const { text, ranges } = focused(c.f, symbols, c.hitLines, perFileCap);
      body = text;
      inclusion = ranges.length ? { mode: 'ranges', ranges } : { mode: 'outline' };
    }
    const cost = estimateTokens(body) + 20;
    if (used + cost > budget && !c.forced) {
      excluded.push({ path: c.f.rel, reason: 'over_budget', detail: `needs ~${cost} tokens, ${budget - used} left`, score: round(c.score) });
      continue;
    }
    used += cost;
    const reason = summarize(c, category);
    selected.push({
      path: c.f.rel,
      category,
      score: round(c.score),
      reason,
      signals: c.signals.sort((a, b) => b.weight - a.weight).slice(0, 6),
      symbols: [...c.symbols].slice(0, 8),
      inclusion,
      estTokens: cost,
    });
    parts.push(`### ${c.f.rel}  (${inclusion.mode}${inclusion.mode === 'ranges' ? ': ' + inclusion.ranges.map(([a, b]) => `L${a}-${b}`).join(', ') : ''}; why: ${reason})\n${body}`);
  }

  // Note large files that were skipped by the indexer, so exclusions are honest.
  for (const s of index.skipped.filter((x) => x.reason === 'too_large' || x.reason === 'secret').slice(0, 5)) {
    excluded.push({ path: s.rel, reason: s.reason === 'secret' ? 'secret' : 'too_large', detail: s.reason === 'secret' ? 'never sent: looks like a secret' : 'larger than the indexing limit' });
  }

  const receipt: ContextReceipt = {
    id: randomUUID(),
    task: input.task,
    createdAt: new Date().toISOString(),
    strategy: STRATEGY,
    selected,
    excluded,
    budget: { limitTokens: budget, usedTokens: used, perFileCapTokens: perFileCap, estimator: 'chars_div_4', truncated: selected.some((s) => s.inclusion.mode !== 'full') },
    repo: { files: index.files.length, indexedLines: index.totalLines, estTokensTotal: Math.ceil(index.totalChars / 4) },
  };
  const header =
    `AXIOM Forge context for: ${input.task}\n` +
    `Repository: ${receipt.repo.files} files, ~${receipt.repo.estTokensTotal} tokens total; this bundle uses ~${used}/${budget} tokens.\n` +
    `Selected files (most relevant first):\n${selected.map((s) => `- ${s.path} [${s.category}] ${s.reason}`).join('\n')}\n`;
  return { receipt, bundle: `${header}\n${parts.join('\n\n')}` };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function numbered(text: string, start: number): string {
  return text
    .split('\n')
    .map((l, i) => `${String(i + start).padStart(5)}| ${l}`)
    .join('\n');
}

/** Outline (all definitions) + ±window around hit lines, merged, within the per-file cap. */
function focused(f: FileEntry, symbols: SymbolIndex, hits: number[], capTokens: number): { text: string; ranges: Array<[number, number]> } {
  const lines = f.text.split('\n');
  const outline = (symbols.byFile.get(f.rel) ?? []).filter((d) => d.kind !== 'variable').map((d) => `${String(d.line).padStart(5)}| ${d.signature}`);
  let text = `[outline of ${lines.length} lines]\n${outline.join('\n')}`;
  const ranges: Array<[number, number]> = [];
  for (const h of [...new Set(hits)].sort((a, b) => a - b)) {
    const a = Math.max(1, h - 15);
    const b = Math.min(lines.length, h + 30);
    const last = ranges[ranges.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else ranges.push([a, b]);
  }
  const kept: Array<[number, number]> = [];
  for (const [a, b] of ranges) {
    const chunk = `\n[lines ${a}-${b}]\n${numbered(lines.slice(a - 1, b).join('\n'), a)}`;
    if (estimateTokens(text + chunk) > capTokens) break;
    text += chunk;
    kept.push([a, b]);
  }
  return { text, ranges: kept };
}

function summarize(c: Candidate, category: RelevanceCategory): string {
  const top = [...c.signals].sort((a, b) => b.weight - a.weight);
  const first = top[0]?.detail ?? 'related to the task';
  const pair = top.find((s) => s.signal === 'test_pair' || s.signal === 'doc_pair');
  const lead =
    category === 'test' ? 'Tests' : category === 'documentation' ? 'Docs' : category === 'configuration' ? 'Config' : category === 'explicit_mention' ? 'Mentioned' : category === 'selection' ? 'Selection' : 'Code';
  return pair && pair !== top[0] ? `${lead}: ${first}; ${pair.detail}` : `${lead}: ${first}`;
}
