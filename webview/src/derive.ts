/**
 * Pure derivations over the real AxiomState. Every screen reads through these, so what the UI shows
 * is always a function of host state: nothing here invents data.
 */
import type { AgentEvent, AxiomState, ModelRecoveryState, ProposedEdit, ToolCallState, VerificationResult } from '../../src/shared/contracts';

// ── Runs: the timeline segmented by user request ─────────────────────────────
export interface Run {
  id: string;
  request: string;
  startedAt: string;
  events: AgentEvent[];
  end: Extract<AgentEvent, { kind: 'turn_end' }> | null;
}

export function runsOf(timeline: AgentEvent[]): Run[] {
  const runs: Run[] = [];
  for (const ev of timeline) {
    if (ev.kind === 'user_message') {
      runs.push({ id: ev.id, request: ev.text, startedAt: ev.at, events: [ev], end: null });
      continue;
    }
    const cur = runs[runs.length - 1];
    if (!cur) continue;
    cur.events.push(ev);
    if (ev.kind === 'turn_end') cur.end = ev;
  }
  return runs;
}

// ── The six stations of a run (the Trace). Lit only by events that happened. ───
export type StationId = 'context' | 'agent' | 'tools' | 'review' | 'applied' | 'verified';
export type StationState = 'idle' | 'active' | 'done' | 'waiting' | 'failed';
export interface Station {
  id: StationId;
  label: string;
  state: StationState;
  detail: string;
}

const isTool = (e: AgentEvent): e is Extract<AgentEvent, { kind: 'tool_call' }> => e.kind === 'tool_call';

export function stationsOf(run: Run | undefined, proposals: ProposedEdit[], verification: VerificationResult[]): Station[] {
  const ev = run?.events ?? [];
  const tools = ev.filter(isTool).map((e) => e.call);
  const ctx = tools.filter((c) => c.toolName === 'assemble_context');
  const receipt = ev.some((e) => e.kind === 'context_receipt');
  const text = ev.some((e) => e.kind === 'assistant_text');
  const work = tools.filter((c) => c.toolName !== 'assemble_context' && c.toolName !== 'propose_edit' && c.toolName !== 'run_command');
  // A staged proposal always belongs to the live run (it is what the run is paused on).
  const runProps = run ? proposals.filter((p) => p.createdAt >= run.startedAt || (!run.end && p.status === 'staged')) : [];
  const waiting = runProps.some((p) => p.status === 'staged');
  const applied = runProps.filter((p) => p.status === 'applied');
  const failedApply = runProps.some((p) => p.status === 'conflict' || p.status === 'failed');
  const runVerif = run ? verification.filter((v) => v.startedAt >= run.startedAt) : [];
  const ended = run?.end;
  const live = !!run && !ended;

  const st = (cond: boolean, activeCond: boolean): StationState => (cond ? 'done' : activeCond ? 'active' : 'idle');
  const lastV = runVerif[runVerif.length - 1];
  return [
    {
      id: 'context',
      label: 'Context',
      state: receipt ? 'done' : ctx.some((c) => c.phase === 'running' || c.phase === 'requested') ? 'active' : 'idle',
      detail: receipt ? 'assembled' : ctx.length ? 'assembling' : 'not yet',
    },
    { id: 'agent', label: 'Agent', state: st(text && !live, live), detail: live ? 'working' : text ? 'answered' : 'not started' },
    {
      id: 'tools',
      label: 'Tools',
      state: work.some((c) => c.phase === 'failed') ? 'failed' : st(work.length > 0 && work.every((c) => c.phase === 'succeeded'), work.some((c) => c.phase === 'running' || c.phase === 'requested')),
      detail: `${work.length} call${work.length === 1 ? '' : 's'}`,
    },
    {
      id: 'review',
      label: 'Review',
      state: waiting ? 'waiting' : runProps.length ? 'done' : 'idle',
      detail: waiting ? 'waiting for you' : runProps.length ? `${runProps.length} file${runProps.length === 1 ? '' : 's'} decided` : 'no changes',
    },
    {
      id: 'applied',
      label: 'Applied',
      state: failedApply ? 'failed' : applied.length ? 'done' : 'idle',
      detail: failedApply ? 'not applied' : applied.length ? `${applied.length} file${applied.length === 1 ? '' : 's'}` : 'nothing yet',
    },
    {
      id: 'verified',
      label: 'Verified',
      state: !lastV ? 'idle' : lastV.status === 'running' ? 'active' : lastV.status === 'passed' && !lastV.stale ? 'done' : lastV.status === 'passed' ? 'waiting' : 'failed',
      detail: !lastV ? 'not run' : lastV.status === 'passed' ? (lastV.stale ? 'stale' : `exit ${lastV.exitCode}`) : lastV.status === 'running' ? 'running' : `exit ${lastV.exitCode ?? '–'}`,
    },
  ];
}

