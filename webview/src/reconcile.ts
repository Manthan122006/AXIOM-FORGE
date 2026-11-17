import type { AxiomState } from '../../src/shared/contracts';

/**
 * postMessage structured-clones every state snapshot, so each batch arrives as brand-new objects and
 * React.memo would re-render every timeline row on every streamed token. `reconcile` re-uses the
 * previous object wherever the content is unchanged, so only the rows that actually changed get a
 * new identity (vercel-react-best-practices: rerender-memo, rerender-derived-state).
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function reconcileArrayById<T extends { id: string }>(prev: T[], next: T[]): T[] {
  if (prev === next) return prev;
  const byId = new Map(prev.map((x) => [x.id, x]));
  let changed = prev.length !== next.length;
  const out = next.map((n, i) => {
    const p = byId.get(n.id);
    if (p && same(p, n)) {
      if (prev[i] !== p) changed = true;
      return p;
    }
    changed = true;
    return n;
  });
  return changed ? out : prev;
}

function reconcileRecord<T>(prev: Record<string, T>, next: Record<string, T>): Record<string, T> {
  const keys = Object.keys(next);
  let changed = keys.length !== Object.keys(prev).length;
  const out: Record<string, T> = {};
  for (const k of keys) {
    const p = prev[k];
    if (p !== undefined && same(p, next[k])) out[k] = p;
    else {
      out[k] = next[k]!;
      changed = true;
    }
  }
  return changed ? out : prev;
}

export function reconcile(prev: AxiomState, next: AxiomState): AxiomState {
  return {
    connection: same(prev.connection, next.connection) ? prev.connection : next.connection,
    mcp: same(prev.mcp, next.mcp) ? prev.mcp : next.mcp,
    session: same(prev.session, next.session) ? prev.session : next.session,
    timeline: reconcileArrayById(prev.timeline, next.timeline),
    receipts: reconcileRecord(prev.receipts, next.receipts),
    proposals: reconcileRecord(prev.proposals, next.proposals),
    approval: same(prev.approval, next.approval) ? prev.approval : next.approval,
    undoStack: same(prev.undoStack, next.undoStack) ? prev.undoStack : next.undoStack,
    verification: reconcileRecord(prev.verification, next.verification),
    recovery: same(prev.recovery, next.recovery) ? prev.recovery : next.recovery,
  };
}
