import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import type { ContextItem, ContextReceipt, RelevanceCategory } from '../../../src/shared/contracts';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Empty, Figure, Meter, Section, ViewHead } from '../ui/primitives';

const CAT: Record<RelevanceCategory, string> = {
  explicit_mention: 'mentioned',
  selection: 'selection',
  implementation: 'code',
  definition: 'definition',
  dependency: 'import',
  test: 'test',
  documentation: 'docs',
  configuration: 'config',
};
const COLUMN = (c: RelevanceCategory) => (c === 'test' ? 1 : c === 'documentation' || c === 'configuration' ? 2 : 0);
const COLS = ['Code', 'Tests', 'Docs and config'];
const KIND_LABEL = { imports: 'imports', tests: 'tests', documents: 'documents' } as const;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const base = (p: string) => p.split('/').pop()!;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Narrow webview (sidebar) vs wide (editor tab): a boolean, so it re-renders only when it flips. */
const NARROW = '(max-width: 480px)';
const useNarrow = () =>
  useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(NARROW).matches,
  );

/**
 * Relationship map: the selected files laid out by role, with ONLY the edges the engine's relation
 * graph has between them. Hover or focus a file to trace its relationships; activate to open it.
 */
const RelationMap = memo(function RelationMap({ receipt, focus, onFocus }: { receipt: ContextReceipt; focus: string | null; onFocus: (p: string | null) => void }) {
  const narrow = useNarrow();
  const colW = narrow ? 96 : 150;
  const width = 20 + colW * 2 + (narrow ? 90 : 140);
  const nameMax = narrow ? 11 : 22;
  const layout = useMemo(() => {
    const cols: ContextItem[][] = [[], [], []];
    for (const s of receipt.selected) cols[COLUMN(s.category)]!.push(s);
    const rowH = 30;
    const height = Math.max(...cols.map((c) => c.length), 1) * rowH + 30;
    const pos = new Map<string, { x: number; y: number }>();
    cols.forEach((c, ci) => c.forEach((s, ri) => pos.set(s.path, { x: 6 + ci * colW, y: 34 + ri * rowH })));
    const max = Math.max(...receipt.selected.map((s) => s.score), 1);
    return { cols, pos, height, max };
  }, [receipt, colW]);
  const rel = receipt.relations ?? [];
  const linked = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const r of rel) {
      if (r.from !== focus && r.to !== focus) continue;
      s.add(r.from);
      s.add(r.to);
    }
    return s;
  }, [focus, rel]);
  return (
    <div className="map-wrap">
      <svg className="map" viewBox={`0 0 ${width} ${layout.height}`} role="group" aria-label="How the selected files relate">
        {COLS.map((c, i) => (
          <text key={c} x={6 + i * colW} y={14} className="map-col">
            {narrow && i === 2 ? 'Docs' : c}
          </text>
        ))}
        {rel.map((r) => {
          const a = layout.pos.get(r.from);
          const b = layout.pos.get(r.to);
          if (!a || !b) return null;
          const on = focus ? r.from === focus || r.to === focus : false;
          const x1 = a.x + 6;
          const x2 = b.x + 6;
          const mid = (x1 + x2) / 2 + (x1 === x2 ? 60 : 0);
          return <path key={`${r.from}>${r.to}>${r.kind}`} className={`edge e-${r.kind}${on ? ' on' : ''}${focus && !on ? ' dim' : ''}`} d={`M${x1},${a.y} C${mid},${a.y} ${mid},${b.y} ${x2},${b.y}`} />;
        })}
        {receipt.selected.map((s) => {
          const p = layout.pos.get(s.path)!;
          const r = 3 + (s.score / layout.max) * 4;
          const dim = linked ? !linked.has(s.path) : false;
          return (
            <g
              key={s.path}
              className={`node-g${focus === s.path ? ' on' : ''}${dim ? ' dim' : ''}`}
              transform={`translate(${p.x + 6},${p.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${s.path}, ${CAT[s.category]}, score ${s.score}. Open file.`}
              onMouseEnter={() => onFocus(s.path)}
              onMouseLeave={() => onFocus(null)}
              onFocus={() => onFocus(s.path)}
              onBlur={() => onFocus(null)}
              onClick={() => post({ type: 'openFile', path: s.path })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), post({ type: 'openFile', path: s.path }))}
            >
              <circle r={r} className={`c-${COLUMN(s.category)}`} />
              <text x={11} y={4}>
                {clip(base(s.path), nameMax)}
              </text>
              <title>{s.path}</title>
            </g>
          );
        })}
      </svg>
      <p className="map-legend">
        {rel.length ? `${rel.length} real relationship${rel.length > 1 ? 's' : ''} between these files: lines show imports, test coverage and documentation links. Dot size is relevance.` : 'The engine found no import, test or documentation links between these files.'}
      </p>
    </div>
  );
});

