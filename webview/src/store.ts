import { useSyncExternalStore } from 'react';
import type { AxiomState, HostToWebview, WebviewToHost } from '../../src/shared/contracts';
import { reconcile } from './reconcile';

/**
 * External store for host state. Components subscribe to *slices* through `useAxiom(selector)`,
 * so a streamed token re-renders only the components whose selected value changed
 * (vercel-react-best-practices: rerender-derived-state, rerender-defer-reads).
 */
export const EMPTY_STATE: AxiomState = {
  connection: { kind: 'connecting' },
  mcp: { kind: 'stopped' },
  session: { sessionId: null, turnId: null, model: null, modelSlot: null, status: 'idle' },
  timeline: [],
  receipts: {},
  proposals: {},
  approval: { kind: 'none' },
  undoStack: [],
  verification: {},
  recovery: { kind: 'healthy', model: '' },
};

type Listener = () => void;
let state: AxiomState = EMPTY_STATE;
const listeners = new Set<Listener>();
let mentionListener: ((items: Extract<HostToWebview, { type: 'mentionResults' }>['items']) => void) | null = null;

export function setState(next: AxiomState): void {
  state = next;
  for (const l of listeners) l();
}

export function getState(): AxiomState {
  return state;
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAxiom<T>(selector: (s: AxiomState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function onMentionResults(fn: typeof mentionListener) {
  mentionListener = fn;
}

export function handleHostMessage(msg: HostToWebview): void {
  if (msg.type === 'state') setState(reconcile(state, msg.state));
  else if (msg.type === 'patch') setState(reconcile(state, applyPatch(state, msg)));
  else if (msg.type === 'mentionResults') mentionListener?.(msg.items);
}

/** Apply an incremental host update: replace changed slices, then set changed timeline rows by index. */
export function applyPatch(cur: AxiomState, msg: Extract<HostToWebview, { type: 'patch' }>): AxiomState {
  const next: AxiomState = { ...cur, ...msg.patch };
  if (msg.timeline) {
    const tl = cur.timeline.slice(0, msg.timeline.length);
    for (const [i, ev] of msg.timeline.set) tl[i] = ev;
    next.timeline = tl;
  }
  return next;
}

// ── Host bridge ────────────────────────────────────────────────
interface VsCodeApi {
  postMessage(msg: unknown): void;
}
declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}
const vscode: VsCodeApi | null = typeof window !== 'undefined' && window.acquireVsCodeApi ? window.acquireVsCodeApi() : null;
export const insideVsCode = vscode !== null;
let previewSink: ((msg: WebviewToHost) => void) | null = null;
export function setPreviewSink(fn: (msg: WebviewToHost) => void) {
  previewSink = fn;
}

export function post(msg: WebviewToHost): void {
  if (vscode) vscode.postMessage(msg);
  else previewSink?.(msg);
}
