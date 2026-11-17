import { describe, expect, it } from 'vitest';
import { TurnTracker } from '../../src/trueforge/reducer';
import { classifyFailure, isTransient } from '../../src/trueforge/classify';
import { backoffDelay, runWithShield, type AttemptOutcome } from '../../src/trueforge/modelShield';
import type { ModelRecoveryState } from '../../src/shared/contracts';
import { approvalContinuation, approvalTurn, PROPOSE_ARGS, providerErrorTurn, subagentAndCompaction } from '../fixtures/trueforge-events/synthetic';

describe('TurnTracker (synthetic streams)', () => {
  it('merges deltas into one streaming text item', () => {
    const tr = new TurnTracker();
    for (const e of approvalTurn().slice(0, 4)) tr.apply(e);
    const texts = tr.timeline.filter((e) => e.kind === 'assistant_text');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ text: 'Reading the selected function first.', streaming: false });
  });

  it('tracks tool calls through approval pause and resolves arguments via sourceEventId', () => {
    const tr = new TurnTracker();
    for (const e of approvalTurn()) tr.apply(e);
    expect(tr.status).toBe('paused');
    expect(tr.turnId).toBe('turn-1');
    expect(tr.toolCalls.get('call-read')).toMatchObject({ toolName: 'read_file', server: 'axiom-forge', phase: 'succeeded' });
    expect(tr.pendingApprovals()).toEqual(['call-edit']);
    const look = tr.lookup('call-edit')!;
    expect(look.toolName).toBe('propose_edit');
    expect(look.args).toEqual(PROPOSE_ARGS);
    expect(look.threadId).toBe('main');
  });

  it('allow → running → succeeded → done', () => {
    const tr = new TurnTracker();
    for (const e of [...approvalTurn(), ...approvalContinuation(true)]) tr.apply(e);
    expect(tr.toolCalls.get('call-edit')!.phase).toBe('succeeded');
    expect(tr.status).toBe('done');
    expect(tr.timeline.at(-1)).toMatchObject({ kind: 'turn_end', status: 'done' });
  });

  it('deny keeps the call marked denied even after the tool.response', () => {
    const tr = new TurnTracker();
    for (const e of [...approvalTurn(), ...approvalContinuation(false)]) tr.apply(e);
    expect(tr.toolCalls.get('call-edit')!.phase).toBe('denied');
  });

  it('records subagent threads, compaction and cancellation', () => {
    const tr = new TurnTracker();
    for (const e of subagentAndCompaction()) tr.apply(e);
    const sub = tr.timeline.find((e) => e.kind === 'subagent');
    expect(sub).toMatchObject({ title: 'repo-scout', status: 'done' });
    expect(tr.timeline.filter((e) => e.kind === 'compaction').map((e) => (e as { status: string }).status)).toEqual(['started', 'finished']);
    expect(tr.status).toBe('cancelled');
    expect(tr.cancelReason).toBe('client-cancelled');
  });

  it('surfaces provider errors with secrets scrubbed', () => {
    const tr = new TurnTracker();
    for (const e of providerErrorTurn(`401 Unauthorized: API key not valid (key AIza${'x'.repeat(35)})`)) tr.apply(e);
    expect(tr.status).toBe('error');
    expect(tr.error).toContain('[REDACTED]');
    expect(tr.error).not.toContain('AIza');
  });
});

describe('classifyFailure', () => {
  it.each([
    ['401 Unauthorized', 'auth'],
    ['API key not valid. Please pass a valid API key.', 'auth'],
    ['Invalid API Key', 'auth'],
    ['429 Too Many Requests: quota exceeded', 'rate_limit'],
    ['RESOURCE_EXHAUSTED', 'rate_limit'],
    ['model gemini-9 not found', 'bad_config'],
    ['connect ECONNREFUSED 127.0.0.2:9', 'unreachable'],
    ['getaddrinfo ENOTFOUND api.example.invalid', 'unreachable'],
    ['Outbound URL blocked: host 10.0.0.1', 'unreachable'],
    ['Headers Timeout Error', 'timeout'],
    ['503 Service Unavailable', 'server'],
    ['The operation was aborted', 'cancelled'],
    ['something odd', 'unknown'],
    ['TrueForge rejected the session (HTTP 422): Unknown model "x/y" — provider not configured', 'bad_config'],
    ['TrueForge is not reachable at http://localhost:8790 (fetch failed)', 'trueforge_error'],
    ['TrueForge rejected the session (HTTP 400): invalid agent spec: iteration_limit', 'trueforge_error'],
  ])('%s → %s', (msg, cls) => {
    expect(classifyFailure(msg)).toBe(cls);
  });
  it('uses HTTP status and AbortError', () => {
    expect(classifyFailure({ statusCode: 401, message: '' })).toBe('auth');
    expect(classifyFailure({ name: 'AbortError', message: 'x' })).toBe('cancelled');
    expect(isTransient('auth')).toBe(false);
    expect(isTransient('rate_limit')).toBe(true);
  });
});