const FileRow = memo(function FileRow({ s, max, focus, onFocus }: { s: ContextItem; max: number; focus: boolean; onFocus: (p: string | null) => void }) {
  return (
    <li className={`ctx-row${focus ? ' on' : ''}`} onMouseEnter={() => onFocus(s.path)} onMouseLeave={() => onFocus(null)}>
      <div className="ctx-score" title={`Score ${s.score} (relative to the top file)`}>
        <Meter value={s.score} max={max} label={`relevance of ${s.path}`} />
        <span className="num">{s.score}</span>
      </div>
      <div className="ctx-main">
        <div className="ctx-path">
          <button className="linkish code" onClick={() => post({ type: 'openFile', path: s.path, ...(s.inclusion.mode === 'ranges' ? { line: s.inclusion.ranges[0]![0] } : {}) })}>
            {s.path}
          </button>
          <span className="tag">{CAT[s.category]}</span>
        </div>
        <p className="ctx-why">{s.reason}</p>
        <details className="ctx-more">
          <summary>
            {s.inclusion.mode === 'full' ? 'Sent in full' : s.inclusion.mode === 'outline' ? 'Sent as an outline' : `Sent lines ${s.inclusion.ranges.map(([a, b]) => `${a}–${b}`).join(', ')}`}, about {k(s.estTokens)} tokens
          </summary>
          <ul className="signals">
            {s.signals.map((g, i) => (
              <li key={i}>
                <span className="num sig-w">+{g.weight}</span> {g.detail}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </li>
  );
});

export function ContextView() {
  const receipts = useAxiom((s) => s.receipts);
  const nav = useNav();
  const list = useMemo(() => Object.values(receipts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [receipts]);
  const receipt = (nav.receiptId && receipts[nav.receiptId]) || list[0];
  const [focus, setFocus] = useState<string | null>(null);
  if (!receipt) {
    return (
      <div className="view">
        <ViewHead title="Context" lede="Before it changes anything, the agent asks AXIOM Forge for the files that matter. Each request produces a receipt: what was sent, why, and what was left out." />
        <Empty title="No context assembled yet." action={<button className="btn primary" onClick={() => nav.go('workspace')}>Describe a task</button>}>
          Start a task and the receipt appears here.
        </Empty>
      </div>
    );
  }
  const max = Math.max(...receipt.selected.map((s) => s.score), 1);
  const dirs = receipt.selected.reduce<Record<string, number>>((m, s) => ((m[s.path.split('/').slice(0, -1).join('/') || '.'] = (m[s.path.split('/').slice(0, -1).join('/') || '.'] ?? 0) + 1), m), {});
  return (
    <div className="view context">
      <ViewHead
        title="Context"
        lede={
          <span title={receipt.task}>
            For: <q>{clip(receipt.task, 140)}</q>
          </span>
        }
        actions={
          list.length > 1 ? (
            <select className="select" aria-label="Retrieval history" value={receipt.id} onChange={(e) => nav.go('context', { receiptId: e.target.value })}>
              {list.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {i === 0 ? 'Latest' : new Date(r.createdAt).toLocaleTimeString()}: {r.task.slice(0, 40)}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      <div className="figures">
        <Figure value={receipt.selected.length} label={`of ${receipt.repo.files.toLocaleString()} files sent`} />
        <Figure value={k(receipt.budget.usedTokens)} label={`of ${k(receipt.budget.limitTokens)} token budget`} />
        <Figure value={k(receipt.repo.estTokensTotal)} label="tokens in the whole repo" />
        <Figure value={receipt.excluded.length} label="candidates left out" />
      </div>
      <Meter value={receipt.budget.usedTokens} max={receipt.budget.limitTokens} label="Context budget used" />

      <Section title="How they connect">
        <RelationMap receipt={receipt} focus={focus} onFocus={setFocus} />
      </Section>

      <Section title="Why these files" count={receipt.selected.length}>
        <ol className="ctx-list">
          {receipt.selected.map((s) => (
            <FileRow key={s.path} s={s} max={max} focus={focus === s.path} onFocus={setFocus} />
          ))}
        </ol>
      </Section>

      <Section title="Where they live">
        <ul className="dirs">
          {Object.entries(dirs)
            .sort((a, b) => b[1] - a[1])
            .map(([d, n]) => (
              <li key={d}>
                <span className="code">{d}/</span>
                <span className="num muted">{n}</span>
              </li>
            ))}
        </ul>
      </Section>

      {receipt.excluded.length ? (
        <Section title="Left out" count={receipt.excluded.length}>
          <ul className="excluded">
            {receipt.excluded.map((e) => (
              <li key={e.path}>
                <span className="code">{e.path}</span>
                <span className="muted">{e.reason === 'over_budget' ? 'over budget' : e.reason === 'low_relevance' ? 'low relevance' : e.reason.replace('_', ' ')}</span>
                <span className="muted small">{e.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <details className="strategy">
        <summary>How AXIOM Forge chooses files</summary>
        <p>{receipt.strategy}</p>
        <p className="muted small">Kinds of links: {Object.values(KIND_LABEL).join(', ')}. Scores are the engine's own weighted sums, shown as computed.</p>
      </details>
    </div>
  );
}
