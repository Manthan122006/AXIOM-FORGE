/**
 * End-to-end MCP protocol tests: a real MCP client talks to our server over Streamable HTTP
 * on 127.0.0.1, exactly as TrueForge does. No model required.
 */
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContextEngine } from '../../src/context/engine';
import { startMcpHttpServer, TOOL, type RunningMcpServer } from '../../src/mcp/server';
import { ApprovalRegistry } from '../../src/safety/approvals';
import { SafeChange } from '../../src/safety/safeChange';
import { stageProposeEdit, stageProposeEdits } from '../../src/safety/stage';
import type { ContextReceipt } from '../../src/shared/contracts';
import { NodeWorkspaceHost } from '../../src/workspace/host';

let root: string;
let srv: RunningMcpServer;
let client: Client;
let approvals: ApprovalRegistry;
let safeChange: SafeChange;
let host: NodeWorkspaceHost;
const receipts: ContextReceipt[] = [];

const SRC = `def get_flag():\n    """Return the flag."""\n    return True\n`;

beforeAll(async () => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-mcp-')));
  mkdirSync(path.join(root, 'pkg'));
  mkdirSync(path.join(root, 'tests'));
  writeFileSync(path.join(root, 'pkg', 'flags.py'), SRC);
  writeFileSync(path.join(root, 'tests', 'test_flags.py'), 'from pkg.flags import get_flag\n\ndef test_flag():\n    assert get_flag()\n');
  writeFileSync(path.join(root, '.env'), 'API_KEY=supersecret\n');
  host = new NodeWorkspaceHost(root);
  approvals = new ApprovalRegistry();
  safeChange = new SafeChange(host);
  const engine = new ContextEngine(root);
  srv = await startMcpHttpServer({ host, engine, approvals, safeChange, onReceipt: (r) => receipts.push(r) });
  client = new Client({ name: 'axiom-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.url)));
});

afterAll(async () => {
  await client?.close();
  await srv?.close();
});

const textOf = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as Array<{ text: string }>)[0]!.text;

