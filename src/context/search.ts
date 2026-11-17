import type { RepoIndex } from './indexer';

export interface SearchMatch {
  rel: string;
  line: number;
  text: string;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  filesMatched: number;
  truncated: boolean;
}

function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0001/g, '(?:.*/)?')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`);
}

/**
 * Literal, case-insensitive search across the index (regex when `isRegex`).
 * Results are grouped per file in index order and capped.
 */
export function searchWorkspace(
  index: RepoIndex,
  query: string,
  opts: { glob?: string; maxResults?: number; isRegex?: boolean } = {},
): SearchResult {
  const max = Math.min(opts.maxResults ?? 50, 200);
  const glob = opts.glob ? globToRegExp(opts.glob) : null;
  let re: RegExp | null = null;
  if (opts.isRegex) {
    try {
      re = new RegExp(query, 'i');
    } catch {
      throw new Error(`Invalid regular expression: ${query}`);
    }
  }
  const needle = query.toLowerCase();
  const matches: SearchMatch[] = [];
  let filesMatched = 0;
  let truncated = false;
  for (const f of index.files) {
    if (glob && !glob.test(f.rel)) continue;
    if (!re && !f.lower.includes(needle)) continue;
    const lines = f.text.split('\n');
    let fileHit = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (re ? re.test(l) : l.toLowerCase().includes(needle)) {
        if (!fileHit) {
          filesMatched++;
          fileHit = true;
        }
        if (matches.length < max) matches.push({ rel: f.rel, line: i + 1, text: l.trim().slice(0, 240) });
        else truncated = true;
      }
    }
  }
  return { query, matches, filesMatched, truncated };
}
