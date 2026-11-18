import { describe, expect, it } from 'vitest';
import type { AgentEvent, ProposedEdit, VerificationResult } from '../../src/shared/contracts';
import { durationMs, filesTouched, parseTestCounts, runsOf, stationsOf, unverifiedChanges } from './derive';

const tool = (id: string, toolName: string, args: Record<string, unknown>, phase: 'running' | 'succeeded' | 'failed' | 'awaiting_approval' = 'succeeded'): AgentEvent => ({
  kind: 'tool_call', id, threadId: 'main', call: { toolCallId: id, server: 'axiom-forge', toolName, args, phase, startedAt: '2026-11-18T10:00:00.000Z', finishedAt: '2026-11-18T10:00:01.250Z' },
});

describe('derive (UI is a function of real state)', () => {
  it('segments the timeline into runs by user request', () => {
    const tl: AgentEvent[] = [
      { kind: 'user_message', id: 'u1', text: 'a', at: '2026-11-18T10:00:00Z' },
      tool('t1', 'read_file', { path: 'x.py' }),
      { kind: 'turn_end', id: 'e1', status: 'done', at: '2026-11-18T10:01:00Z' },
      { kind: 'user_message', id: 'u2', text: 'b', at: '2026-11-18T10:02:00Z' },
    ];
    const runs = runsOf(tl);
    expect(runs.map((r) => [r.request, r.events.length, r.end?.status ?? null])).toEqual([['a', 3, 'done'], ['b', 1, null]]);
  });

  it('stations stay idle until their events exist; review waits on a staged proposal', () => {
    const run = runsOf([{ kind: 'user_message', id: 'u', text: 't', at: '2026-11-18T10:00:00Z' }])[0];
    expect(stationsOf(run, [], []).map((s) => s.state)).toEqual(['idle', 'active', 'idle', 'idle', 'idle', 'idle']);
    const staged = { status: 'staged', createdAt: '2026-11-18T10:00:05Z' } as ProposedEdit;
    expect(stationsOf(run, [staged], []).find((s) => s.id === 'review')!.state).toBe('waiting');
  });

  it('parses real pytest and vitest summaries and refuses to guess', () => {
    expect(parseTestCounts('....\n59 passed in 0.07s\n')).toEqual({ passed: 59, failed: 0, errors: 0, skipped: 0 });
    expect(parseTestCounts('==== 1 failed, 58 passed in 0.31s ====')).toEqual({ passed: 58, failed: 1, errors: 0, skipped: 0 });
    expect(parseTestCounts('      Tests  2 failed | 175 passed (177)')).toEqual({ passed: 175, failed: 2, errors: 0, skipped: 0 });
    expect(parseTestCounts('OK')).toBeNull();
  });

  it('files touched, durations, unverified changes', () => {
    expect(filesTouched([tool('a', 'read_file', { path: 'a.py' }), tool('b', 'propose_edit', { path: 'a.py' })])).toEqual([{ path: 'a.py', how: 'proposed' }]);
    expect(durationMs({ startedAt: '2026-11-18T10:00:00.000Z', finishedAt: '2026-11-18T10:00:01.250Z' })).toBe(1250);
    const applied = { status: 'applied', createdAt: '2026-11-18T10:00:00Z' } as ProposedEdit;
    const pass = { status: 'passed', stale: false, startedAt: '2026-11-18T10:01:00Z' } as VerificationResult;
    expect(unverifiedChanges([applied], [])).toHaveLength(1);
    expect(unverifiedChanges([applied], [pass])).toHaveLength(0);
  });
});
