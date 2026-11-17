import { describe, expect, it } from 'vitest';
import type { AgentEvent, AxiomState } from '../../src/shared/contracts';
import { reconcile } from './reconcile';
import { EMPTY_STATE } from './store';

const clone = <T>(x: T): T => structuredClone(x); // what postMessage does

const ev = (id: string, text: string, streaming = false): AgentEvent => ({ kind: 'assistant_text', id, threadId: 'main', text, streaming, at: 't' });

describe('reconcile (streaming rerender guard)', () => {
  it('keeps identity of unchanged rows and replaces only the streaming one', () => {
    const prev: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'done'), ev('b', 'stream', true)] };
    const incoming = clone({ ...prev, timeline: [ev('a', 'done'), ev('b', 'streaming more', true)] });
    const next = reconcile(prev, incoming);
    expect(next.timeline[0]).toBe(prev.timeline[0]); // memo will skip this row
    expect(next.timeline[1]).not.toBe(prev.timeline[1]);
    expect(next.timeline[1]).toMatchObject({ text: 'streaming more' });
  });

  it('returns the same timeline array and maps when nothing changed', () => {
    const prev: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'x')], proposals: {}, receipts: {} };
    const next = reconcile(prev, clone(prev));
    expect(next.timeline).toBe(prev.timeline);
    expect(next.proposals).toBe(prev.proposals);
    expect(next.session).toBe(prev.session);
  });

  it('appending a row keeps the existing rows', () => {
    const prev: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'x')] };
    const next = reconcile(prev, clone({ ...prev, timeline: [ev('a', 'x'), ev('b', 'y')] }));
    expect(next.timeline).toHaveLength(2);
    expect(next.timeline[0]).toBe(prev.timeline[0]);
  });
});
