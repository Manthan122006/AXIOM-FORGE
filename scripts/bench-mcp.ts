/**
 * Measure MCP request cost on the extension-host thread: wall time per request and the longest
 * synchronous block (event-loop delay) while TrueForge-like clients call tools/list and read_file.
 *   npx tsx scripts/bench-mcp.ts [requests]
 */
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { ContextEngine } from '../src/context/engine';
import { startMcpHttpServer } from '../src/mcp/server';
import { ApprovalRegistry } from '../src/safety/approvals';
import { SafeChange } from '../src/safety/safeChange';
import { NodeWorkspaceHost } from '../src/workspace/host';

void (async () => {
  const n = Number(process.argv[2] ?? 40);
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-bench-')));
  writeFileSync(path.join(root, 'a.py'), 'def f():\n    return 1\n');
  const host = new NodeWorkspaceHost(root);
  const srv = await startMcpHttpServer({ host, engine: new ContextEngine(root), approvals: new ApprovalRegistry(), safeChange: new SafeChange(host) }, 0);
  const rpc = async (method: string, params: unknown, id: number) => {
    const r = await fetch(srv.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return r.text();
  };
  const init = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bench', version: '0' } };
  await rpc('initialize', init, 0); // warm-up (module init)
  const lag = monitorEventLoopDelay({ resolution: 1 });
  lag.enable();
  const times: number[] = [];
  for (let i = 1; i <= n; i++) {
    const t = performance.now();
    await rpc(i % 2 ? 'tools/list' : 'tools/call', i % 2 ? {} : { name: 'read_file', arguments: { path: 'a.py' } }, i);
    times.push(performance.now() - t);
  }
  // burst: 10 concurrent requests, as when a model issues parallel tool calls
  const tb = performance.now();
  await Promise.all(Array.from({ length: 10 }, (_, i) => rpc('tools/list', {}, 1000 + i)));
  const burst = performance.now() - tb;
  lag.disable();
  times.sort((a, b) => a - b);
  console.log(`${n} sequential requests: p50 ${times[n >> 1]!.toFixed(1)} ms, p95 ${times[Math.floor(n * 0.95)]!.toFixed(1)} ms, max ${times[n - 1]!.toFixed(1)} ms; burst of 10 concurrent: ${burst.toFixed(0)} ms; longest event-loop block ${(lag.max / 1e6).toFixed(1)} ms`);
  console.log(`servers built: ${JSON.stringify(srv.stats?.() ?? 'n/a (before pooling)')}`);
  await srv.close();
})();
