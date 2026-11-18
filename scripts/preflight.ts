/**
 * TrueForge integration preflight. Runs WITHOUT model keys and never calls a model provider.
 * Checks what can be checked live today and lists every model-dependent step as UNVERIFIED.
 *
 *   npx tsx scripts/preflight.ts [--url http://localhost:8790] [--primary <model>] [--backup <model>]
 *
 * If nothing is listening on the MCP port (VS Code not running), a temporary AXIOM Forge MCP server
 * is started on 127.0.0.1:<port> for the tool-discovery check and stopped afterwards.
 */
import path from 'node:path';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { ContextEngine } from '../src/context/engine';
import { startMcpHttpServer, type RunningMcpServer } from '../src/mcp/server';
import { ApprovalRegistry } from '../src/safety/approvals';
import { SafeChange } from '../src/safety/safeChange';
import { classifyFailure } from '../src/trueforge/classify';
import { TrueForgeConnection } from '../src/trueforge/client';
import { loadAgentDefinition } from '../src/trueforge/setup';
import { NodeWorkspaceHost } from '../src/workspace/host';

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const url = arg('url', 'http://localhost:8790')!;
const primary = arg('primary', process.env.AXIOM_PRIMARY_MODEL);
const backup = arg('backup', process.env.AXIOM_BACKUP_MODEL);
const MCP_PORT = Number(arg('mcp-port', '7811'));
const EXPECTED_TOOLS = ['assemble_context', 'find_symbol', 'propose_edit', 'read_file', 'related_files', 'run_command', 'search_workspace'];

type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'UNVERIFIED';
const rows: Array<[Status, string, string]> = [];
const row = (s: Status, check: string, detail: string) => rows.push([s, check, detail]);

