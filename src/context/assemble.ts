import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ContextItem, ContextReceipt, ContextSignal, ExcludedItem, RelevanceCategory } from '../shared/contracts';
import type { FileEntry, RepoIndex } from './indexer';
import { neighbours, type RelationGraph } from './relations';
import { findSymbol, type SymbolIndex } from './symbols';

export const STRATEGY =
  'Hybrid local retrieval: explicit @mentions and the editor selection are always included; other files are scored by ' +
  'BM25 keyword relevance, file/folder-name matches, definitions of code identifiers named in the task, one-hop imports, ' +
  'and test/doc pairing in both directions (scaled by evidence); then packed greedily into a token budget, sending ' +
  'outlines plus focused line windows for large files.';

export interface AssembleInput {
  task: string;
  mentions?: Array<{ kind: 'file' | 'symbol'; value: string }>;
  selection?: { rel: string; startLine: number; endLine: number };
  budgetTokens?: number;
  perFileCapTokens?: number;
  maxItems?: number;
  /** Evaluation only: signal families to switch off (ablation study in scripts/eval-retrieval.ts). */
  ablate?: string[];
}

export interface AssembleOutput {
  receipt: ContextReceipt;
  /** Text bundle for the model: file headers + line-numbered content/outlines. */
  bundle: string;
}

// Generic English stop words only. (Earlier versions also listed words taken from the Task A/B
// wording, which was task-specific tuning; removed in the Phase 2 audit.)
const STOP = new Set(
  ('a an and are as at be by can do does for from has have how i in into is it its our should so that the their then ' +
    'there these this to use used using via was we were what when which while who will with would also any all each ' +
    'every other well like same must new not of on or make makes made add adds update updates instead too they them ' +
    'so its than such one two way support supports allow allows let lets')
    .split(/\s+/),
);

/** Light suffix stemmer so "blueprint" matches blueprints.py, "test" matches testing.py, "signals" matches signal. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ies', 'es', 'ed', 's']) {
    const min = suf === 's' ? 3 : 4;
    if (w.length - suf.length >= min && w.endsWith(suf) && !(suf === 's' && w.endsWith('ss'))) {
      w = w.slice(0, -suf.length) + (suf === 'ies' ? 'y' : '');
      // "tagging" → "tagg" → "tag", "mapped" → "mapp" → "map"
      if ((suf === 'ing' || suf === 'ings' || suf === 'ed') && /([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
      break;
    }
  }
  return w;
}

/** Does a task term name this file stem? Exact, stemmed, or a ≥5-char prefix ("configuration" → config). */
function namesFile(term: string, fileStem: string): boolean {
  if (term === fileStem) return true;
  const a = stem(term);
  const b = stem(fileStem);
  if (a === b) return true;
  return (b.length >= 5 && a.startsWith(b)) || (a.length >= 5 && b.startsWith(a));
}

/**
 * Deliverable words describe WHAT to produce ("add a test", "document it"), not WHICH module to change.
 * They are removed from matching and instead raise the weight of test/doc pairing.
 */
const INTENT_TEST = /\b(tests?|tested|testing|pytest|covered|coverage)\b/i;
const INTENT_DOCS = /\b(docs?|document(ed|ation)?|documenting)\b/i;
const INTENT_WORDS = new Set(['test', 'tests', 'tested', 'covered', 'coverage', 'doc', 'docs', 'document', 'documented', 'documentation', 'documenting']);

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