// ── Tools, files, durations ──────────────────────────────────────────────────
export function durationMs(c: Pick<ToolCallState, 'startedAt' | 'finishedAt'>): number | null {
  if (!c.finishedAt) return null;
  const d = Date.parse(c.finishedAt) - Date.parse(c.startedAt);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** Files the agent read or proposed to change in these events, with how. */
export function filesTouched(events: AgentEvent[]): Array<{ path: string; how: 'read' | 'proposed' }> {
  const out = new Map<string, 'read' | 'proposed'>();
  for (const e of events) {
    if (!isTool(e)) continue;
    const p = e.call.args.path;
    if (typeof p !== 'string') continue;
    if (e.call.toolName === 'propose_edit') out.set(p, 'proposed');
    else if (e.call.toolName === 'read_file' && !out.has(p)) out.set(p, 'read');
  }
  return [...out].map(([path, how]) => ({ path, how }));
}

export function toolCounts(events: AgentEvent[]): Array<{ name: string; count: number; failed: number }> {
  const m = new Map<string, { count: number; failed: number }>();
  for (const e of events) {
    if (!isTool(e)) continue;
    const c = m.get(e.call.toolName) ?? { count: 0, failed: 0 };
    c.count++;
    if (e.call.phase === 'failed' || e.call.phase === 'denied') c.failed++;
    m.set(e.call.toolName, c);
  }
  return [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count);
}

// ── Proof: test counts parsed from the REAL command output, never guessed ─────
export interface TestCounts {
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
}
/** pytest / vitest summary lines. Returns null when the output has no recognisable summary. */
export function parseTestCounts(output: string): TestCounts | null {
  const py = /=*\s*((?:\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|warnings?)(?:, )?)+) in [\d.]+s/.exec(output) ?? /\n\s*((?:\d+ (?:passed|failed|errors?|skipped)(?:, )?)+) in [\d.]+s/.exec(output);
  if (py) {
    const n = (w: RegExp) => Number(w.exec(py[1]!)?.[1] ?? 0);
    return { passed: n(/(\d+) passed/), failed: n(/(\d+) failed/), errors: n(/(\d+) errors?/), skipped: n(/(\d+) skipped/) };
  }
  const vt = /Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)?/.exec(output);
  if (vt) return { passed: Number(vt[2]), failed: Number(vt[1] ?? 0), errors: 0, skipped: Number(vt[3] ?? 0) };
  return null;
}

/** Applied changes with no passing, non-stale verification after them. */
export function unverifiedChanges(proposals: ProposedEdit[], verification: VerificationResult[]): ProposedEdit[] {
  const passedFresh = verification.filter((v) => v.status === 'passed' && !v.stale);
  return proposals.filter((p) => p.status === 'applied' && !passedFresh.some((v) => v.startedAt >= p.createdAt));
}

// ── ModelShield routing history ──────────────────────────────────────────────
export function recoveryHistory(timeline: AgentEvent[]): Array<{ id: string; at: string; state: ModelRecoveryState }> {
  return timeline.flatMap((e) => (e.kind === 'recovery' ? [{ id: e.id, at: e.at, state: e.state }] : []));
}

export const shortModel = (m: string | null | undefined) => (m ? m.split('/').pop()! : '');

// ── Rail badges (derived booleans/numbers: components re-render only when these change) ──
export const pendingReviewCount = (s: AxiomState) => Object.values(s.proposals).filter((p) => p.status === 'staged').length;
export const isRunning = (s: AxiomState) => s.session.status === 'running' || s.session.status === 'paused';
export const shieldAlert = (s: AxiomState) => s.recovery.kind !== 'healthy';
export const proofAlert = (s: AxiomState) => Object.values(s.verification).some((v) => v.status === 'failed' || v.status === 'error' || v.status === 'timed_out');
