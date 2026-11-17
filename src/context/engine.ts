import { perf } from '../shared/perf';
import { assembleContext, type AssembleInput, type AssembleOutput } from './assemble';
import { buildIndex, updateIndexedFile, type RepoIndex } from './indexer';
import { buildRelations, neighbours, type Edge, type RelationGraph } from './relations';
import { searchWorkspace, type SearchResult } from './search';
import { buildSymbolIndex, findReferences, findSymbol, type SymbolDef, type SymbolIndex } from './symbols';

/** Facade used by the MCP tools and the extension. Rebuilds derived indexes lazily after changes. */
export class ContextEngine {
  private index: RepoIndex | null = null;
  private symbols: SymbolIndex | null = null;
  private graph: RelationGraph | null = null;
  private building: Promise<void> | null = null;
  /** Set when a file changed; derived indexes are rebuilt once, at the next query (not per write). */
  private stale = false;

  constructor(readonly root: string) {}

  async ready(): Promise<void> {
    if (this.index) {
      if (this.stale) this.derive();
      return;
    }
    this.building ??= (async () => {
      this.index = await buildIndex(this.root);
      this.derive();
    })();
    await this.building;
  }

  private derive() {
    this.stale = false;
    this.symbols = perf.span('context.symbols', () => buildSymbolIndex(this.index!));
    this.graph = perf.span('context.relations', () => buildRelations(this.index!, this.symbols!));
  }

  /** Called after SafeChange writes so retrieval sees the new code. */
  noteFileChanged(rel: string, text: string | null): void {
    if (!this.index) return;
    updateIndexedFile(this.index, rel, text);
    this.stale = true;
  }

  async invalidate(): Promise<void> {
    this.index = null;
    this.building = null;
    await this.ready();
  }

  async stats() {
    await this.ready();
    return { files: this.index!.files.length, lines: this.index!.totalLines, symbols: this.symbols!.defs.length };
  }

  async search(query: string, opts?: { glob?: string; maxResults?: number; isRegex?: boolean }): Promise<SearchResult> {
    await this.ready();
    return searchWorkspace(this.index!, query, opts);
  }

  async symbol(name: string): Promise<{ definitions: SymbolDef[]; references: Array<{ rel: string; line: number; text: string }> }> {
    await this.ready();
    const definitions = findSymbol(this.symbols!, name).slice(0, 10);
    const bare = name.split('.').pop()!;
    return { definitions, references: findReferences(this.index!, bare, 30) };
  }

  async related(rel: string): Promise<Edge[]> {
    await this.ready();
    return neighbours(this.graph!, rel);
  }

  async assemble(input: AssembleInput): Promise<AssembleOutput> {
    await this.ready();
    return perf.span('context.assemble', () => assembleContext(this.index!, this.symbols!, this.graph!, input));
  }

  /** File and symbol suggestions for the composer's @-mention popup. */
  async mentionCandidates(query: string, limit = 12): Promise<Array<{ kind: 'file' | 'symbol'; label: string; detail: string }>> {
    await this.ready();
    const q = query.toLowerCase();
    const files = this.index!.files
      .filter((f) => f.rel.toLowerCase().includes(q))
      .sort((a, b) => a.rel.length - b.rel.length)
      .slice(0, limit)
      .map((f) => ({ kind: 'file' as const, label: f.rel, detail: `${f.lines} lines` }));
    const syms = this.symbols!.defs
      .filter((d) => d.kind !== 'variable' && d.name.toLowerCase().startsWith(q))
      .slice(0, limit)
      .map((d) => ({ kind: 'symbol' as const, label: d.parent ? `${d.parent}.${d.name}` : d.name, detail: `${d.kind} · ${d.rel}:${d.line}` }));
    return [...syms, ...files].slice(0, limit);
  }
}
