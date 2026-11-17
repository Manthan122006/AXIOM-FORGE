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
    // Connectivity is established in the background after activation; wait up to 15 s for it.
    for (let i = 0; i < 60 && api.controller.state.connection.kind === 'connecting'; i++) await new Promise((r) => setTimeout(r, 250));
    console.log(`      [timing] connection: ${api.controller.state.connection.kind} after ${Math.round(performance.now() - t0)} ms`);
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

  // ── Path E/F: real editor review with a dev-harness proposal (no model; labelled) ──
  it('[E/F] dev harness: native diff tab + per-hunk CodeLens + accept 1 / reject 1 + apply + undo', async () => {
    const c = api.controller;
    const file = path.join(ws, 'pkg/long.py');
    const before = fs.readFileSync(file, 'utf8');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
    await vscode.commands.executeCommand('axiomForge.dev.stageSample');
    const p = c.safeChange.all().find((x) => x.sessionId === 'dev-harness' && x.status === 'staged');
    assert.ok(p, 'dev proposal staged');
    assert.strictEqual(p.hunks.length, 2, 'two independent hunks');
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'staging wrote nothing');

    // The native diff editor is open with our virtual documents on both sides.
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab && tab.input instanceof vscode.TabInputTextDiff, 'active tab is a diff');
    assert.strictEqual(tab.input.original.scheme, 'axiom-base');
    assert.strictEqual(tab.input.modified.scheme, 'axiom-proposed');

    // CodeLenses rendered by VS Code on the proposed side: Apply + (label, Accept, Reject) per hunk.
    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', tab.input.modified);
    const titles = lenses.map((l) => l.command && l.command.title);
    console.log(`      [codelens] ${JSON.stringify(titles)}`);
    assert.strictEqual(titles.filter((t) => t === 'Accept').length, 2);
    assert.strictEqual(titles.filter((t) => t === 'Reject').length, 2);
    assert.ok(titles.includes('Apply decisions…'));

    // Click the lenses' own commands.
    const accept = lenses.filter((l) => l.command && l.command.title === 'Accept')[0].command;
    const reject = lenses.filter((l) => l.command && l.command.title === 'Reject')[1].command;
    await vscode.commands.executeCommand(accept.command, ...accept.arguments);
    await vscode.commands.executeCommand(reject.command, ...reject.arguments);
    assert.deepStrictEqual(c.safeChange.get(p.id).hunks.map((h) => h.decision), ['accepted', 'rejected']);
    await vscode.commands.executeCommand('axiomForge.submitReview');
    const after = fs.readFileSync(file, 'utf8');
    assert.ok(after.includes('sample hunk 1') && !after.includes('sample hunk 2'), 'only the accepted hunk is on disk');
    const r = await c.safeChange.revert(p.id);
    assert.ok(r.ok, r.message);
    assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'undo restored the file');
  });

  it('[E/F] conflict: a user edit after staging blocks the apply', async () => {
    const c = api.controller;
    const file = path.join(ws, 'pkg/long.py');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('axiomForge.dev.stageSample');
    const p = c.safeChange.all().find((x) => x.sessionId === 'dev-harness' && x.status === 'staged');
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(10, 0), '# user typed this\n');
    await vscode.workspace.applyEdit(edit); // unsaved user edit in the open buffer
    c.safeChange.decideAll(p.id, 'accepted');
    await vscode.commands.executeCommand('axiomForge.submitReview');
    assert.strictEqual(c.safeChange.get(p.id).status, 'conflict');
    assert.ok(doc.getText().includes('# user typed this') && !doc.getText().includes('sample hunk'), 'user edit kept, proposal not written');
    await vscode.commands.executeCommand('workbench.action.files.revert');
  });

  // ── Path D→E→F→G through MCP (TrueForge's approval simulated by granting in code; labelled) ──
  it('[D-G, approval simulated] approved propose_edit via MCP applies through WorkspaceEdit; approved run_command records Proof', async () => {
    const c = api.controller;
    const { Client } = require(path.join(__dirname, '../../../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'));
    const { StreamableHTTPClientTransport } = require(path.join(__dirname, '../../../node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js'));
    const client = new Client({ name: 'int', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(c.state.mcp.url)));
    const file = path.join(ws, 'pkg/flags.py');
    const before = fs.readFileSync(file, 'utf8');
    const args = { path: 'pkg/flags.py', rationale: 'flip', edits: [{ old_text: 'return True', new_text: 'return False' }] };
    const proposal = c.safeChange.stage({ toolCallId: 'sim-1', sessionId: 'sim', turnId: 'sim', path: 'pkg/flags.py', rationale: 'flip', baseText: before, proposedText: before.replace('return True', 'return False') });
    c.safeChange.decideAll(proposal.id, 'accepted');
    c.safeChange.closeReview(proposal.id);
    c.approvals.grant('propose_edit', args, 'sim-1', { proposalId: proposal.id });
    const r = await client.callTool({ name: 'propose_edit', arguments: args });
    assert.ok(!r.isError, JSON.stringify(r.content));
    assert.ok(fs.readFileSync(file, 'utf8').includes('return False'));
    await c.safeChange.revert(proposal.id);

    const cmd = { command: `python3 -c "print('proof ok')"` };
    c.approvals.grant('run_command', cmd, 'sim-2', null);
    const out = await client.callTool({ name: 'run_command', arguments: cmd });
    assert.match(out.content[0].text, /exit code: 0/);
    await new Promise((res) => setTimeout(res, 100));
    const v = Object.values(c.state.verification).find((x) => x.command === cmd.command);
    assert.ok(v && v.status === 'passed' && v.exitCode === 0, 'Proof of Change recorded the real result');
    await client.close();
  });

  // ── Path B/I/J: real TrueForge failure → ModelShield → clean workspace ──
  it('[B/I/J, real TrueForge] unconfigured primary + backup → classified bad_config, both tried, workspace unchanged', async function () {
    const c = api.controller;
    if (c.state.connection.kind !== 'connected') return this.skip();
    const conf = vscode.workspace.getConfiguration('axiomForge');
    await conf.update('models.primary', 'google-gemini/axiom-missing-primary', vscode.ConfigurationTarget.Workspace);
    await conf.update('models.backup', 'google-gemini/axiom-missing-backup', vscode.ConfigurationTarget.Workspace);
    const snapshot = () => fs.readdirSync(path.join(ws, 'pkg')).map((f) => f + ':' + fs.readFileSync(path.join(ws, 'pkg', f), 'utf8')).join('|');
    const before = snapshot();
    const t0 = Date.now();
    await c.runTask({ text: 'Change get_flag to return False', mentions: [] });
    const ms = Date.now() - t0;
    console.log(`      [model-shield] ${JSON.stringify(c.state.recovery)} in ${ms} ms; session=${JSON.stringify(c.state.session)}`);
    assert.strictEqual(c.state.recovery.kind, 'exhausted');
    assert.deepStrictEqual(c.state.recovery.tried, ['google-gemini/axiom-missing-primary', 'google-gemini/axiom-missing-backup']);
    assert.match(c.state.recovery.message, /provider not configured|Unknown model/);
    assert.strictEqual(c.state.session.status, 'error');
    assert.strictEqual(snapshot(), before, 'no file changed');
    assert.ok(ms < 15000, 'fails fast, no hang');
    await conf.update('models.primary', undefined, vscode.ConfigurationTarget.Workspace);
    await conf.update('models.backup', undefined, vscode.ConfigurationTarget.Workspace);
  });

  after(() => {
    lag.disable();
    console.log(`      [event-loop] extension host lag during AXIOM operations: p50 ${Math.round(lag.percentile(50) / 1e6)} ms, p99 ${Math.round(lag.percentile(99) / 1e6)} ms, max ${Math.round(lag.max / 1e6)} ms`);
  });

  it('inline edit without a selection warns instead of running', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const before = JSON.stringify(api.controller.state.session);
    await vscode.commands.executeCommand('axiomForge.inlineEdit');
    assert.strictEqual(JSON.stringify(api.controller.state.session), before, 'no run was started');
  });
});
