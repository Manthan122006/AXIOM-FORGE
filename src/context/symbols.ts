import type { FileEntry, RepoIndex } from './indexer';

export interface SymbolDef {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'command';
  rel: string;
  line: number; // 1-based
  /** Enclosing class for methods. */
  parent?: string;
  /** The definition line itself, trimmed (used for outlines). */
  signature: string;
}

export interface SymbolIndex {
  defs: SymbolDef[];
  byName: Map<string, SymbolDef[]>;
  byFile: Map<string, SymbolDef[]>;
}

const PY_DEF = /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/;
const PY_ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=(?!=)/;
const PY_CLICK_CMD = /@\w+\.command\(\s*["']([\w-]+)["']/;
const TS_DEF =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|let|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

function extractPython(f: FileEntry): SymbolDef[] {
  const out: SymbolDef[] = [];
  const classStack: Array<{ indent: number; name: string }> = [];
  const lines = f.text.split('\n');
  let pendingCommand: string | undefined;
  lines.forEach((raw, i) => {
    const cmd = PY_CLICK_CMD.exec(raw);
    if (cmd) pendingCommand = cmd[1];
    const m = PY_DEF.exec(raw);
    if (m) {
      const indent = m[1]!.length;
      while (classStack.length && classStack[classStack.length - 1]!.indent >= indent) classStack.pop();
      const parent = classStack[classStack.length - 1]?.name;
      const kind = m[2] === 'class' ? 'class' : parent ? 'method' : 'function';
      out.push({ name: m[3]!, kind, rel: f.rel, line: i + 1, signature: raw.trim(), ...(parent ? { parent } : {}) });
      if (m[2] === 'class') classStack.push({ indent, name: m[3]! });
      if (pendingCommand && kind === 'function') {
        out.push({ name: pendingCommand, kind: 'command', rel: f.rel, line: i + 1, signature: `command "${pendingCommand}" → ${m[3]}` });
        pendingCommand = undefined;
      }
      return;
    }
    const a = PY_ASSIGN.exec(raw);
    if (a && raw.length - raw.trimStart().length === 0 && !raw.startsWith('_') ) {
      out.push({ name: a[1]!, kind: 'variable', rel: f.rel, line: i + 1, signature: raw.trim().slice(0, 120) });
    }
  });
  return out;
}

function extractTs(f: FileEntry): SymbolDef[] {
  const out: SymbolDef[] = [];
  f.text.split('\n').forEach((raw, i) => {
    const m = TS_DEF.exec(raw);
    if (m) {
      const kind = m[1] === 'class' || m[1] === 'interface' ? 'class' : m[1] === 'function' ? 'function' : 'variable';
      out.push({ name: m[2]!, kind, rel: f.rel, line: i + 1, signature: raw.trim().slice(0, 160) });
    }
  });
  return out;
}

export function buildSymbolIndex(index: RepoIndex): SymbolIndex {
  const defs: SymbolDef[] = [];
  for (const f of index.files) {
    if (f.lang === 'python') defs.push(...extractPython(f));
    else if (f.lang === 'typescript' || f.lang === 'javascript') defs.push(...extractTs(f));
  }
  const byName = new Map<string, SymbolDef[]>();
  const byFile = new Map<string, SymbolDef[]>();
  for (const d of defs) {
    (byName.get(d.name) ?? byName.set(d.name, []).get(d.name)!).push(d);
    (byFile.get(d.rel) ?? byFile.set(d.rel, []).get(d.rel)!).push(d);
  }
  return { defs, byName, byFile };
}

/** Find definitions by exact name, falling back to case-insensitive and `Class.method` forms. */
export function findSymbol(sym: SymbolIndex, query: string): SymbolDef[] {
  const q = query.trim();
  if (q.includes('.')) {
    const [cls, member] = q.split('.').slice(-2) as [string, string];
    const hits = (sym.byName.get(member) ?? []).filter((d) => d.parent === cls);
    if (hits.length) return hits;
  }
  const exact = sym.byName.get(q);
  if (exact?.length) return exact;
  const lower = q.toLowerCase();
  return sym.defs.filter((d) => d.name.toLowerCase() === lower);
}

/** Line numbers (1-based) in `f` that reference `name` as a whole word, excluding its definition. */
export function findReferences(index: RepoIndex, name: string, limit = 50): Array<{ rel: string; line: number; text: string }> {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const out: Array<{ rel: string; line: number; text: string }> = [];
  for (const f of index.files) {
    if (!f.text.includes(name)) continue;
    const lines = f.text.split('\n');
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      const l = lines[i]!;
      if (re.test(l) && !PY_DEF.test(l)) out.push({ rel: f.rel, line: i + 1, text: l.trim().slice(0, 200) });
    }
    if (out.length >= limit) break;
  }
  return out;
}
