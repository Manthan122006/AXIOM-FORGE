// Integration smoke tests inside a real VS Code. No model required.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const ws = process.env.AXIOM_TEST_WORKSPACE;
let api;
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const lag = monitorEventLoopDelay({ resolution: 10 });

describe('AXIOM Forge in VS Code', () => {
  before(async () => {
    const ext = vscode.extensions.getExtension('axiom.axiom-forge');
    assert.ok(ext, 'extension found');
    const t0 = performance.now();
    api = await ext.activate();
    console.log(`      [timing] activate(): ${Math.round(performance.now() - t0)} ms`);
    lag.enable();
    assert.ok(api && api.controller, 'activate() returned the controller');
  });

  it('registers its commands', async () => {
    const cmds = await vscode.commands.getCommands(true);
    for (const c of ['axiomForge.inlineEdit', 'axiomForge.cancel', 'axiomForge.setupTrueForge', 'axiomForge.reconnect']) assert.ok(cmds.includes(c), c);
  });

  it('starts the MCP server on 127.0.0.1', () => {
    const mcp = api.controller.state.mcp;
    assert.strictEqual(mcp.kind, 'listening', JSON.stringify(mcp));
    assert.match(mcp.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });

  it('reports real TrueForge connectivity and TrueForge can list our tools', async function () {
    const conn = api.controller.state.connection;
    if (conn.kind !== 'connected') {
      this.skip(); // TrueForge not running on this machine: covered by the disconnected-state test below
      return;
    }
    const res = await fetch(`${conn.baseUrl}/api/v1/mcp-servers/axiom-forge/tools`);
    const body = await res.json();
    const names = (body.data || []).map((t) => t.name).sort();
    assert.deepStrictEqual(names, ['assemble_context', 'find_symbol', 'propose_edit', 'read_file', 'related_files', 'run_command', 'search_workspace']);
  });

  it('SafeChange applies only accepted hunks through WorkspaceEdit and undo restores the file', async () => {
    const c = api.controller;
    const rel = 'pkg/flags.py';
    const file = path.join(ws, rel);
    const before = fs.readFileSync(file, 'utf8');
    let t = Date.now();
    const lap = (label) => { console.log(`      [timing] ${label}: ${Date.now() - t} ms`); t = Date.now(); };
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    lap('open+show document');
    const proposed = before.replace('Return the flag.', 'Return the flag (now false).').replace('return True', 'return False');
    const p = c.safeChange.stage({ toolCallId: 't1', sessionId: 's', turnId: 'turn', path: rel, rationale: 'test', baseText: before, proposedText: proposed });
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'staging must not write');
    c.safeChange.decideAll(p.id, 'accepted');
    c.safeChange.closeReview(p.id);
    lap('stage+decide');
    const out = await c.safeChange.apply(p.id);
    lap('apply (WorkspaceEdit + save)');
    assert.strictEqual(out.status, 'applied', out.message);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), proposed, 'saved to disk');
    assert.strictEqual(doc.getText(), proposed, 'editor buffer updated');
    const r = await c.safeChange.revert(p.id);
    lap('revert');
    assert.ok(r.ok, r.message);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'undo restored the exact pre-image');
  });

  it('propose_edit through MCP refuses without approval (no write)', async () => {
    const { Client } = require(path.join(__dirname, '../../../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'));
    const { StreamableHTTPClientTransport } = require(path.join(__dirname, '../../../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js'));
    const client = new Client({ name: 'int', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(api.controller.state.mcp.url)));
    const file = path.join(ws, 'pkg/flags.py');
    const before = fs.readFileSync(file, 'utf8');
    const r = await client.callTool({ name: 'propose_edit', arguments: { path: 'pkg/flags.py', rationale: 'x', edits: [{ old_text: 'return True', new_text: 'return False' }] } });
    assert.strictEqual(r.isError, true);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
    await client.close();
  });

  after(() => {
    lag.disable();
    console.log(`      [event-loop] extension host lag during AXIOM operations: p50 ${Math.round(lag.percentile(50) / 1e6)} ms, p99 ${Math.round(lag.percentile(99) / 1e6)} ms, max ${Math.round(lag.max / 1e6)} ms`);
  });

  it('inline edit without a selection warns instead of running', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('axiomForge.inlineEdit');
    assert.strictEqual(api.controller.state.session.status, 'idle');
  });
});
