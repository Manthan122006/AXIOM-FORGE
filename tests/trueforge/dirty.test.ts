import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { PerfLog } from '../../src/shared/perf';
import { TurnTracker } from '../../src/trueforge/reducer';
import { approvalContinuation, approvalTurn } from '../fixtures/trueforge-events/synthetic';

type Ev = TrueForgeApi.TurnStreamingEvent;

describe('TurnTracker dirty tracking (host syncs only changed rows)', () => {
  it('a text delta dirties only that text row', () => {
    const t = new TurnTracker();
    for (const ev of approvalTurn()) t.apply(ev);
    t.drainDirty();
    t.apply({ type: 'model.message', id: 'm9', threadId: 'main', createdAt: 'x', content: 'a' } as Ev);
    expect(t.drainDirty()).toEqual(['text:m9']);
    t.apply({ type: 'model.message.delta', id: 'm9', threadId: 'main', content: 'b' } as Ev);
    expect(t.drainDirty()).toEqual(['text:m9']);
    expect(t.eventById('text:m9')).toMatchObject({ text: 'ab' });
  });

  it('approval and tool response dirty the tool row; nothing else', () => {
    const t = new TurnTracker();
    for (const ev of approvalTurn()) t.apply(ev);
    t.drainDirty();
    const [approval, , response] = approvalContinuation(true);
    t.apply(approval!);
    expect(t.drainDirty()).toEqual(['tool:call-edit']);
    t.apply(response!);
    expect(t.drainDirty()).toEqual(['tool:call-edit']);
    expect(t.drainDirty()).toEqual([]);
  });

  it('incomplete streamed tool arguments are not parsed; complete ones are', () => {
    const t = new TurnTracker();
    t.apply({ type: 'model.message', id: 'p', threadId: 'main', createdAt: 'x', content: null, toolCalls: [{ id: 'c', type: 'function', function: { name: 'axiom-forge__read_file', arguments: '' }, toolInfo: { type: 'mcp', name: 'read_file', serverId: 's', serverName: 'axiom-forge' } }] } as Ev);
    t.apply({ type: 'model.message.delta', id: 'p', threadId: 'main', toolCalls: [{ index: 0, function: { arguments: '{"path":"a' } }] } as unknown as Ev);
    expect(t.toolCalls.get('c')!.args).toEqual({});
    t.apply({ type: 'model.message.delta', id: 'p', threadId: 'main', toolCalls: [{ index: 0, function: { arguments: '.py"}' } }] } as unknown as Ev);
    expect(t.toolCalls.get('c')!.args).toEqual({ path: 'a.py' });
  });
});

describe('PerfLog', () => {
  it('attributes work to a stall window and reports per-label stats', () => {
    const p = new PerfLog(8);
    p.record('context.assemble', 100, 40);
    p.record('webview.post', 500, 2);
    p.record('safechange.diff', 1000, 300);
    expect(p.during(950, 1400).map((s) => s.label)).toEqual(['safechange.diff']);
    expect(p.during(0, 1400).map((s) => s.label)).toEqual(['safechange.diff', 'context.assemble', 'webview.post']);
    expect(p.snapshot()['safechange.diff']).toMatchObject({ count: 1, maxMs: 300, over50: 1 });
    expect(p.report()).toMatch(/safechange\.diff\s+1/);
  });

  it('span() measures synchronous work and still records when it throws', () => {
    const p = new PerfLog();
    expect(() => p.span('boom', () => {
      throw new Error('x');
    })).toThrow('x');
    expect(p.snapshot().boom!.count).toBe(1);
  });

  it('ring buffer keeps only the most recent spans', () => {
    const p = new PerfLog(2);
    p.record('a', 0, 1);
    p.record('b', 10, 1);
    p.record('c', 20, 1);
    expect(p.during(0, 100).map((s) => s.label).sort()).toEqual(['b', 'c']);
  });
});

import { classifyFailure as classify } from '../../src/trueforge/classify';

describe('classifyFailure on messages recorded from live TrueForge runs (18 Nov)', () => {
  it('Groq rejecting reasoning_content (HTTP 400) → bad_config: no retry, fall back', () => {
    expect(classify("[Model Error] Request failed (400): 'messages.2' : for 'role:assistant' the following must be satisfied[('messages.2' : property 'reasoning_content' is unsupported)]")).toBe('bad_config');
  });
  it('Gemini 503 high demand → server (transient)', () => {
    expect(classify('[Model Error] Request failed (503): This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.')).toBe('server');
  });
  it('provider headers timeout → timeout (transient)', () => {
    expect(classify('[Model Error] Cannot connect to API: Headers Timeout Error')).toBe('timeout');
  });
});

describe('deferred tools via TrueForge call_tool (observed live)', () => {
  it('lookup unwraps call_tool → run_command with the exact input the MCP server receives', () => {
    const t = new TurnTracker();
    const args = JSON.stringify({ tool_name: 'run_command', input: { command: 'pytest tests/test_cli.py -q' }, mcp_server: 'axiom-forge' });
    t.apply({ type: 'model.message', id: 'm', threadId: 'main', createdAt: 'x', content: null, toolCalls: [{ id: 'c1', type: 'function', function: { name: 'call_tool', arguments: args }, toolInfo: { type: 'truefoundry-system', name: 'call_tool' } }] } as Ev);
    t.apply({ type: 'tool.approval_required', id: 'a', threadId: 'main', createdAt: 'x', toolCalls: [{ id: 'c1', sourceEventId: 'm' }] } as Ev);
    expect(t.lookup('c1')).toMatchObject({ toolName: 'run_command', server: 'axiom-forge', args: { command: 'pytest tests/test_cli.py -q' } });
    expect(t.toolCalls.get('c1')).toMatchObject({ toolName: 'run_command', server: 'axiom-forge', args: { command: 'pytest tests/test_cli.py -q' } });
  });
  it('call_tool for another server stays foreign (generic approval)', () => {
    const t = new TurnTracker();
    t.apply({ type: 'model.message', id: 'm', threadId: 'main', createdAt: 'x', content: null, toolCalls: [{ id: 'c2', type: 'function', function: { name: 'call_tool', arguments: '{"tool_name":"delete_all","input":{},"mcp_server":"other"}' }, toolInfo: { type: 'truefoundry-system', name: 'call_tool' } }] } as Ev);
    expect(t.lookup('c2')).toMatchObject({ toolName: 'delete_all', server: 'other' });
  });
});