/** Code-shaped tokens in the task (snake_case, CamelCase, dotted names, backticked), lowercased. */
export function identifierTerms(task: string): Set<string> {
  const out = new Set<string>();
  for (const m of task.matchAll(/`([^`]{2,60})`/g)) out.add(m[1]!.toLowerCase());
  for (const m of task.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g)) out.add(m[0].toLowerCase());
  for (const m of task.matchAll(/\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b/g)) out.add(m[0].toLowerCase());
  for (const m of task.matchAll(/\b[A-Za-z_]\w*\.[A-Za-z_]\w*\b/g)) if (!/\.(py|rst|md|ts|js)$/.test(m[0])) out.add(m[0].toLowerCase());
  return out;
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
  const terms = extractTerms(input.task).filter((t) => !INTENT_WORDS.has(t));
  const wantsTests = INTENT_TEST.test(input.task);
  const wantsDocs = INTENT_DOCS.test(input.task);
  const cands = new Map<string, Candidate>();
  const cand = (f: FileEntry): Candidate => {
    let c = cands.get(f.rel);
    if (!c) cands.set(f.rel, (c = { f, score: 0, signals: [], symbols: new Set(), hitLines: [], forced: false }));
    return c;
  };
  const off = new Set(input.ablate ?? []);
  const family: Record<string, string> = { identifier: 'symbol', symbol_def: 'symbol', test_pair: 'pairing', doc_pair: 'pairing', tested_by: 'pairing', documented_by: 'pairing', import: 'imports' };
  const add = (c: Candidate, signal: string, weight: number, detail: string) => {
    if (off.has(family[signal] ?? signal)) return;
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

  // 2. Keyword evidence: BM25 (IDF + term-frequency saturation + file-length normalisation), so big
  //    files that mention everything once don't outrank a focused file, and ubiquitous words don't dominate.
  const N = index.files.length || 1;
  const df = new Map<string, number>();
  for (const t of terms) df.set(t, index.files.reduce((n, f) => n + (f.lower.includes(t) ? 1 : 0), 0));
  const avgLen = index.files.reduce((n, f) => n + f.lower.length, 0) / N || 1;
  const K1 = 1.2;
  const B = 0.75;
  const idfOf = (t: string) => {
    const d = df.get(t) ?? 0;
    return Math.log(1 + (N - d + 0.5) / (d + 0.5));
  };
  const idents = identifierTerms(input.task);
  for (const f of index.files) {
    let kw = 0;
    const hitTerms: Array<[string, number]> = [];
    const norm = K1 * (1 - B + (B * f.lower.length) / avgLen);
    for (const t of terms) {
      if (!df.get(t) || !f.lower.includes(t)) continue;
      const tf = Math.min(f.lower.split(t).length - 1, 50);
      const s = idfOf(t) * ((tf * (K1 + 1)) / (tf + norm));
      kw += s;
      hitTerms.push([t, s]);
    }
    if (kw > 0) {
      hitTerms.sort((x, y) => y[1] - x[1]);
      add(cand(f), 'keyword', Math.min(kw * 2.5, 60), `mentions ${hitTerms.slice(0, 5).map(([t]) => `"${t}"`).join(', ')}`);
    }
    // path / name match: count distinct file-name parts matched (so "config" + "configuration" count once),
    // plus a weaker match on the parent directory name (json/tag.py for "json").
    const fileStem = path.basename(f.rel).replace(/\.[^.]+$/, '').replace(/^test_/, '').toLowerCase();
    const nameParts = [...new Set([fileStem, ...fileStem.split(/[_\-.]/)])].filter((p) => p.length >= 3);
    const matchedParts = nameParts.filter((p) => terms.some((t) => t.length >= 3 && namesFile(t, p)));
    // a whole-stem match subsumes its parts
    const distinct = matchedParts.includes(fileStem) ? 1 + matchedParts.filter((p) => p !== fileStem && !fileStem.startsWith(p)).length : matchedParts.length;
    if (distinct) {
      const t = terms.find((x) => matchedParts.some((p) => namesFile(x, p)))!;
      add(cand(f), 'path', 25 * Math.min(distinct, 2), `file name matches "${t}"`);
    }
    const dir = path.basename(path.dirname(f.rel)).toLowerCase();
    if (dir.length >= 3 && !['src', 'lib', 'tests', 'test', 'docs', 'doc'].includes(dir) && terms.some((t) => namesFile(t, dir))) {
      add(cand(f), 'path', 10, `folder name matches "${dir}"`);
    }
  }

  // 3. Symbol definitions named in the task. A code-shaped identifier (snake_case, CamelCase, dotted,
  //    or in backticks) that is defined in a file is the strongest non-explicit signal; a plain English
  //    word that happens to equal a function name ("get", "error") is weak and shrinks with how many
  //    definitions share that name. Definitions inside test files count for less.
  for (const t of terms) {
    const defs = findSymbol(symbols, t).filter((d) => d.kind !== 'variable');
    if (!defs.length) continue;
    const isIdent = idents.has(t);
    if (!isIdent && t.length < 4) continue;
    for (const d of defs.slice(0, 8)) {
      const f = index.byPath.get(d.rel);
      if (!f) continue;
      const c = cand(f);
      if (c.symbols.has(d.name)) continue;
      c.symbols.add(d.name);
      c.hitLines.push(d.line);
      const inTest = categorize(f.rel, f) === 'test';
      const base = d.kind === 'command' ? 30 : isIdent ? 45 : 20 / Math.sqrt(defs.length);
      add(c, isIdent ? 'identifier' : 'symbol_def', inTest ? base / 3 : base, `defines ${d.kind} \`${d.name}\` (L${d.line})`);
    }
  }

  // 4. Relationship propagation, scaled by the evidence of the file it comes from:
  //    implementation → its tests/docs/imports, and (strong pairs only) a well-matched test or doc
  //    page → the implementation it is named after.
  const own = new Map([...cands.values()].map((c) => [c.f.rel, c.score]));
  const implLeaders = [...cands.values()]
    .filter((c) => c.forced || categorize(c.f.rel, c.f) === 'implementation')
    .sort((x, y) => y.score - x.score)
    .slice(0, 4);
  const topImpl = implLeaders[0]?.score || 1;
  for (const leader of implLeaders) {
    const strength = leader.forced ? 1 : Math.min(1, leader.score / topImpl);
    if (strength < 0.4) continue;
    for (const e of neighbours(graph, leader.f.rel)) {
      const otherRel = e.from === leader.f.rel ? e.to : e.from;
      const f = index.byPath.get(otherRel);
      if (!f) continue;
      const c = cand(f);
      const sig = e.kind === 'imports' ? 'import' : e.kind === 'tests' ? 'test_pair' : 'doc_pair';
      if (c.signals.some((x) => x.signal === sig && x.detail.includes(leader.f.rel))) continue;
      const base = e.kind === 'tests' ? (wantsTests ? 30 : 18) : e.kind === 'documents' ? (wantsDocs ? 28 : 12) : 8;
      add(c, sig, base * strength * (e.strength === 'strong' || e.kind === 'imports' ? 1 : 0.5), `${e.reason} (related to ${leader.f.rel})`);
    }
  }
  const topAll = Math.max(1, ...own.values());
  for (const c of [...cands.values()]) {
    const cat = categorize(c.f.rel, c.f);
    if (cat !== 'test' && cat !== 'documentation') continue;
    const ev = own.get(c.f.rel) ?? 0;
    if (ev < topAll * 0.5) continue;
    for (const e of neighbours(graph, c.f.rel)) {
      if (e.strength !== 'strong' || e.from !== c.f.rel) continue;
      const f = index.byPath.get(e.to);
      if (!f) continue;
      add(cand(f), cat === 'test' ? 'tested_by' : 'documented_by', Math.min(25, ev * 0.3), `${e.reason} (${c.f.rel} matches the task)`);
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
    const cap = category === 'test' || category === 'documentation' ? Math.min(perFileCap, 3_000) : perFileCap;
    if (estimateTokens(full) > cap) {
      const { text, ranges } = focused(c.f, symbols, c.hitLines, cap);
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
