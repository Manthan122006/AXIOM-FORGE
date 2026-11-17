/** Cold vs warm cost of building the MCP server (7 tools) in a fresh Node process: npx tsx scripts/bench-build.ts */
import { mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ContextEngine } from '../src/context/engine';
import { buildMcpServer } from '../src/mcp/server';
import { ApprovalRegistry } from '../src/safety/approvals';
import { SafeChange } from '../src/safety/safeChange';
import { NodeWorkspaceHost } from '../src/workspace/host';

const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-bb-')));
const host = new NodeWorkspaceHost(root);
const deps = { host, engine: new ContextEngine(root), approvals: new ApprovalRegistry(), safeChange: new SafeChange(host) };
const times: string[] = [];
for (let i = 0; i < 5; i++) {
  const t = performance.now();
  buildMcpServer(deps);
  times.push((performance.now() - t).toFixed(1));
}
console.log(`buildMcpServer: ${times.join(' ms, ')} ms (first = cold)`);
