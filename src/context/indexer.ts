import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSecretPath } from '../mcp/pathJail';

export type Lang = 'python' | 'typescript' | 'javascript' | 'docs' | 'config' | 'other';

export interface FileEntry {
  rel: string;
  lang: Lang;
  size: number;
  lines: number;
  text: string;
  /** Lower-cased text, cached for search. */
  lower: string;
}

export interface RepoIndex {
  root: string;
  files: FileEntry[];
  byPath: Map<string, FileEntry>;
  skipped: Array<{ rel: string; reason: 'too_large' | 'binary' | 'ignored' | 'secret' }>;
  builtAt: number;
  totalLines: number;
  totalChars: number;
}

export interface IndexOptions {
  maxFileBytes?: number;
  maxFiles?: number;
}

const ALWAYS_IGNORED_DIRS = new Set([
  '.git', 'node_modules', '.venv', 'venv', 'env', '__pycache__', '.tox', '.nox', '.mypy_cache', '.pytest_cache',
  '.ruff_cache', 'dist', 'build', 'out', '.idea', '.vscode-test', 'coverage', 'htmlcov', '.eggs', 'site-packages',
]);
const TEXT_EXT: Record<string, Lang> = {
  '.py': 'python', '.pyi': 'python',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.rst': 'docs', '.md': 'docs', '.txt': 'docs',
  '.toml': 'config', '.cfg': 'config', '.ini': 'config', '.json': 'config', '.yaml': 'config', '.yml': 'config',
  '.html': 'other', '.css': 'other', '.sh': 'other',
};

/** Minimal .gitignore support: directory names, `*.ext`, and simple anchored paths. */
function loadGitignore(text: string): (rel: string, isDir: boolean) => boolean {
  const rules = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'));
  const matchers = rules.map((rule) => {
    const dirOnly = rule.endsWith('/');
    const r = rule.replace(/^\//, '').replace(/\/$/, '');
    const re = new RegExp(
      '^' + (rule.startsWith('/') || r.includes('/') ? '' : '(?:.*/)?') +
        r.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') +
        '$',
    );
    return { re, dirOnly };
  });
  return (rel, isDir) => matchers.some((m) => (!m.dirOnly || isDir) && m.re.test(rel));
}

export async function buildIndex(root: string, opts: IndexOptions = {}): Promise<RepoIndex> {
  const maxFileBytes = opts.maxFileBytes ?? 512 * 1024;
  const maxFiles = opts.maxFiles ?? 20_000;
  let ignored: (rel: string, isDir: boolean) => boolean = () => false;
  try {
    ignored = loadGitignore(await fs.readFile(path.join(root, '.gitignore'), 'utf8'));
  } catch {
    /* no .gitignore */
  }

  const files: FileEntry[] = [];
  const skipped: RepoIndex['skipped'] = [];
  const queue: string[] = [''];
  while (queue.length && files.length < maxFiles) {
    const dirRel = queue.shift()!;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(path.join(root, dirRel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (ALWAYS_IGNORED_DIRS.has(e.name) || e.name.endsWith('.egg-info') || ignored(rel, true)) continue;
        queue.push(rel);
        continue;
      }
      if (!e.isFile()) continue;
      if (isSecretPath(rel)) {
        skipped.push({ rel, reason: 'secret' });
        continue;
      }
      if (ignored(rel, false)) {
        skipped.push({ rel, reason: 'ignored' });
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      const lang = TEXT_EXT[ext] ?? (['Makefile', 'Dockerfile', 'LICENSE'].includes(e.name) ? 'other' : undefined);
      if (!lang) continue;
      const abs = path.join(root, dirRel, e.name);
      const stat = await fs.stat(abs);
      if (stat.size > maxFileBytes) {
        skipped.push({ rel, reason: 'too_large' });
        continue;
      }
      const buf = await fs.readFile(abs);
      if (buf.subarray(0, 8000).includes(0)) {
        skipped.push({ rel, reason: 'binary' });
        continue;
      }
      const text = buf.toString('utf8');
      files.push({ rel, lang, size: stat.size, lines: text.split('\n').length, text, lower: text.toLowerCase() });
    }
  }
  const byPath = new Map(files.map((f) => [f.rel, f]));
  return {
    root,
    files,
    byPath,
    skipped,
    builtAt: Date.now(),
    totalLines: files.reduce((n, f) => n + f.lines, 0),
    totalChars: files.reduce((n, f) => n + f.text.length, 0),
  };
}

/** Keep the index in sync after AXIOM Forge (or the user) changes a file. */
export function updateIndexedFile(index: RepoIndex, rel: string, text: string | null): void {
  const existing = index.byPath.get(rel);
  if (text === null) {
    if (existing) {
      index.files = index.files.filter((f) => f.rel !== rel);
      index.byPath.delete(rel);
    }
    return;
  }
  const lang = TEXT_EXT[path.extname(rel).toLowerCase()] ?? 'other';
  const entry: FileEntry = { rel, lang, size: Buffer.byteLength(text), lines: text.split('\n').length, text, lower: text.toLowerCase() };
  if (existing) Object.assign(existing, entry);
  else {
    index.files.push(entry);
    index.byPath.set(rel, entry);
  }
}
