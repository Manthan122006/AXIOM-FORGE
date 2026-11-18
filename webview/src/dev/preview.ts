/**
 * BROWSER PREVIEW ONLY: never loaded inside VS Code (see main.tsx).
 * Replays a SIMULATED Task B run so the UI can be designed and screenshotted without a model.
 * The Context Receipt and diff hunks in fixture.json are real outputs of our engine on Flask 3.1.3;
 * the agent turn (timing, tool calls, text) is simulated.
 */
import type { AgentEvent, AxiomState, ProposedEdit, ToolCallState, WebviewToHost } from '../../../src/shared/contracts';
import { EMPTY_STATE, getState, setPreviewSink, setState } from '../store';
import fixture from './fixture.json';

const now = () => new Date().toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const patch = (fn: (s: AxiomState) => AxiomState) => setState(fn(getState()));
const pushEv = (ev: AgentEvent) => patch((s) => ({ ...s, timeline: [...s.timeline, ev] }));
const setTool = (id: string, change: Partial<ToolCallState>) => {
  const done = change.phase === 'succeeded' || change.phase === 'failed' || change.phase === 'denied';
  patch((s) => ({ ...s, timeline: s.timeline.map((e) => (e.kind === 'tool_call' && e.call.toolCallId === id ? { ...e, call: { ...e.call, ...change, ...(done ? { finishedAt: now() } : {}) } } : e)) }));
};
/** Mirrors the controller: ModelShield transitions update the banner AND are kept in the timeline. */
const shield = (r: AxiomState['recovery']) => {
  patch((s) => ({ ...s, recovery: r }));
  pushEv({ kind: 'recovery', id: `recovery:${Date.now()}:${r.kind}`, state: r, at: now() });
};

function tool(id: string, toolName: string, args: Record<string, unknown>): AgentEvent {
  return { kind: 'tool_call', id: `tool:${id}`, threadId: 'main', call: { toolCallId: id, server: 'axiom-forge', toolName, args, phase: 'running', startedAt: now() } };
}

async function stream(id: string, text: string) {
  pushEv({ kind: 'assistant_text', id, threadId: 'main', text: '', streaming: true, at: now() });
  const words = text.split(/(\s+)/);
  let acc = '';
  for (const w of words) {
    acc += w;
    const t = acc;
    patch((s) => ({ ...s, timeline: s.timeline.map((e) => (e.id === id && e.kind === 'assistant_text' ? { ...e, text: t } : e)) }));
    await wait(18);
  }
  patch((s) => ({ ...s, timeline: s.timeline.map((e) => (e.id === id && e.kind === 'assistant_text' ? { ...e, streaming: false } : e)) }));
}

function handle(msg: WebviewToHost) {
  const s = getState();
  const upd = (id: string, fn: (p: ProposedEdit) => ProposedEdit) => setState({ ...s, proposals: { ...s.proposals, [id]: fn(s.proposals[id]!) } });
  switch (msg.type) {
    case 'hunkDecision':
      upd(msg.proposalId, (p) => ({ ...p, hunks: p.hunks.map((h) => (h.id === msg.hunkId ? { ...h, decision: msg.decision } : h)) }));
      break;
    case 'acceptAll':
    case 'rejectAll': {
      const d = msg.type === 'acceptAll' ? 'accepted' : 'rejected';
      const proposals = { ...s.proposals };
      for (const id of msg.proposalIds) proposals[id] = { ...proposals[id]!, hunks: proposals[id]!.hunks.map((h) => ({ ...h, decision: d })) };
      setState({ ...s, proposals });
      break;
    }
    case 'submitReview': {
      const proposals = { ...s.proposals };
      for (const p of Object.values(proposals)) {
        if (p.status !== 'staged') continue;
        const any = p.hunks.some((h) => h.decision === 'accepted');
        proposals[p.id] = { ...p, status: any ? 'applied' : 'rejected', hunks: p.hunks.map((h) => ({ ...h, applyState: h.decision === 'accepted' ? 'applied' : 'not_applied' })) };
      }
      setState({ ...s, proposals, session: { ...s.session, status: 'running' } });
      void finish();
      break;
    }
    case 'undo':
      upd(msg.proposalId, (p) => ({ ...p, status: 'undone', hunks: p.hunks.map((h) => ({ ...h, applyState: h.applyState === 'applied' ? 'reverted' : h.applyState })) }));
      break;
    case 'cancel':
      patch((x) => ({ ...x, session: { ...x.session, status: 'cancelled' } }));
      pushEv({ kind: 'turn_end', id: `end-${Date.now()}`, status: 'cancelled', at: now() });
      break;
    case 'mentionQuery':
      window.postMessage({ type: 'mentionResults', query: msg.query, items: [{ kind: 'symbol', label: 'get_debug_flag', detail: 'function · src/flask/helpers.py:28' }, { kind: 'file', label: 'src/flask/cli.py', detail: '1127 lines' }].filter((i) => i.label.includes(msg.query)) }, '*');
      break;
    default:
      break;
  }
}

