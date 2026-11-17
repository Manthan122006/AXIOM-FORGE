import path from 'node:path';
import type { RepoIndex } from './indexer';
import type { SymbolIndex } from './symbols';

/**
 * Relationship graph between files: Python imports (resolved to repo files),
 * source ↔ test pairing, and source ↔ documentation pairing. Every edge carries a
 * human-readable reason so the Context Receipt can explain it.
 */
export interface Edge {
  from: string;
  to: string;
  kind: 'imports' | 'tests' | 'documents';
  reason: string;
  /** strong = naming convention / doc page named after the module; weak = inferred from imports or references. */
  strength?: 'strong' | 'weak';
}

export interface RelationGraph {
  /** module dotted name → file */
  modules: Map<string, string>;
  out: Map<string, Edge[]>;
  in: Map<string, Edge[]>;
}

const PY_IMPORT = /^\s*(?:from\s+(\.*[\w.]*)\s+import\s+([\w*,\s()]+)|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm;

/** Map `src/flask/cli.py` → `flask.cli`, `src/flask/__init__.py` → `flask`. */
export function moduleName(rel: string): string | undefined {
  if (!rel.endsWith('.py')) return undefined;
  let p = rel.slice(0, -3);
  for (const prefix of ['src/', 'lib/']) if (p.startsWith(prefix)) p = p.slice(prefix.length);
  p = p.replace(/\/__init__$/, '');
  return p.split('/').join('.');
}

function resolveRelative(fromRel: string, spec: string): string | undefined {
  const dots = /^\.*/.exec(spec)![0].length;
  const fromMod = moduleName(fromRel);
  if (!fromMod) return undefined;
  const isPkg = fromRel.endsWith('__init__.py');
  const parts = fromMod.split('.');
  const base = parts.slice(0, parts.length - (isPkg ? dots - 1 : dots));
  const rest = spec.slice(dots);
  return [...base, ...(rest ? rest.split('.') : [])].join('.');
}

function addEdge(g: RelationGraph, e: Edge) {
  if (e.from === e.to) return;
  const outs = g.out.get(e.from) ?? g.out.set(e.from, []).get(e.from)!;
  if (outs.some((x) => x.to === e.to && x.kind === e.kind)) return;
  outs.push(e);
  (g.in.get(e.to) ?? g.in.set(e.to, []).get(e.to)!).push(e);
}

export function buildRelations(index: RepoIndex, symbols: SymbolIndex): RelationGraph {
  const g: RelationGraph = { modules: new Map(), out: new Map(), in: new Map() };
  for (const f of index.files) {
    const m = moduleName(f.rel);
    if (m && !f.rel.startsWith('tests/') && !f.rel.startsWith('docs/')) g.modules.set(m, f.rel);
  }

  // 1. Python imports
  for (const f of index.files) {
    if (f.lang !== 'python') continue;
    for (const m of f.text.matchAll(PY_IMPORT)) {
      const targets: string[] = [];
      if (m[1] !== undefined) {
        const base = m[1].startsWith('.') ? resolveRelative(f.rel, m[1]) : m[1];
        if (!base) continue;
        targets.push(base);
        for (const name of m[2]!.replace(/[()]/g, '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]!)) {
          if (name && name !== '*') targets.push(`${base}.${name}`);
        }
      } else if (m[3]) {
        targets.push(...m[3].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]!));
      }
      for (const t of targets) {
        const to = g.modules.get(t);
        if (to) addEdge(g, { from: f.rel, to, kind: 'imports', reason: `imports \`${t}\`` });
      }
    }
  }

  // 2. Test pairing: tests/test_<mod>.py ↔ <pkg>/<mod>.py, plus tests that import a module
  const sources = index.files.filter((f) => f.lang === 'python' && !f.rel.startsWith('tests/') && !/(^|\/)test_/.test(f.rel));
  for (const t of index.files.filter((f) => f.lang === 'python' && /(^|\/)test_[^/]+\.py$/.test(f.rel))) {
    const stem = path.basename(t.rel, '.py').replace(/^test_/, '');
    for (const s of sources) {
      if (path.basename(s.rel, '.py') === stem) {
        addEdge(g, { from: t.rel, to: s.rel, kind: 'tests', strength: 'strong', reason: `naming convention: ${path.basename(t.rel)} ↔ ${path.basename(s.rel)}` });
      }
    }
    for (const e of g.out.get(t.rel) ?? []) {
      if (e.kind === 'imports') addEdge(g, { from: t.rel, to: e.to, kind: 'tests', reason: `test module ${e.reason}` });
    }
  }

  // 3. Documentation pairing: docs mention the module name, `:mod:` refs, or the file's stem as a page name
  const docs = index.files.filter((f) => f.lang === 'docs' && (f.rel.startsWith('docs/') || /readme/i.test(f.rel)));
  for (const s of sources) {
    const mod = moduleName(s.rel);
    if (!mod || mod.split('.').length < 2) continue;
    const stem = path.basename(s.rel, '.py');
    for (const d of docs) {
      const dStem = path.basename(d.rel).replace(/\.(rst|md|txt)$/, '');
      if (dStem === stem && stem !== '__init__') {
        addEdge(g, { from: d.rel, to: s.rel, kind: 'documents', strength: 'strong', reason: `doc page ${path.basename(d.rel)} matches module ${stem}` });
      } else if (d.text.includes(`${mod}`) && d.lower.split(mod.toLowerCase()).length > 3) {
        addEdge(g, { from: d.rel, to: s.rel, kind: 'documents', reason: `references \`${mod}\` repeatedly` });
      }
    }
  }
  void symbols;
  return g;
}

export function neighbours(g: RelationGraph, rel: string): Edge[] {
  return [...(g.out.get(rel) ?? []), ...(g.in.get(rel) ?? [])];
}
