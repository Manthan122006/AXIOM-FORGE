/**
 * Measure the fixed input-token cost of one model request for an agent definition, using the
 * metrics TrueForge reports in turn.done. One cheap no-tool turn per agent file; writes nothing.
 *
 *   npx tsx scripts/measure-request.ts --model groq/qwen-3-8-27b agents/axiom-agent.json agents/axiom-agent-inline.json
 */
import path from 'node:path';
import { ContextEngine } from '../src/context/engine';
import { startMcpHttpServer } from '../src/mcp/server';
import { ApprovalRegistry } from '../src/safety/approvals';
import { SafeChange } from '../src/safety/safeChange';
import { TrueForgeConnection } from '../src/trueforge/client';
import { loadAgentDefinition } from '../src/trueforge/setup';
import { NodeWorkspaceHost } from '../src/workspace/host';

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model');
const model = argv[mi + 1]!;
const files = argv.filter((a, i) => i !== mi && i !== mi + 1);

void (async () => {
  const root = path.resolve('fixtures/flask');
  const host = new NodeWorkspaceHost(root);
  const mcp = await startMcpHttpServer({ host, engine: new ContextEngine(root), approvals: new ApprovalRegistry(), safeChange: new SafeChange(host) }, 7811);
  const tf = new TrueForgeConnection('http://localhost:8790');
  const h = await tf.health();
  if (!h.ok) throw new Error(h.reason);
  try {
    for (const f of files) {
      const def = loadAgentDefinition(path.resolve(f), model);
      const sessionId = await tf.createSession({ agentName: def.name, model, preferSaved: false, inlineManifest: def.manifest });
      let metrics: unknown = null;
      let status = '';
      let requests = 0;
      for await (const ev of await tf.streamTurn(sessionId, { text: 'Reply with the single word OK. Do not call any tools.' })) {
        if (ev.type === 'model.message') requests++;
        if (ev.type === 'turn.done') {
          status = ev.state.status === 'error' ? `error: ${ev.state.message.slice(0, 120)}` : ev.state.status;
          metrics = (ev.state as { metrics?: unknown }).metrics ?? null;
          break;
        }
      }
      const m = metrics as { totalInputTokens?: number; totalOutputTokens?: number } | null;
      console.log(`${path.basename(f).padEnd(28)} ${status.padEnd(6)} requests=${requests} inputTokens=${m?.totalInputTokens ?? '?'} outputTokens=${m?.totalOutputTokens ?? '?'}`);
    }
  } finally {
    await mcp.close();
  }
})();
