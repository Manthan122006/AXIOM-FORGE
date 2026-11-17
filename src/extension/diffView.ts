import * as vscode from 'vscode';
import type { SafeChange } from '../safety/safeChange';

export const PROPOSED_SCHEME = 'axiom-proposed';
export const BASE_SCHEME = 'axiom-base';

/**
 * Native VS Code diff for staged proposals:
 *   left  = axiom-base:<path>?<proposalId>      (text the proposal was computed against)
 *   right = axiom-proposed:<path>?<proposalId>  (full proposed text)
 * plus per-hunk "Accept / Reject" CodeLenses on the right-hand side, so the review can happen
 * inside the editor diff itself. Nothing here writes to disk.
 */
export class DiffView implements vscode.TextDocumentContentProvider, vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;
  private readonly lensChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lensChanged.event;

  constructor(private readonly safeChange: SafeChange) {
    safeChange.onChange(() => this.lensChanged.fire());
  }

  static register(ctx: vscode.ExtensionContext, view: DiffView) {
    ctx.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(PROPOSED_SCHEME, view),
      vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, view),
      vscode.languages.registerCodeLensProvider({ scheme: PROPOSED_SCHEME }, view),
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    const id = uri.query;
    return (uri.scheme === PROPOSED_SCHEME ? this.safeChange.proposedText(id) : this.safeChange.baseText(id)) ?? '';
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const p = this.safeChange.get(doc.uri.query);
    if (!p) return [];
    const lenses: vscode.CodeLens[] = [];
    for (const h of p.hunks) {
      const firstChanged = h.lines.findIndex((l) => l[0] === '+' || l[0] === '-');
      const contextBefore = h.lines.slice(0, Math.max(0, firstChanged)).filter((l) => l[0] === ' ').length;
      const line = Math.max(0, Math.min(doc.lineCount - 1, h.newStart - 1 + contextBefore));
      const range = new vscode.Range(line, 0, line, 0);
      if (p.status !== 'staged') {
        const label = h.applyState === 'applied' ? '$(check) Applied' : h.applyState === 'reverted' ? 'Undone' : h.decision === 'rejected' ? 'Rejected' : p.status;
        lenses.push(new vscode.CodeLens(range, { title: `Hunk ${h.index + 1}: ${label}`, command: '' }));
        continue;
      }
      const mark = h.decision === 'accepted' ? '$(check) ' : h.decision === 'rejected' ? '$(close) ' : '';
      lenses.push(
        new vscode.CodeLens(range, { title: `${mark}Hunk ${h.index + 1}`, command: '' }),
        new vscode.CodeLens(range, { title: 'Accept', command: 'axiomForge.hunk', arguments: [p.id, h.id, 'accepted'] }),
        new vscode.CodeLens(range, { title: 'Reject', command: 'axiomForge.hunk', arguments: [p.id, h.id, 'rejected'] }),
      );
    }
    if (p.status === 'staged') {
      lenses.unshift(new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), { title: 'Apply decisions…', command: 'axiomForge.submitReview' }));
    }
    return lenses;
  }

  async open(proposalId: string, root: string): Promise<void> {
    const p = this.safeChange.get(proposalId);
    if (!p) return;
    const left = vscode.Uri.from({ scheme: BASE_SCHEME, path: `/${p.path}`, query: p.id });
    const right = vscode.Uri.from({ scheme: PROPOSED_SCHEME, path: `/${p.path}`, query: p.id });
    void root;
    await vscode.commands.executeCommand('vscode.diff', left, right, `${p.path}: AXIOM Forge proposal (review)`, { preview: true });
  }
}
