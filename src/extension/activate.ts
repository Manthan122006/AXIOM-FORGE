import { realpathSync } from 'node:fs';
import * as vscode from 'vscode';
import { AxiomController } from './controller';
import { DiffView } from './diffView';

let controller: AxiomController | null = null;

/** Returned API is used only by the integration tests (tests/integration). */
export async function activate(ctx: vscode.ExtensionContext): Promise<{ controller: AxiomController } | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const register = (id: string, fn: (...a: never[]) => unknown) => ctx.subscriptions.push(vscode.commands.registerCommand(id, fn));
  if (!folder || folder.uri.scheme !== 'file') {
    register('axiomForge.inlineEdit', () => vscode.window.showWarningMessage('Open a folder to use AXIOM Forge.'));
    return undefined;
  }
  const c = new AxiomController(ctx, realpathSync(folder.uri.fsPath));
  controller = c;
  ctx.subscriptions.push(c, vscode.window.registerWebviewViewProvider('axiomForge.agent', c, { webviewOptions: { retainContextWhenHidden: true } }));
  DiffView.register(ctx, c.diff);

  register('axiomForge.inlineEdit', () => c.inlineEdit());
  register('axiomForge.cancel', () => c.cancel('command'));
  register('axiomForge.reconnect', () => c.reconnect());
  register('axiomForge.setupTrueForge', () => c.setupTrueForge());
  register('axiomForge.submitReview', () => c.submitReview());
  register('axiomForge.dev.stageSample', () => c.devStageSample());
  register('axiomForge.hunk', (proposalId: string, hunkId: string, decision: 'accepted' | 'rejected') => c.decide(proposalId, hunkId, decision));

  // Keep retrieval in sync with edits the user makes outside AXIOM Forge.
  ctx.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (d.uri.scheme !== 'file' || !d.uri.fsPath.startsWith(c.root)) return;
      c.engine.noteFileChanged(vscode.workspace.asRelativePath(d.uri, false), d.getText());
    }),
  );
  // Test-only switch used to attribute editor responsiveness (tests/integration); never set in normal use.
  if (process.env.AXIOM_TEST_NO_START !== '1') await c.start();
  return { controller: c };
}

export function deactivate(): void {
  controller?.dispose();
  controller = null;
}