describe('ModelShield', () => {
  const policy = { primary: 'gemini/primary', backup: 'groq/backup', maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 8000 };
  const run = async (script: Record<string, AttemptOutcome[]>, p = policy) => {
    const states: ModelRecoveryState[] = [];
    const calls: Array<{ model: string; attemptNo: number; freshSession: boolean }> = [];
    const sleeps: number[] = [];
    const queues = Object.fromEntries(Object.entries(script).map(([k, v]) => [k, [...v]]));
    const result = await runWithShield(p, {
      attempt: async (model, info) => {
        calls.push({ model, ...info });
        return queues[model]!.shift() ?? { kind: 'done' };
      },
      onState: (s) => states.push(s),
      sleep: async (ms) => void sleeps.push(ms),
      random: () => 0.5,
    });
    return { result, states, calls, sleeps };
  };
  const fail = (error: string, sideEffects = false): AttemptOutcome => ({ kind: 'failed', error, sideEffects }) as AttemptOutcome;

  it('healthy primary: one attempt, no fallback', async () => {
    const r = await run({ 'gemini/primary': [{ kind: 'done' }] });
    expect(r.result).toEqual({ kind: 'done', model: 'gemini/primary', usedBackup: false });
    expect(r.calls).toHaveLength(1);
  });

  it('invalid key: no retries, immediate switch to backup on a fresh session (Task C)', async () => {
    const r = await run({ 'gemini/primary': [fail('401 API key not valid')], 'groq/backup': [{ kind: 'done' }] });
    expect(r.result).toEqual({ kind: 'done', model: 'groq/backup', usedBackup: true });
    expect(r.calls).toEqual([
      { model: 'gemini/primary', attemptNo: 1, freshSession: false },
      { model: 'groq/backup', attemptNo: 1, freshSession: true },
    ]);
    expect(r.sleeps).toEqual([]);
    expect(r.states.map((s) => s.kind)).toEqual(['failed', 'switching', 'recovered']);
  });

  it('transient failures retry with exponential backoff, then fall back', async () => {
    const r = await run({ 'gemini/primary': [fail('503 Service Unavailable'), fail('503'), fail('503')], 'groq/backup': [{ kind: 'done' }] });
    expect(r.sleeps).toEqual([1000, 2000]);
    expect(r.calls.filter((c) => c.model === 'gemini/primary')).toHaveLength(3);
    expect(r.result.kind).toBe('done');
  });

  it('cancellation is never treated as a provider failure', async () => {
    const r = await run({ 'gemini/primary': [{ kind: 'cancelled' }] });
    expect(r.result).toEqual({ kind: 'cancelled' });
    expect(r.calls).toHaveLength(1);
  });

  it('never replays after an approved side effect ran', async () => {
    const r = await run({ 'gemini/primary': [fail('503', true)], 'groq/backup': [{ kind: 'done' }] });
    expect(r.result).toMatchObject({ kind: 'failed', reason: 'side_effects' });
    expect(r.calls).toHaveLength(1);
  });

  it('no backup configured → clear failure after retries (minimum Task C behaviour)', async () => {
    const r = await run({ 'gemini/primary': [fail('connect ECONNREFUSED'), fail('ECONNREFUSED'), fail('ECONNREFUSED')] }, { ...policy, backup: undefined as unknown as string });
    expect(r.result).toMatchObject({ kind: 'failed', failure: 'unreachable', reason: 'exhausted' });
    expect(r.states.at(-1)!.kind).toBe('exhausted');
  });

  it('backoff is bounded and jittered', () => {
    expect(backoffDelay(1, policy, () => 0)).toBe(800);
    expect(backoffDelay(10, policy, () => 1)).toBe(8000);
  });
});

import { loopbackCandidates } from '../../src/trueforge/client';
describe('loopbackCandidates', () => {
  it('probes IPv6 and IPv4 loopback for localhost (TrueForge 0.185.1 binds [::1] on macOS)', () => {
    expect(loopbackCandidates('http://localhost:8790')).toEqual(['http://localhost:8790', 'http://[::1]:8790', 'http://127.0.0.1:8790']);
    expect(loopbackCandidates('https://tf.example.com/')).toEqual(['https://tf.example.com']);
  });
});
