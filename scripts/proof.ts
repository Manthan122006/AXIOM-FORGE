/**
 * Integration proof against a REAL local TrueForge (no mocks):
 *   1. starts the real AXIOM Forge MCP server on 127.0.0.1 for a workspace
 *   2. registers it + the agent definition in TrueForge
 *   3. checks TrueForge can list our tools through its own MCP client
 *   4. creates a session and streams one turn, logging every event to tests/fixtures/trueforge-events/recorded/
 *   5. on tool.approval_required for propose_edit: stages the diff, prints hunks, then allows or denies (--deny)
 *   6. --cancel-after <n>: calls sessions.cancel after n events
 *
 *   npx tsx scripts/proof.ts --model <name> [--workspace fixtures/flask] [--prompt "..."] [--deny] [--cancel-after 5] [--pace <s>] [--budget <tokens>]
 *
 * Without a configured model provider the turn is expected to end in an error; that output is
 * recorded too and is real evidence of the failure path.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ContextEngine } from '../src/context/engine';
import { StepPacer } from '../src/mcp/pacer';
import { startMcpHttpServer, TOOL } from '../src/mcp/server';
import { ApprovalRegistry } from '../src/safety/approvals';
import { SafeChange } from '../src/safety/safeChange';
import { stageProposeEdits } from '../src/safety/stage';
import { classifyFailure } from '../src/trueforge/classify';
import { TrueForgeConnection } from '../src/trueforge/client';
import { TurnTracker } from '../src/trueforge/reducer';
import { NodeWorkspaceHost } from '../src/workspace/host';
import { loadAgentDefinition, registerMcp, setupTrueForge } from './setup-trueforge';

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const base = arg('base', 'http://localhost:8790')!;
  const model = arg('model', process.env.AXIOM_PRIMARY_MODEL);
  const workspace = path.resolve(arg('workspace', 'fixtures/flask')!);
  const prompt = arg('prompt', 'Call assemble_context for: "explain get_debug_flag". Then reply with one sentence.')!;
  const cancelAfter = arg('cancel-after') ? Number(arg('cancel-after')) : undefined;
  if (!model) throw new Error('--model is required');

  const host = new NodeWorkspaceHost(workspace);
  const approvals = new ApprovalRegistry();
  const safeChange = new SafeChange(host);
  const engine = new ContextEngine(workspace);
  const paceS = Number(arg('pace') ?? 0);
  const budget = arg('budget') ? Number(arg('budget')) : undefined;
  const mcp = await startMcpHttpServer({ host, engine, approvals, safeChange, ...(paceS > 0 ? { pacer: new StepPacer(() => paceS * 1000), onPaced: (ms: number) => console.log(`[pace] held ${Math.round(ms)} ms`) } : {}), ...(budget ? { budgetTokens: () => budget } : {}), onReceipt: (r) => console.log(`[receipt] ${r.selected.length} files, ${r.budget.usedTokens}/${r.budget.limitTokens} tokens`) }, 7811);
  console.log(`[mcp] listening ${mcp.url}`);

  const agentFile = path.join(__dirname, '..', 'agents', 'axiom-agent.json');
  await registerMcp({ base, mcpUrl: mcp.url });
  const tools = await fetch(`${base}/api/v1/mcp-servers/axiom-forge/tools`).then((r) => r.json() as Promise<{ data?: Array<{ name: string }> }>);
  console.log(`[trueforge→mcp] tools visible to TrueForge: ${(tools.data ?? []).map((t) => t.name).join(', ')}`);

  const tf = new TrueForgeConnection(base);
  let sessionId: string;
  try {
    const reg = await setupTrueForge({ base, mcpUrl: mcp.url, model, agentFile });
    console.log(`[setup] agent ${reg.agent} (${reg.agentId})`);
    sessionId = await tf.createSession({ agentName: reg.agent, model, preferSaved: true });
  } catch (e) {
    console.log(`[setup] saved agent unavailable: ${(e as Error).message}`);
    console.log('[setup] falling back to an inline agent spec (same manifest) to observe session/turn behaviour');
    const def = loadAgentDefinition(agentFile, model);
    try {
      const res = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent: { spec: def.manifest } }) });
      const body = (await res.json()) as { data?: { id: string }; error?: unknown };
      console.log(`[session create inline] HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      if (!body.data) throw new Error('inline session rejected');
      sessionId = body.data.id;
    } catch (e2) {
      console.log(`[result] cannot create a session without a configured model provider: ${(e2 as Error).message}`);
      await mcp.close();
      return;
    }
  }
  console.log(`[session] ${sessionId}  ${tf.sessionUrl(sessionId)}`);

  const log: unknown[] = [];
  const tracker = new TurnTracker();
  let n = 0;
  const consume = async (events: AsyncIterable<unknown>) => {
    for await (const ev of events as AsyncIterable<Parameters<TurnTracker['apply']>[0]>) {
      log.push(ev);
      tracker.apply(ev);
      n++;
      console.log(`[event ${n}] ${ev.type}${ev.type === 'turn.done' ? ' ' + JSON.stringify((ev as { state: unknown }).state) : ''}`);
      if (cancelAfter && n === cancelAfter) {
        console.log('[cancel] sessions.cancel()');
        await tf.cancel(sessionId);
      }
      if (ev.type === 'turn.update' && tracker.status === 'paused') return 'paused';
    }
    return 'ended';
  };

  let state = await consume(await tf.streamTurn(sessionId, { text: prompt }));
  while (state === 'paused') {
    const decisions: Array<{ toolCallId: string; threadId: string; allow: boolean; reason?: string }> = [];
    const allowAll = !flag('deny');
    // Same path as the extension: all propose_edit calls of this pause are staged together (same-file
    // edits merged into one proposal), and everything approved is one all-or-nothing change set.
    const ids = tracker.pendingApprovals();
    const edits = ids.map((id) => tracker.lookup(id)!).filter((c) => c.toolName === TOOL.proposeEdit);
    const staged = await stageProposeEdits(edits.map((c) => ({ toolCallId: c.toolCallId, rawArgs: c.args })), { sessionId, turnId: tracker.turnId! }, host, safeChange);
    const approved = new Set<string>();
    for (const r of staged) {
      if (!r.ok) {
        console.log(`[stage] ${r.toolCallId} not staged: ${r.error}`);
        continue;
      }
      if (r.mergedWith.length) console.log(`[stage] ${r.toolCallId} merged with ${r.mergedWith.join(', ')} into one proposal`);
      if (!approved.has(r.proposal.id) && r.proposal.status === 'staged') {
        console.log(`[stage] ${r.proposal.path}: ${r.proposal.hunks.length} hunk(s)\n${r.proposal.hunks.map((h) => h.lines.join('\n')).join('\n---\n')}`);
        safeChange.decideAll(r.proposal.id, allowAll ? 'accepted' : 'rejected');
        safeChange.closeReview(r.proposal.id);
        if (allowAll) approved.add(r.proposal.id);
      }
    }
    if (approved.size) safeChange.createChangeSet([...approved]);
    for (const id of ids) {
      const call = tracker.lookup(id)!;
      console.log(`[approval] ${call.toolName} ${call.rawArgs.slice(0, 300)}`);
      let allow = allowAll;
      if (call.toolName === TOOL.proposeEdit) {
        const r = staged.find((x) => x.toolCallId === id);
        allow = allow && !!r?.ok;
        if (allow && r?.ok) approvals.grant(TOOL.proposeEdit, call.args, id, { proposalId: r.proposal.id });
      } else if (call.toolName === TOOL.runCommand && allow) {
        approvals.grant(TOOL.runCommand, call.args, id, null);
      }
      decisions.push({ toolCallId: id, threadId: call.threadId, allow, reason: allow ? undefined : 'Denied in proof run.' });
    }
    await tf.sendApprovals(sessionId, tracker.turnId!, decisions);
    state = await consume(await tf.subscribe(sessionId, tracker.turnId!, tracker.lastEventId));
  }

  const outDir = path.join(__dirname, '..', 'tests', 'fixtures', 'trueforge-events', 'recorded');
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${flag('deny') ? 'deny' : cancelAfter ? 'cancel' : 'allow'}.json`);
  writeFileSync(file, JSON.stringify({ recordedAt: new Date().toISOString(), trueforge: base, model, sessionId, prompt, events: log }, null, 2));
  console.log(`[done] status=${tracker.status}${tracker.error ? ` error="${tracker.error}" class=${classifyFailure(tracker.error)}` : ''}; ${log.length} events → ${path.relative(process.cwd(), file)}`);
  await mcp.close();
}

main().catch((e) => {
  console.error('[proof failed]', (e as Error).message);
  process.exit(1);
});