describe('MCP server over HTTP', () => {
  it('binds to 127.0.0.1 and lists all tools with correct annotations', async () => {
    expect(srv.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(Object.values(TOOL).sort());
    expect(byName[TOOL.readFile]!.annotations?.readOnlyHint).toBe(true);
    expect(byName[TOOL.proposeEdit]!.annotations?.readOnlyHint).toBe(false);
    expect(byName[TOOL.runCommand]!.annotations?.destructiveHint).toBe(true);
  });

  it('read_file returns numbered lines and refuses traversal and secrets', async () => {
    expect(textOf(await client.callTool({ name: TOOL.readFile, arguments: { path: 'pkg/flags.py' } }))).toContain('    1| def get_flag():');
    const esc = await client.callTool({ name: TOOL.readFile, arguments: { path: '../../etc/passwd' } });
    expect(esc.isError).toBe(true);
    expect(textOf(esc)).toMatch(/outside the workspace/);
    const env = await client.callTool({ name: TOOL.readFile, arguments: { path: '.env' } });
    expect(env.isError).toBe(true);
    expect(textOf(env)).not.toContain('supersecret');
  });

  it('search_workspace never returns secret files', async () => {
    const r = textOf(await client.callTool({ name: TOOL.search, arguments: { query: 'secret' } }));
    expect(r).not.toContain('supersecret');
    expect(textOf(await client.callTool({ name: TOOL.search, arguments: { query: 'get_flag' } }))).toContain('pkg/flags.py:1');
  });

  it('assemble_context returns a bundle and emits a Context Receipt', async () => {
    const r = textOf(await client.callTool({ name: TOOL.assemble, arguments: { task: 'change get_flag to return False' } }));
    expect(r).toContain('pkg/flags.py');
    expect(receipts.at(-1)!.selected.map((s) => s.path)).toContain('pkg/flags.py');
  });

  it('find_symbol and related_files work', async () => {
    expect(textOf(await client.callTool({ name: TOOL.findSymbol, arguments: { name: 'get_flag' } }))).toContain('def  pkg/flags.py:1');
    expect(textOf(await client.callTool({ name: TOOL.related, arguments: { path: 'pkg/flags.py' } }))).toContain('tests/test_flags.py');
  });

  it('propose_edit WITHOUT approval refuses and writes nothing', async () => {
    const args = { path: 'pkg/flags.py', rationale: 'x', edits: [{ old_text: 'return True', new_text: 'return False' }] };
    const r = await client.callTool({ name: TOOL.proposeEdit, arguments: args });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/not approved/);
    expect(readFileSync(path.join(root, 'pkg/flags.py'), 'utf8')).toBe(SRC);
  });

  it('propose_edit WITH a grant applies only accepted hunks; grant is single-use', async () => {
    const args = {
      path: 'pkg/flags.py',
      rationale: 'flip flag and doc',
      edits: [{ old_text: '    """Return the flag."""\n    return True', new_text: '    """Return the flag (now false)."""\n    return False' }],
    };
    const staged = await stageProposeEdit(args, { toolCallId: 'call-1', sessionId: 's', turnId: 't' }, host, safeChange);
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;
    expect(readFileSync(path.join(root, 'pkg/flags.py'), 'utf8')).toBe(SRC); // staging writes nothing
    safeChange.decideAll(staged.proposal.id, 'accepted');
    safeChange.closeReview(staged.proposal.id);
    approvals.grant(TOOL.proposeEdit, args, 'call-1', { proposalId: staged.proposal.id });

    const r = await client.callTool({ name: TOOL.proposeEdit, arguments: args });
    expect(r.isError).toBeFalsy();
    expect(readFileSync(path.join(root, 'pkg/flags.py'), 'utf8')).toContain('return False');
    const again = await client.callTool({ name: TOOL.proposeEdit, arguments: args });
    expect(again.isError).toBe(true);
    await safeChange.revert(staged.proposal.id);
    expect(readFileSync(path.join(root, 'pkg/flags.py'), 'utf8')).toBe(SRC);
  });

  it('[Phase 3, approval simulated] two edits to one file + one to another: merged, one change set, the first call writes all, the rest report it', async () => {
    writeFileSync(path.join(root, 'pkg', 'two.py'), 'a = 1\nb = 2\nc = 3\nd = 4\ne = 5\nf = 6\n');
    const e1 = { path: 'pkg/two.py', rationale: 'a', edits: [{ old_text: 'a = 1', new_text: 'a = 10' }] };
    const e2 = { path: 'pkg/two.py', rationale: 'f', edits: [{ old_text: 'f = 6', new_text: 'f = 60' }] };
    const e3 = { path: 'tests/test_flags.py', rationale: 't', edits: [{ old_text: 'assert get_flag()', new_text: 'assert get_flag() is True' }] };
    const res = await stageProposeEdits([{ toolCallId: 'm1', rawArgs: e1 }, { toolCallId: 'm2', rawArgs: e2 }, { toolCallId: 'm3', rawArgs: e3 }], { sessionId: 's', turnId: 't' }, host, safeChange);
    expect(res.every((r) => r.ok)).toBe(true);
    const ids = [...new Set(res.map((r) => (r.ok ? r.proposal.id : '')))];
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      safeChange.decideAll(id, 'accepted');
      safeChange.closeReview(id);
    }
    safeChange.createChangeSet(ids);
    for (const [i, r] of res.entries()) if (r.ok) approvals.grant(TOOL.proposeEdit, [e1, e2, e3][i], r.toolCallId, { proposalId: r.proposal.id });

    const r3 = await client.callTool({ name: TOOL.proposeEdit, arguments: e3 }); // TrueForge may run them in any order
    expect(r3.isError).toBeFalsy();
    expect(readFileSync(path.join(root, 'pkg', 'two.py'), 'utf8')).toBe('a = 10\nb = 2\nc = 3\nd = 4\ne = 5\nf = 60\n');
    const r1 = await client.callTool({ name: TOOL.proposeEdit, arguments: e1 });
    const r2 = await client.callTool({ name: TOOL.proposeEdit, arguments: e2 });
    expect(r1.isError).toBeFalsy();
    expect(textOf(r2)).toMatch(/merged with your other edit/);
    expect(readFileSync(path.join(root, 'tests', 'test_flags.py'), 'utf8')).toContain('is True');
    // single-use grants: a replay is refused
    expect((await client.callTool({ name: TOOL.proposeEdit, arguments: e1 })).isError).toBe(true);
    for (const id of ids) await safeChange.revert(id);
  });

  it('run_command requires a grant and reports exit codes', async () => {
    const args = { command: `python3 -c "print('ok')"` };
    expect((await client.callTool({ name: TOOL.runCommand, arguments: args })).isError).toBe(true);
    approvals.grant(TOOL.runCommand, args, 'call-2', null);
    const r = await client.callTool({ name: TOOL.runCommand, arguments: args });
    expect(textOf(r)).toContain('exit code: 0 (PASSED');
    expect(textOf(r)).toContain('ok');
  });

  it('run_command is killed when the run is cancelled', async () => {
    const ac = new AbortController();
    const srv2 = await startMcpHttpServer({ host, engine: new ContextEngine(root), approvals, safeChange, runSignal: () => ac.signal });
    const c2 = new Client({ name: 'axiom-test-2', version: '0' });
    await c2.connect(new StreamableHTTPClientTransport(new URL(srv2.url)));
    const args = { command: `python3 -c "import time; time.sleep(20)"` };
    approvals.grant(TOOL.runCommand, args, 'call-sleep', null);
    const t0 = Date.now();
    setTimeout(() => ac.abort(), 300);
    const r = await c2.callTool({ name: TOOL.runCommand, arguments: args });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.isError).toBe(true);
    await c2.close();
    await srv2.close();
  });

  it('run_command refuses disallowed programs even with a grant', async () => {
    const args = { command: 'rm -rf pkg' };
    approvals.grant(TOOL.runCommand, args, 'call-3', null);
    const r = await client.callTool({ name: TOOL.runCommand, arguments: args });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/not an allowed program/);
  });

  it('rejects browser origins and foreign Host headers (DNS rebinding)', async () => {
    const post = (headers: Record<string, string>) =>
      new Promise<number>((resolve) => {
        const req = http.request(
          { host: '127.0.0.1', port: srv.port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...headers } },
          (res) => resolve(res.statusCode ?? 0),
        );
        req.end('{}');
      });
    expect(await post({ origin: 'https://evil.example' })).toBe(403);
    expect(await post({ host: 'evil.example:80' })).toBe(403);
  });
});