async function finish() {
  for (const p of fixture.proposals) setTool(p.toolCallId, { phase: 'succeeded', resultPreview: `Applied hunks to ${p.path}.` });
  pushEv(tool('call-test', 'run_command', { command: 'pytest tests/test_cli.py -q' }));
  setTool('call-test', { phase: 'awaiting_approval' });
  await wait(700);
  setTool('call-test', { phase: 'running' });
  patch((s) => ({ ...s, verification: { v1: { id: 'v1', command: 'pytest tests/test_cli.py -q', cwd: '.', status: 'running', exitCode: null, durationMs: null, outputTail: '', filesAtRun: [], stale: false, startedAt: now() } } }));
  await wait(1100);
  patch((s) => ({ ...s, verification: { v1: { ...s.verification.v1!, status: 'passed', exitCode: 0, durationMs: 1240, outputTail: '(simulated) 59 passed in 1.24s' } } }));
  setTool('call-test', { phase: 'succeeded', resultPreview: 'exit code: 0 (PASSED)' });
  await stream('t3', 'Added `flask config` to the built-in commands, with a test for masking. `pytest tests/test_cli.py -q` exited 0.');
  pushEv({ kind: 'turn_end', id: 'end', status: 'done', at: now() });
  patch((s) => ({ ...s, session: { ...s.session, status: 'done' } }));
}

export async function startPreview() {
  setPreviewSink(handle);
  const mode = new URLSearchParams(location.search).get('state');
  setState({
    ...EMPTY_STATE,
    connection: { kind: 'connected', baseUrl: 'http://localhost:8790' },
    mcp: { kind: 'listening', url: 'http://127.0.0.1:7811/mcp' },
    recovery: { kind: 'healthy', model: 'google-gemini/gemini-3-5-flash' },
    // Real index size of fixtures/flask; model names as configured in the demo profile.
    workspace: { name: 'flask', files: 216, lines: 34379, symbols: 1741 },
    models: { primary: { name: 'google-gemini/gemini-3-5-flash', listed: true }, backup: { name: 'groq/qwen-3-8-27b', listed: true } },
  });
  if (mode === 'empty') return;
  if (mode === 'offline') {
    patch((s) => ({ ...s, connection: { kind: 'disconnected', reason: 'TrueForge is not reachable at http://localhost:8790 (fetch failed)' } }));
    return;
  }
  const fast = mode === 'review' || mode === 'fallback' || mode === 'done';
  patch((s) => ({ ...s, session: { sessionId: 'preview', turnId: 'preview', model: 'google-gemini/gemini-3-5-flash', modelSlot: 'primary', status: 'running' } }));
  pushEv({ kind: 'user_message', id: 'u1', text: fixture.task, at: now() });
  if (mode === 'fallback') {
    shield({ kind: 'failed', model: 'google-gemini/gemini-3-5-flash', failure: 'auth', message: '[Model Error] Request failed (400): API key not valid. Please pass a valid API key.' });
    await wait(fast ? 0 : 900);
    // Same sequence as the real ModelShield: 'recovered' is only emitted after the backup run is done,
    // so while the run (and its review) is in progress the banner stays on 'switching'.
    shield({ kind: 'switching', from: 'google-gemini/gemini-3-5-flash', to: 'groq/qwen-3-8-27b', failure: 'auth' });
    patch((s) => ({ ...s, session: { ...s.session, model: 'groq/qwen-3-8-27b', modelSlot: 'backup' } }));
  }
  pushEv(tool('call-ctx', 'assemble_context', { task: fixture.task }));
  await wait(fast ? 0 : 500);
  setTool('call-ctx', { phase: 'succeeded' });
  patch((s) => ({ ...s, receipts: { [fixture.receipt.id]: fixture.receipt as never } }));
  pushEv({ kind: 'context_receipt', id: 'rc', receiptId: fixture.receipt.id, at: now() });
  pushEv({ kind: 'subagent', id: 'sa', threadId: 'thread-scout', title: 'repo-scout', status: 'running', at: now() });
  await wait(fast ? 0 : 900);
  patch((s) => ({ ...s, timeline: s.timeline.map((e) => (e.kind === 'subagent' ? { ...e, status: 'done' } : e)) }));
  pushEv(tool('call-r1', 'read_file', { path: 'src/flask/cli.py', start_line: 580, end_line: 620 }));
  setTool('call-r1', { phase: 'succeeded', resultPreview: 'src/flask/cli.py\n  594|             self.add_command(run_command)\n  595|             self.add_command(shell_command)\n  596|             self.add_command(routes_command)' });
  if (!fast) await stream('t1', 'Built-in commands are registered in `FlaskGroup.__init__` (`run`, `shell`, `routes`). I will add `config_command` there, cover it in `tests/test_cli.py`, and document it in `docs/cli.rst`.');
  for (const p of fixture.proposals) {
    pushEv(tool(p.toolCallId, 'propose_edit', { path: p.path }));
    setTool(p.toolCallId, { phase: 'awaiting_approval' });
  }
  patch((s) => ({
    ...s,
    session: { ...s.session, status: 'paused' },
    proposals: Object.fromEntries(fixture.proposals.map((p) => [p.id, { ...(p as unknown as ProposedEdit), createdAt: now() }])),
    approval: { kind: 'pending', toolCallId: fixture.proposals[0]!.toolCallId, proposalIds: fixture.proposals.map((p) => p.id) },
  }));
  if (mode === 'done') {
    // Completed state: accept everything, apply, then the (simulated) check runs to the end.
    for (const p of fixture.proposals) handle({ type: 'acceptAll', proposalIds: [p.id] });
    handle({ type: 'submitReview' });
  }
}
