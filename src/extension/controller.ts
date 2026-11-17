import path from 'node:path';
import * as vscode from 'vscode';
import { ContextEngine } from '../context/engine';
import { GATED_TOOLS, MCP_SERVER_NAME, normalizeGatedArgs, startMcpHttpServer, TOOL, type RunningMcpServer } from '../mcp/server';
import { resolveWorkspacePath } from '../mcp/pathJail';
import { ApprovalRegistry } from '../safety/approvals';
import { SafeChange } from '../safety/safeChange';
import { stageProposeEdit } from '../safety/stage';
import type { AgentEvent, AxiomState, HostToWebview, ProposedEdit, VerificationResult, WebviewToHost } from '../shared/contracts';
import { scrubSecrets } from '../shared/secrets';
import { describeFailure } from '../trueforge/classify';
import { TrueForgeConnection } from '../trueforge/client';
import { runWithShield, type AttemptOutcome } from '../trueforge/modelShield';
import { TurnTracker } from '../trueforge/reducer';
import { loadAgentDefinition, registerMcp, setupTrueForge } from '../trueforge/setup';
import { runCommand, type CommandResult } from '../verification/commandRunner';
import { DiffView } from './diffView';
import { VsCodeWorkspaceHost } from './vscodeHost';

export interface TaskRequest {
  text: string;
  mentions: Array<{ kind: 'file' | 'symbol'; value: string }>;
  inline?: { rel: string; startLine: number; endLine: number; selectedText: string };
}

class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

interface ActiveRun {
  abort: AbortController;
  inline: boolean;
  sessionId?: string;
  turnId?: string;
  review?: { resolve: () => void; reject: (e: Error) => void };
}

const cfg = () => vscode.workspace.getConfiguration('axiomForge');
export const DEV_SESSION = 'dev-harness';

/**
 * Orchestrates one VS Code window: MCP server, TrueForge runs (through ModelShield), SafeChange
 * review, verification evidence, and the webview state. The webview is a pure view of `state`.
 */
export class AxiomController implements vscode.WebviewViewProvider, vscode.Disposable {
  readonly host: VsCodeWorkspaceHost;
  readonly engine: ContextEngine;
  readonly safeChange: SafeChange;
  readonly approvals = new ApprovalRegistry();
  readonly diff: DiffView;
  private tf: TrueForgeConnection;
  private mcp: RunningMcpServer | null = null;
  private view: vscode.WebviewView | null = null;
  private run: ActiveRun | null = null;
  private timeline: AgentEvent[] = [];
  private timelineIdx = new Map<string, number>();
  private postTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private agentModel: string | null = null;
  /** Number of AXIOM MCP tool executions currently running (used by the stream watchdog). */
  private mcpBusy = 0;
  /** Label of the operation in progress, reported by the stall detector. */
  private lastOp = 'idle';
  private stallTimer: NodeJS.Timeout | null = null;
  readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  private readonly output = vscode.window.createOutputChannel('AXIOM Forge');

