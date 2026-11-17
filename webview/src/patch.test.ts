import { describe, expect, it } from 'vitest';
import type { AgentEvent, AxiomState } from '../../src/shared/contracts';
import { reconcile } from './reconcile';
import { applyPatch, EMPTY_STATE } from './store';

const ev = (id: string, text: string): AgentEvent => ({ kind: 'assistant_text', id, threadId: 'main', text, streaming: true, at: 't' });

describe('patch protocol (host sends only changed slices and rows)', () => {
  it('a sequence of patches yields exactly the state a full post would', () => {
    let viaPatches: AxiomState = structuredClone({ ...EMPTY_STATE, timeline: [ev('a', 'x')] });
    const full: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'xy'), ev('b', 'new')], session: { ...EMPTY_STATE.session, status: 'running' } };
    viaPatches = reconcile(viaPatches, applyPatch(viaPatches, structuredClone({ type: 'patch', patch: { session: full.session }, timeline: { length: 2, set: [[0, ev('a', 'xy')], [1, ev('b', 'new')]] } })));
    expect(viaPatches).toEqual(full);
  });

  it('unchanged rows keep identity (no rerender) and untouched slices are the same object', () => {
    const prev: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'done'), ev('b', 'stream')] };
    const next = reconcile(prev, applyPatch(prev, structuredClone({ type: 'patch', patch: {}, timeline: { length: 2, set: [[1, ev('b', 'stream more')]] } })));
    expect(next.timeline[0]).toBe(prev.timeline[0]);
    expect(next.timeline[1]).toMatchObject({ text: 'stream more' });
    expect(next.proposals).toBe(prev.proposals);
    expect(next.receipts).toBe(prev.receipts);
  });

  it('a patch without timeline rows leaves the timeline array untouched', () => {
    const prev: AxiomState = { ...EMPTY_STATE, timeline: [ev('a', 'x')] };
    const next = reconcile(prev, applyPatch(prev, { type: 'patch', patch: { connection: { kind: 'connecting' } } }));
    expect(next.timeline).toBe(prev.timeline);
    expect(next.connection).toEqual({ kind: 'connecting' });
  });
});