void (async () => {
  // 1. Agent definitions (the committed files the extension sends inline): agent mode and inline edits.
  for (const [file, mustGate, tools] of [
    ['agents/axiom-agent.json', ['propose_edit', 'run_command'], null],
    ['agents/axiom-agent-inline.json', ['propose_edit'], ['read_file', 'propose_edit']],
  ] as const) {
    try {
      const def = loadAgentDefinition(path.resolve(file), primary ?? 'MODEL');
      const m = def.manifest as { instructions?: string; mcp_servers?: Array<{ name: string; enable_tools?: string[]; require_approval_for_tools?: string[] }> };
      const srv = m.mcp_servers?.find((s) => s.name === 'axiom-forge');
      const gated = new Set(srv?.require_approval_for_tools ?? []);
      const toolsOk = !tools || JSON.stringify(srv?.enable_tools ?? []) === JSON.stringify(tools);
      const ok = !!m.instructions && !!srv && mustGate.every((t) => gated.has(t)) && toolsOk;
      row(ok ? 'PASS' : 'FAIL', `agent definition ${path.basename(file)}`, ok ? `approval required for ${[...gated].join(', ')}${tools ? `; tools limited to ${tools.join(', ')}` : ''}` : 'missing instructions, MCP server, approval list or tool limit');
    } catch (e) {
      row('FAIL', `agent definition ${path.basename(file)}`, (e as Error).message);
    }
  }

  // 2. TrueForge reachable (real HTTP, IPv4/IPv6 loopback probing)
  const tf = new TrueForgeConnection(url);
  const h = await tf.health();
  if (!h.ok) {
    row('FAIL', 'TrueForge reachable', h.reason);
  } else {
    row('PASS', 'TrueForge reachable', `${tf.baseUrl} answered /api/v1/models`);
    // 3. Models configured in TrueForge (keys are added in TrueForge Settings → Models, never here)
    if (h.models.length === 0) row('BLOCKED', 'models configured in TrueForge', 'no models yet: add Gemini + Groq keys in TrueForge Settings → Models');
    else row('PASS', 'models configured in TrueForge', `${h.models.length} model(s): ${h.models.slice(0, 6).join(', ')}${h.models.length > 6 ? ', …' : ''}`);
    for (const [slot, name] of [['primary', primary], ['backup', backup]] as const) {
      if (!name) row('BLOCKED', `${slot} model chosen`, `pass --${slot} <name> (exact name from the list above)`);
      else row(h.models.includes(name) ? 'PASS' : 'FAIL', `${slot} model exists`, h.models.includes(name) ? name : `${name} is not in TrueForge's model list`);
    }

    // 4. MCP tools discoverable by TrueForge
    let temp: RunningMcpServer | null = null;
    try {
      const probe = await fetch(`http://127.0.0.1:${MCP_PORT}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' }).catch(() => null);
      if (!probe) {
        const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-preflight-')));
        writeFileSync(path.join(root, 'README.md'), 'preflight\n');
        const host = new NodeWorkspaceHost(root);
        temp = await startMcpHttpServer({ host, engine: new ContextEngine(root), approvals: new ApprovalRegistry(), safeChange: new SafeChange(host) }, MCP_PORT);
      }
      const res = await fetch(`${tf.baseUrl}/api/v1/mcp-servers/axiom-forge/tools`);
      const names = res.ok ? (((await res.json()) as { data?: Array<{ name: string }> }).data ?? []).map((t) => t.name).sort() : [];
      const ok = JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS);
      row(ok ? 'PASS' : 'FAIL', 'TrueForge lists the 7 MCP tools', ok ? `${names.join(', ')}${temp ? ' (via a temporary MCP server)' : ' (via the running extension)'}` : `HTTP ${res.status}; got [${names.join(', ')}]. Run "AXIOM Forge: Register MCP Server and Agent in TrueForge" and start TrueForge with OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]'`);
    } finally {
      await temp?.close();
    }

    // 5. Provider vs TrueForge errors are distinguishable (live 422 from TrueForge, no provider call)
    try {
      await tf.createSession({ agentName: 'axiom-forge', model: 'axiom-preflight/does-not-exist', preferSaved: false, inlineManifest: loadAgentDefinition(path.resolve('agents/axiom-agent.json'), 'axiom-preflight/does-not-exist').manifest });
      row('FAIL', 'unknown model is rejected', 'TrueForge accepted a session for a model that does not exist');
    } catch (e) {
      const c = classifyFailure(e);
      row(c === 'bad_config' ? 'PASS' : 'FAIL', 'unknown model → bad_config (falls back)', `${(e as { statusCode?: number }).statusCode ?? '?'} → ${c}`);
    }
  }
  const down = new TrueForgeConnection('http://127.0.0.1:9');
  const dh = await down.health();
  const dc = classifyFailure(new Error(dh.ok ? '' : dh.reason));
  row(dc === 'trueforge_error' || dc === 'unreachable' ? 'PASS' : 'FAIL', 'TrueForge down ≠ provider failure', `closed port → ${dc} (ModelShield does not switch models for this)`);

  // 6. Model-dependent steps: never claimed here.
  for (const s of [
    'model calls read_file / propose_edit through TrueForge (MODEL_KEY_CHECKLIST 7–8)',
    'turn pauses on tool.approval_required; approve → write → resume (7, 9)',
    'deny → no write, model told why (10)',
    'cancel mid-turn → sessions.cancel, no write (11)',
    'approved arguments reach the MCP tool unchanged (12)',
    'invalid primary key → backup model on a fresh session, workspace clean (13–16)',
    'Tasks A, B, C end to end (DEMO_SCRIPT.md + scripts/tasks/verify-task-*.sh)',
  ]) row('UNVERIFIED', s, 'not checked by preflight (needs a model run): see the live results in MODEL_KEY_CHECKLIST.md');

  const w = Math.max(...rows.map((r) => r[1].length));
  for (const [s, c, d] of rows) console.log(`${s.padEnd(10)} ${c.padEnd(w)}  ${d}`);
  const failed = rows.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${failed ? `${failed} check(s) FAILED` : 'No failures'}; ${rows.filter((r) => r[0] === 'BLOCKED').length} blocked on keys; ${rows.filter((r) => r[0] === 'UNVERIFIED').length} model-dependent steps not checked by preflight.`);
  process.exitCode = failed ? 1 : 0;
})();