  state: AxiomState = {
    connection: { kind: 'connecting' },
    mcp: { kind: 'stopped' },
    session: { sessionId: null, turnId: null, model: null, modelSlot: null, status: 'idle' },
    timeline: [],
    receipts: {},
    proposals: {},
    approval: { kind: 'none' },
    undoStack: [],
    verification: {},
    recovery: { kind: 'healthy', model: '' },
  };

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    readonly root: string,
  ) {
    this.host = new VsCodeWorkspaceHost(root);
    this.engine = new ContextEngine(root);
    this.safeChange = new SafeChange(this.host);
    this.diff = new DiffView(this.safeChange);
    this.tf = new TrueForgeConnection(cfg().get<string>('trueforgeUrl', 'http://localhost:8790'));
    this.safeChange.onChange(() => this.syncProposals());
    this.status.command = 'axiomForge.agent.focus';
    this.status.show();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  /** Logs extension-host event-loop stalls (> 250 ms) with the operation in progress. Evidence for A3. */
  private startStallDetector(): void {
    let expected = Date.now() + 500;
    this.stallTimer = setInterval(() => {
      const drift = Date.now() - expected;
      if (drift > 250) this.log(`event loop stalled ~${drift} ms (during: ${this.lastOp})`);
      expected = Date.now() + 500;
    }, 500);
    this.stallTimer.unref();
  }

  async start(): Promise<void> {
    this.startStallDetector();
    this.lastOp = 'activation';
    void this.engine.ready().then(() => this.engine.stats().then((s) => this.log(`indexed ${s.files} files, ${s.lines} lines, ${s.symbols} symbols`)));
    const port = cfg().get<number>('mcpPort', 7811);
    try {
      this.mcp = await startMcpHttpServer(
        {
          host: this.host,
          engine: this.engine,
          approvals: this.approvals,
          safeChange: this.safeChange,
          budgetTokens: () => cfg().get<number>('contextBudgetTokens', 24_000),
          runSignal: () => this.run?.abort.signal,
          onReceipt: (r) => {
            this.state.receipts = { ...this.state.receipts, [r.id]: r };
            this.pushEvent({ kind: 'context_receipt', id: `receipt:${r.id}`, receiptId: r.id, at: r.createdAt });
          },
          onApplied: (o) => {
            this.log(`apply ${o.path}: ${o.status} (${o.message})`);
            this.markVerificationStale();
            if (o.status === 'applied' && this.run?.inline) void this.showAppliedFile(o.path);
          },
          onCommandStart: (command) => {
            this.mcpBusy++;
            this.verificationStarted(command);
          },
          onCommandResult: (r) => {
            this.mcpBusy = Math.max(0, this.mcpBusy - 1);
            this.verificationFinished(r);
          },
        },
        port,
      );
      this.state.mcp = { kind: 'listening', url: this.mcp.url };
      this.log(`MCP server listening on ${this.mcp.url}`);
    } catch (e) {
      this.state.mcp = { kind: 'error', message: `Could not listen on 127.0.0.1:${port}: ${(e as Error).message}` };
    }
    // Connectivity is checked in the background so activation never waits on the network.
    void this.checkHealth(true);
    this.healthTimer = setInterval(() => void this.checkHealth(false), 5000);
    this.lastOp = 'idle';
  }

  dispose(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.cancel('window closing');
    void this.mcp?.close();
    this.status.dispose();
    this.output.dispose();
  }

  reconnect(): void {
    this.tf = new TrueForgeConnection(cfg().get<string>('trueforgeUrl', 'http://localhost:8790'));
    void this.checkHealth(true);
  }

  private async checkHealth(register: boolean): Promise<void> {
    const h = await this.tf.health();
    const wasConnected = this.state.connection.kind === 'connected';
    this.state.connection = h.ok ? { kind: 'connected', baseUrl: this.tf.baseUrl } : { kind: 'disconnected', reason: h.reason };
    if (h.ok && this.mcp && (register || !wasConnected)) {
      try {
        await registerMcp({ base: this.tf.baseUrl, mcpUrl: this.mcp.url });
        this.agentModel = await this.lookupAgentModel();
      } catch (e) {
        this.log(`MCP registration failed: ${(e as Error).message}`);
      }
    }
    this.updateStatusBar();
    this.schedulePost();
  }

  private async lookupAgentModel(): Promise<string | null> {
    try {
      const list = await this.tf.sdk.agents.list();
      const a = list.data.find((x) => x.name === cfg().get<string>('agentName', 'axiom-forge'));
      return a?.manifest.model.name ?? null;
    } catch {
      return null;
    }
  }

  /** "Register MCP Server and Agent in TrueForge": saves agents/axiom-agent.json with the chosen model. */
  async setupTrueForge(): Promise<void> {
    if (!this.mcp) return void vscode.window.showErrorMessage('The AXIOM Forge MCP server is not running; see the AXIOM Forge output.');
    const h = await this.tf.health();
    if (!h.ok) return void vscode.window.showErrorMessage(h.reason);
    let model = cfg().get<string>('models.primary', '') || undefined;
    if (!model) {
      if (!h.models.length) {
        return void vscode.window.showWarningMessage('TrueForge has no models yet. Add a provider in TrueForge Settings → Models, then run this again.', 'Open TrueForge').then((c) => c && vscode.env.openExternal(vscode.Uri.parse(this.tf.baseUrl)));
      }
      model = await vscode.window.showQuickPick(h.models, { title: 'Primary model for the AXIOM Forge agent' });
      if (!model) return;
    }
    try {
      const r = await setupTrueForge({ base: this.tf.baseUrl, mcpUrl: this.mcp.url, model, agentFile: this.ctx.asAbsolutePath(path.join('agents', 'axiom-agent.json')) });
      this.agentModel = model;
      vscode.window.showInformationMessage(`TrueForge agent "${r.agent}" saved with model ${model}.`);
    } catch (e) {
      vscode.window.showErrorMessage(scrubSecrets((e as Error).message));
    }
  }

  // ───────────────────────── webview ─────────────────────────

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const dist = vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview');
    view.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    const nonce = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    const js = view.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'main.js'));
    const css = view.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'index.css'));
    const csp = `default-src 'none'; style-src ${view.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${view.webview.cspSource}; img-src ${view.webview.cspSource} data:;`;
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${css}"><title>AXIOM Forge</title></head><body><div id="root"></div><script type="module" nonce="${nonce}" src="${js}"></script></body></html>`;
    view.webview.onDidReceiveMessage((m: WebviewToHost) => void this.onMessage(m));
    view.onDidDispose(() => (this.view = null));
  }

  private async onMessage(m: WebviewToHost): Promise<void> {
    switch (m.type) {
      case 'ready':
        return this.postNow();
      case 'send':
        return this.runTask({ text: m.text, mentions: m.mentions });
      case 'cancel':
        return this.cancel('user');
      case 'hunkDecision':
        return this.decide(m.proposalId, m.hunkId, m.decision);
      case 'acceptAll':
      case 'rejectAll':
        for (const id of m.proposalIds) this.safeChange.decideAll(id, m.type === 'acceptAll' ? 'accepted' : 'rejected');
        return;
      case 'submitReview':
        return void this.submitReview();
      case 'openDiff':
        return this.diff.open(m.proposalId, this.root);
      case 'undo':
        return this.undo(m.proposalId);
      case 'runVerification':
        return this.runUserVerification(m.command);
      case 'mentionQuery': {
        const items = await this.engine.mentionCandidates(m.query);
        void this.view?.webview.postMessage({ type: 'mentionResults', query: m.query, items } satisfies HostToWebview);
        return;
      }
      case 'openSessionInTrueForge':
        if (this.state.session.sessionId) void vscode.env.openExternal(vscode.Uri.parse(this.tf.sessionUrl(this.state.session.sessionId)));
        return;
    }
  }

  decide(proposalId: string, hunkId: string, decision: 'accepted' | 'rejected'): void {
    try {
      this.safeChange.decide(proposalId, hunkId, decision);
    } catch (e) {
      vscode.window.showWarningMessage((e as Error).message);
    }
  }

  // ───────────────────────── runs ─────────────────────────

  async inlineEdit(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return void vscode.window.showWarningMessage('Select the code you want AXIOM Forge to change, then press ⌘I / Ctrl+I.');
    let rel: string;
    try {
      rel = resolveWorkspacePath(this.root, editor.document.uri.fsPath, 'write').rel;
    } catch (e) {
      return void vscode.window.showWarningMessage(`AXIOM Forge can only edit files in this workspace: ${(e as Error).message}`);
    }
    if (editor.document.isDirty) await editor.document.save();
    const sel = editor.selection;
    const instruction = await vscode.window.showInputBox({ title: `AXIOM Forge: edit ${path.basename(rel)} L${sel.start.line + 1}–${sel.end.line + 1}`, prompt: 'Describe the change to the selected code', ignoreFocusOut: true });
    if (!instruction?.trim()) return;
    await vscode.commands.executeCommand('axiomForge.agent.focus');
    await this.runTask({ text: instruction.trim(), mentions: [], inline: { rel, startLine: sel.start.line + 1, endLine: sel.end.line + 1, selectedText: editor.document.getText(sel) } });
  }

  private buildPrompt(t: TaskRequest): string {
    if (t.inline) {
      const fence = t.inline.selectedText.includes('```') ? '~~~' : '```';
      return [
        `INLINE EDIT of \`${t.inline.rel}\`, lines ${t.inline.startLine}-${t.inline.endLine} (the user's selection).`,
        `Selected code:\n${fence}\n${t.inline.selectedText}\n${fence}`,
        `Instruction: ${t.text}`,
        'Change only the selected region (plus anything strictly required, such as its docstring). You may read surrounding lines with read_file. ' +
          `Then call propose_edit once for \`${t.inline.rel}\`, using old_text copied exactly from the file. Do not run commands. Finish with one sentence describing the change.`,
      ].join('\n\n');
    }
    const mentions = t.mentions.length ? `\n\nThe user mentioned: ${t.mentions.map((m) => `@${m.value} (${m.kind})`).join(', ')}. Pass these as \`mentions\` to assemble_context.` : '';
    return `${t.text}${mentions}`;
  }

  async runTask(t: TaskRequest): Promise<void> {
    if (this.run) return void vscode.window.showWarningMessage('AXIOM Forge is already running. Stop the current run first.');
    if (this.state.connection.kind !== 'connected') return void vscode.window.showErrorMessage(this.state.connection.kind === 'disconnected' ? this.state.connection.reason : 'Connecting to TrueForge…');
    if (!this.mcp) return void vscode.window.showErrorMessage('The AXIOM Forge MCP server is not running, so the agent has no editor tools.');

    const primary = cfg().get<string>('models.primary', '') || this.agentModel || (await this.lookupAgentModel());
    if (!primary) {
      return void vscode.window.showErrorMessage('No TrueForge agent is configured yet. Run "AXIOM Forge: Register MCP Server and Agent in TrueForge".', 'Register now').then((c) => c && this.setupTrueForge());
    }
    const backup = cfg().get<string>('models.backup', '') || undefined;
    const run: ActiveRun = { abort: new AbortController(), inline: Boolean(t.inline) };
    this.lastOp = t.inline ? 'inline edit run' : 'agent run';
    this.run = run;
    void vscode.commands.executeCommand('setContext', 'axiomForge.running', true);
    this.state.recovery = { kind: 'healthy', model: primary };
    this.pushEvent({ kind: 'user_message', id: `user:${Date.now()}`, text: t.inline ? `Edit ${t.inline.rel} L${t.inline.startLine}–${t.inline.endLine}: ${t.text}` : t.text, at: new Date().toISOString() });
    const prompt = this.buildPrompt(t);

    try {
      const result = await runWithShield(
        { primary, backup, maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 6000 },
        {
          attempt: (model, info) => this.attempt(run, model, model === primary ? 'primary' : 'backup', prompt, info.freshSession),
          onState: (s) => {
            this.state.recovery = s;
            this.log(`model shield: ${JSON.stringify(s)}`);
            this.schedulePost();
          },
          signal: run.abort.signal,
        },
      );
      if (result.kind === 'failed') {
        const msg = result.reason === 'side_effects'
          ? `${describeFailure(result.failure)} Some approved changes were already applied, so AXIOM Forge did not retry automatically. Review them in the Changes panel.`
          : `${describeFailure(result.failure)} ${result.tried.length > 1 ? `Tried ${result.tried.join(' and ')}.` : backup ? '' : 'No backup model is configured.'} Your files were not changed by this run.`;
        this.state.session = { ...this.state.session, status: 'error', error: scrubSecrets(result.message) };
        void vscode.window.showErrorMessage(`AXIOM Forge: ${msg}`);
      }
    } finally {
      this.safeChange.discardPending();
      this.approvals.revokeAll();
      this.state.approval = { kind: 'none' };
      this.run = null;
      this.lastOp = 'idle';
      void vscode.commands.executeCommand('setContext', 'axiomForge.running', false);
      if (this.state.session.status === 'running' || this.state.session.status === 'paused') this.state.session = { ...this.state.session, status: 'cancelled' };
      this.schedulePost();
    }
  }

  /** One attempt = one TrueForge session + turn on `model`, including approval pauses. */
  private async attempt(run: ActiveRun, model: string, slot: 'primary' | 'backup', prompt: string, _fresh: boolean): Promise<AttemptOutcome> {
    const tracker = new TurnTracker();
    let sideEffects = false;
    const idleMs = 120_000;
    try {
      const sessionId = await this.tf.createSession({
        agentName: cfg().get<string>('agentName', 'axiom-forge'),
        model,
        preferSaved: model === this.agentModel,
        inlineManifest: loadAgentDefinition(this.ctx.asAbsolutePath(path.join('agents', 'axiom-agent.json')), model).manifest,
      });
      run.sessionId = sessionId;
      this.state.session = { sessionId, turnId: null, model, modelSlot: slot, status: 'running' };
      this.log(`session ${sessionId} on ${model}: ${this.tf.sessionUrl(sessionId)}`);
      this.schedulePost();

      let events = await this.tf.streamTurn(sessionId, { text: prompt }, run.abort.signal);
      for (;;) {
        const ended = await this.consume(events, tracker, run, idleMs);
        if (ended !== 'paused') break;
        const decisions = await this.resolvePauses(tracker, run);
        if (decisions.some((d) => d.allow && d.gated)) sideEffects = true;
        await this.tf.sendApprovals(sessionId, tracker.turnId!, decisions);
        this.state.approval = { kind: 'none' };
        events = await this.tf.subscribe(sessionId, tracker.turnId!, tracker.lastEventId, run.abort.signal);
      }
      if (tracker.status === 'done') return { kind: 'done' };
      if (tracker.status === 'cancelled') return { kind: 'cancelled' };
      if (tracker.status === 'error') return sideEffects ? { kind: 'failed', error: tracker.error, sideEffects: true } : { kind: 'failed', error: tracker.error, sideEffects: false };
      const err = new Error('TrueForge stream ended without turn.done (timeout)');
      return sideEffects ? { kind: 'failed', error: err, sideEffects: true } : { kind: 'failed', error: err, sideEffects: false };
    } catch (thrown) {
      if (run.abort.signal.aborted || thrown instanceof Cancelled) return { kind: 'cancelled' };
      // A thrown error (not a turn.done error) may mean TrueForge itself is down; that is not a model failure.
      let e: unknown = thrown;
      const h = await this.tf.health();
      if (!h.ok) e = new Error(h.reason);
      this.log(`attempt on ${model} failed: ${scrubSecrets((e as Error).message ?? String(e))}`);
      return sideEffects ? { kind: 'failed', error: e, sideEffects: true } : { kind: 'failed', error: e, sideEffects: false };
    }
  }

  /** Read events until the turn pauses or ends. A watchdog aborts if TrueForge goes silent. */
  private async consume(events: AsyncIterable<Parameters<TurnTracker['apply']>[0]>, tracker: TurnTracker, run: ActiveRun, idleMs: number): Promise<'paused' | 'ended'> {
    const it = events[Symbol.asyncIterator]();
    for (;;) {
      // Watchdog: TrueForge is silent while a tool runs (e.g. a 2-minute pytest via run_command), so
      // silence only counts as a timeout when no tool call is in flight.
      let timer: NodeJS.Timeout | undefined;
      const idle = new Promise<never>((_, reject) => {
        const arm = () => {
          timer = setTimeout(() => {
            const toolInFlight = this.mcpBusy > 0 || [...tracker.toolCalls.values()].some((c) => c.phase === 'requested' || c.phase === 'running');
            if (toolInFlight) return arm();
            reject(Object.assign(new Error(`No events from TrueForge for ${idleMs / 1000}s (timeout)`), { code: 'ETIMEDOUT' }));
          }, idleMs);
        };
        arm();
      });
      let next: IteratorResult<Parameters<TurnTracker['apply']>[0]>;
      try {
        next = await Promise.race([it.next(), idle]);
      } finally {
        clearTimeout(timer);
      }
      if (next.done) return 'ended';
      const ev = next.value;
      if (tracker.apply(ev)) {
        run.turnId = tracker.turnId ?? undefined;
        this.syncTracker(tracker);
      }
      if (ev.type === 'turn.done') return 'ended';
      if (ev.type === 'turn.update' && tracker.status === 'paused') {
        void it.return?.();
        return 'paused';
      }
    }
  }

  private async resolvePauses(tracker: TurnTracker, run: ActiveRun): Promise<Array<{ toolCallId: string; threadId: string; allow: boolean; reason?: string; gated: boolean }>> {
    const decisions: Array<{ toolCallId: string; threadId: string; allow: boolean; reason?: string; gated: boolean }> = [];
    const staged: Array<{ id: string; args: Record<string, unknown>; proposal: ProposedEdit; threadId: string }> = [];
    for (const id of tracker.pendingApprovals()) {
      const call = tracker.lookup(id);
      if (!call) {
        decisions.push({ toolCallId: id, threadId: 'main', allow: false, reason: 'AXIOM Forge could not find this tool call.', gated: false });
        continue;
      }
      const ours = call.server === null || call.server === MCP_SERVER_NAME;
      if (ours && call.toolName === TOOL.proposeEdit) {
        const args = normalizeGatedArgs(TOOL.proposeEdit, call.args);
        const res = args ? await stageProposeEdit(args, { toolCallId: id, sessionId: run.sessionId!, turnId: tracker.turnId! }, this.host, this.safeChange) : ({ ok: false, error: 'Invalid propose_edit arguments.' } as const);
        if (!res.ok) decisions.push({ toolCallId: id, threadId: call.threadId, allow: false, reason: `Not staged: ${res.error}`, gated: true });
        else staged.push({ id, args: args!, proposal: res.proposal, threadId: call.threadId });
      } else if (ours && call.toolName === TOOL.runCommand) {
        const args = normalizeGatedArgs(TOOL.runCommand, call.args);
        const cmd = String(args?.command ?? '');
        const choice = await vscode.window.showWarningMessage(`AXIOM Forge wants to run a command`, { modal: true, detail: `${cmd}\n\nin ${args?.cwd ?? 'the workspace root'}. It runs without a shell and is limited to python, pytest, flask, read-only git and npm test.` }, 'Run command');
        if (run.abort.signal.aborted) throw new Cancelled();
        const allow = choice === 'Run command' && args !== null;
        if (allow) this.approvals.grant(TOOL.runCommand, args, id, null);
        decisions.push({ toolCallId: id, threadId: call.threadId, allow, reason: allow ? undefined : 'The user declined to run this command.', gated: true });
      } else {
        const choice = await vscode.window.showWarningMessage(`Allow tool "${call.toolName}"?`, { modal: true, detail: JSON.stringify(call.args, null, 2).slice(0, 800) }, 'Allow');
        if (run.abort.signal.aborted) throw new Cancelled();
        decisions.push({ toolCallId: id, threadId: call.threadId, allow: choice === 'Allow', reason: choice === 'Allow' ? undefined : 'Denied by the user.', gated: GATED_TOOLS.includes(call.toolName as never) });
      }
    }

    if (staged.length) {
      this.state.approval = { kind: 'pending', toolCallId: staged[0]!.id, proposalIds: staged.map((s) => s.proposal.id) };
      this.syncProposals();
      if (run.inline || staged.length === 1) void this.diff.open(staged[0]!.proposal.id, this.root);
      void vscode.window.showInformationMessage(`AXIOM Forge proposes changes to ${staged.map((s) => s.proposal.path).join(', ')}. Review each hunk, then apply.`, 'Open diff').then((c) => c && this.diff.open(staged[0]!.proposal.id, this.root));
      await new Promise<void>((resolve, reject) => (run.review = { resolve, reject }));
      run.review = undefined;
      for (const s of staged) {
        const outcome = this.safeChange.closeReview(s.proposal.id);
        if (outcome === 'decided') {
          this.approvals.grant(TOOL.proposeEdit, s.args, s.id, { proposalId: s.proposal.id });
          decisions.push({ toolCallId: s.id, threadId: s.threadId, allow: true, gated: true });
        } else {
          decisions.push({ toolCallId: s.id, threadId: s.threadId, allow: false, reason: `The user rejected every hunk of the change to ${s.proposal.path}. Do not apply it.`, gated: true });
        }
      }
    }
    return decisions;
  }

  async submitReview(): Promise<void> {
    const pending = this.safeChange.all().filter((p) => p.status === 'staged');
    const undecided = pending.flatMap((p) => p.hunks).filter((h) => h.decision === 'pending').length;
    if (undecided) return void vscode.window.showWarningMessage(`${undecided} hunk(s) still need Accept or Reject.`);
    if (this.run?.review) return this.run.review.resolve();
    // Dev review harness (no TrueForge run): apply SafeChange decisions directly. Only dev proposals exist outside a run.
    for (const p of pending.filter((x) => x.sessionId === DEV_SESSION)) {
      if (this.safeChange.closeReview(p.id) === 'decided') {
        const o = await this.safeChange.apply(p.id);
        this.log(`dev harness apply ${o.path}: ${o.status} (${o.message})`);
        this.markVerificationStale();
      }
    }
  }

  /**
   * DEV TOOL (axiomForge.devTools): stage a sample two-hunk proposal on the active file so the real
   * editor review (native diff, per-hunk CodeLens, sidebar, apply, undo, conflict) can be inspected
   * without a model. Never involves TrueForge; proposals are tagged with sessionId "dev-harness".
   */
  async devStageSample(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return void vscode.window.showWarningMessage('Open a file in this workspace first.');
    let rel: string;
    try {
      rel = resolveWorkspacePath(this.root, editor.document.uri.fsPath, 'write').rel;
    } catch (e) {
      return void vscode.window.showWarningMessage((e as Error).message);
    }
    const base = editor.document.getText();
    const lines = base.split('\n');
    if (lines.length < 12) return void vscode.window.showWarningMessage('Use a file with at least 12 lines so the sample has two separate hunks.');
    const marker = editor.document.languageId === 'python' ? '#' : '//';
    const next = [...lines];
    next.splice(1, 0, `${marker} AXIOM Forge dev harness: sample hunk 1`);
    next.splice(next.length - 2, 0, `${marker} AXIOM Forge dev harness: sample hunk 2`);
    const p = this.safeChange.stage({ toolCallId: `dev-${Date.now()}`, sessionId: DEV_SESSION, turnId: DEV_SESSION, path: rel, rationale: 'Dev harness sample (not model output).', baseText: base, proposedText: next.join('\n') });
    await this.diff.open(p.id, this.root);
    void vscode.commands.executeCommand('axiomForge.agent.focus');
  }

  cancel(reason: string): void {
    const run = this.run;
    if (!run) return;
    this.log(`cancel requested (${reason})`);
    run.abort.abort();
    run.review?.reject(new Cancelled());
    if (run.sessionId) void this.tf.cancel(run.sessionId).catch((e: Error) => this.log(`sessions.cancel failed: ${e.message}`));
    const discarded = this.safeChange.discardPending();
    this.approvals.revokeAll();
    if (discarded) this.log(`discarded ${discarded} unapplied proposal(s)`);
    this.pushEvent({ kind: 'turn_end', id: `cancel:${Date.now()}`, status: 'cancelled', at: new Date().toISOString() });
    this.state.session = { ...this.state.session, status: 'cancelled' };
    this.schedulePost();
  }

  private async undo(proposalId: string): Promise<void> {
    const r = await this.safeChange.revert(proposalId);
    if (r.ok) {
      const p = this.safeChange.get(proposalId);
      if (p) this.engine.noteFileChanged(p.path, (await this.host.exists(p.path)) ? await this.host.readText(p.path) : null);
      this.markVerificationStale();
      vscode.window.showInformationMessage(r.message);
    } else vscode.window.showWarningMessage(r.message);
  }

  private async showAppliedFile(rel: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(this.root, rel)));
    await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  }

  // ───────────────────────── verification ─────────────────────────

  private verificationStarted(command: string) {
    const id = `v:${Date.now()}`;
    this.state.verification = { ...this.state.verification, [id]: { id, command, cwd: '.', status: 'running', exitCode: null, durationMs: null, outputTail: '', filesAtRun: [], stale: false, startedAt: new Date().toISOString() } };
    this.schedulePost();
  }

  private verificationFinished(r: CommandResult) {
    const running = Object.values(this.state.verification).find((v) => v.status === 'running' && v.command === r.command);
    const id = running?.id ?? `v:${Date.now()}`;
    const result: VerificationResult = {
      id,
      command: r.command,
      cwd: path.relative(this.root, r.cwd) || '.',
      status: r.timedOut ? 'timed_out' : r.cancelled ? 'skipped' : r.exitCode === 0 ? 'passed' : r.exitCode === null ? 'error' : 'failed',
      exitCode: r.exitCode,
      durationMs: r.durationMs,
      outputTail: r.outputTail,
      filesAtRun: this.safeChange.all().filter((p) => p.status === 'applied').map((p) => p.path),
      stale: false,
      startedAt: running?.startedAt ?? new Date().toISOString(),
    };
    this.state.verification = { ...this.state.verification, [id]: result };
    this.pushEvent({ kind: 'verification', id: `verification:${id}`, resultId: id, at: new Date().toISOString() });
  }

  private async runUserVerification(command: string) {
    this.verificationStarted(command);
    try {
      this.verificationFinished(await runCommand(command, { workspaceRoot: this.root }));
    } catch (e) {
      vscode.window.showErrorMessage((e as Error).message);
    }
  }

  private markVerificationStale() {
    let changed = false;
    const v = { ...this.state.verification };
    for (const [k, r] of Object.entries(v)) {
      if (r.status !== 'running' && !r.stale) {
        v[k] = { ...r, stale: true };
        changed = true;
      }
    }
    if (changed) this.state.verification = v;
  }

  // ───────────────────────── state → webview ─────────────────────────

  private pushEvent(ev: AgentEvent) {
    const at = this.timelineIdx.get(ev.id);
    if (at === undefined) {
      this.timelineIdx.set(ev.id, this.timeline.length);
      this.timeline.push(ev);
    } else this.timeline[at] = ev;
    this.schedulePost();
  }

  private syncTracker(tracker: TurnTracker) {
    for (const ev of tracker.timeline) {
      // Tool-call state objects are mutated in place by the tracker; copy so the webview sees a new value.
      this.pushEvent(ev.kind === 'tool_call' ? { ...ev, call: { ...ev.call } } : { ...ev });
    }
    this.state.session = { ...this.state.session, turnId: tracker.turnId, status: tracker.status, ...(tracker.error ? { error: tracker.error } : {}), ...(tracker.lastEventId ? { lastEventId: tracker.lastEventId } : {}) };
  }

  private syncProposals() {
    this.state.proposals = Object.fromEntries(this.safeChange.all().map((p) => [p.id, { ...p, hunks: p.hunks.map((h) => ({ ...h })) }]));
    this.state.undoStack = this.safeChange.undoStack();
    this.schedulePost();
  }

  /** Batch streamed updates (~25 fps) so token streaming never floods the webview. */
  private schedulePost() {
    if (this.postTimer) return;
    this.postTimer = setTimeout(() => {
      this.postTimer = null;
      this.postNow();
    }, 40);
  }

  private postNow() {
    this.state.timeline = [...this.timeline];
    this.updateStatusBar();
    void this.view?.webview.postMessage({ type: 'state', state: this.state } satisfies HostToWebview);
  }

  private updateStatusBar() {
    const c = this.state.connection;
    const s = this.state.session.status;
    this.status.text = c.kind !== 'connected' ? '$(debug-disconnect) AXIOM' : s === 'running' ? '$(sync~spin) AXIOM' : s === 'paused' ? '$(eye) AXIOM review' : '$(check) AXIOM';
    this.status.tooltip = c.kind === 'connected' ? `TrueForge ${c.baseUrl}${this.state.session.model ? ` · ${this.state.session.model}` : ''}` : c.kind === 'disconnected' ? c.reason : 'Connecting to TrueForge…';
  }

  private log(msg: string) {
    this.output.appendLine(`[${new Date().toISOString()}] ${scrubSecrets(msg)}`);
  }
}
