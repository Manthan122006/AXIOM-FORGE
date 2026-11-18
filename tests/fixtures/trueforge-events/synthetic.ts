/**
 * SYNTHETIC TrueForge event streams. NOT recorded from a real TrueForge run.
 *
 * They are typed against the real `@truefoundry/trueforge-sdk@0.185.0` event types and follow the
 * event order documented in TrueForge's `docs/api/overview.mdx` ("Events during Turn 2"):
 * turn.created → model.message(tool call) → tool.approval_required → turn.update(paused)
 * → user.tool_approval → turn.update(running) → tool.response → model.message + deltas → turn.done
 *
 * Use them for reducer unit tests and UI development only. Once a model is configured, replace or
 * complement them with recorded streams in `recorded/` (see docs/TRUEFORGE_INTEGRATION_STATUS.md).
 */
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

type Ev = TrueForgeApi.TurnStreamingEvent;
const t = (n: number) => new Date(Date.UTC(2026, 10, 17, 10, 0, n)).toISOString();
const mcp = (name: string) => ({ type: 'mcp' as const, name, serverId: 'srv-axiom', serverName: 'axiom-forge' });

export const PROPOSE_ARGS = {
  path: 'src/flask/helpers.py',
  rationale: "Treat 'off' and 'n' as false and document all false values.",
  edits: [{ old_text: 'return bool(val and val.lower() not in {"0", "false", "no"})', new_text: 'return bool(val and val.lower() not in {"0", "false", "no", "off", "n"})' }],
};

export function approvalTurn(): Ev[] {
  return [
    { type: 'turn.created', id: 'e1', turnId: 'turn-1', previousTurnId: null, threadId: null, createdAt: t(0), state: { status: 'running' } } as Ev,
    { type: 'model.message', id: 'm1', threadId: 'main', createdAt: t(1), content: '' } as Ev,
    { type: 'model.message.delta', id: 'm1', threadId: 'main', content: 'Reading the selected ' } as Ev,
    { type: 'model.message.delta', id: 'm1', threadId: 'main', content: 'function first.', finishReason: 'stop' } as Ev,
    {
      type: 'model.message',
      id: 'm2',
      threadId: 'main',
      createdAt: t(2),
      content: null,
      toolCalls: [{ id: 'call-read', type: 'function', function: { name: 'axiom-forge__read_file', arguments: '{"path":"src/flask/helpers.py","start_line":20,"end_line":40}' }, toolInfo: mcp('read_file') }],
    } as Ev,
    { type: 'tool.response', id: 'r1', threadId: 'main', createdAt: t(3), toolCallId: 'call-read', content: 'src/flask/helpers.py\n   28| def get_debug_flag() -> bool:' } as Ev,
    {
      type: 'model.message',
      id: 'm3',
      threadId: 'main',
      createdAt: t(4),
      content: null,
      toolCalls: [{ id: 'call-edit', type: 'function', function: { name: 'axiom-forge__propose_edit', arguments: JSON.stringify(PROPOSE_ARGS) }, toolInfo: mcp('propose_edit') }],
    } as Ev,
    { type: 'tool.approval_required', id: 'a1', threadId: 'main', createdAt: t(5), toolCalls: [{ id: 'call-edit', sourceEventId: 'm3' }] } as Ev,
    { type: 'turn.update', id: 'u1', threadId: null, createdAt: t(5), state: { status: 'paused' } } as unknown as Ev,
  ];
}

export function approvalContinuation(allow: boolean): Ev[] {
  return [
    { type: 'user.tool_approval', id: 'ua1', threadId: 'main', createdAt: t(6), toolCallId: 'call-edit', approval: allow ? { status: 'allow' } : { status: 'deny', reason: 'user rejected all hunks' } } as Ev,
    { type: 'turn.update', id: 'u2', threadId: null, createdAt: t(6), state: { status: 'running' } } as unknown as Ev,
    { type: 'tool.response', id: 'r2', threadId: 'main', createdAt: t(7), toolCallId: 'call-edit', content: allow ? 'Applied 1 of 1 hunk(s) to src/flask/helpers.py.' : 'Tool call denied: user rejected all hunks' } as Ev,
    { type: 'model.message', id: 'm4', threadId: 'main', createdAt: t(8), content: allow ? 'Done: ' : 'Understood, ' } as Ev,
    { type: 'model.message.delta', id: 'm4', threadId: 'main', content: allow ? "'off' and 'n' are now false." : 'leaving the file unchanged.', finishReason: 'stop' } as Ev,
    { type: 'turn.done', id: 'd1', threadId: null, createdAt: t(9), state: { status: 'done', completedAt: t(9), output: null, requiredActions: [] } } as Ev,
  ];
}

export function subagentAndCompaction(): Ev[] {
  return [
    { type: 'turn.created', id: 's0', turnId: 'turn-2', previousTurnId: 'turn-1', threadId: null, createdAt: t(10), state: { status: 'running' } } as Ev,
    {
      type: 'model.message',
      id: 'sm1',
      threadId: 'main',
      createdAt: t(11),
      content: null,
      toolCalls: [{ id: 'call-sub', type: 'function', function: { name: 'create_sub_agent', arguments: '{"name":"repo-scout"}' }, toolInfo: { type: 'truefoundry-system', name: 'create_sub_agent' } }],
    } as Ev,
    { type: 'thread.created', id: 'th1', threadId: 'thread-scout', title: 'repo-scout', createdAt: t(12), agentInfo: {} as never, parent: {} as never } as Ev,
    { type: 'thread.context_compaction_started', id: 'c1', threadId: 'main', createdAt: t(13), trigger: { contextTokens: 61000, thresholdTokens: 60000 } } as unknown as Ev,
    { type: 'thread.context_compaction_finished', id: 'c2', threadId: 'main', createdAt: t(14) } as unknown as Ev,
    { type: 'thread.done', id: 'th2', threadId: 'thread-scout', title: 'repo-scout', createdAt: t(15), state: { status: 'done' } as never } as Ev,
    { type: 'tool.response', id: 'sr1', threadId: 'main', createdAt: t(16), toolCallId: 'call-sub', content: 'cli.py, tests/test_cli.py, docs/cli.rst' } as Ev,
    { type: 'turn.done', id: 'sd', threadId: null, createdAt: t(17), state: { status: 'cancelled', completedAt: t(17), reason: 'client-cancelled' } } as Ev,
  ];
}

export function providerErrorTurn(message: string): Ev[] {
  return [
    { type: 'turn.created', id: 'x1', turnId: 'turn-x', previousTurnId: null, threadId: null, createdAt: t(20), state: { status: 'running' } } as Ev,
    { type: 'turn.done', id: 'x2', threadId: null, createdAt: t(21), state: { status: 'error', completedAt: t(21), message } } as Ev,
  ];
}
