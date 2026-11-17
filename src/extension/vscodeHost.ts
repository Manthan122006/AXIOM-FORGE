import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import type { WorkspaceHost } from '../workspace/host';

/**
 * WorkspaceHost backed by VS Code:
 * - reads the live editor buffer when a file is open (so proposals diff against what the user sees),
 * - writes through WorkspaceEdit (one atomic edit per file, joins VS Code's undo stack) and saves,
 *   so tests run by the agent see the change on disk.
 */
export class VsCodeWorkspaceHost implements WorkspaceHost {
  constructor(readonly root: string) {}

  private uri(rel: string): vscode.Uri {
    return vscode.Uri.file(path.join(this.root, ...rel.split('/')));
  }

  private openDoc(rel: string): vscode.TextDocument | undefined {
    const target = this.uri(rel).fsPath;
    return vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === target);
  }

  async readText(rel: string): Promise<string> {
    const doc = this.openDoc(rel);
    if (doc) return doc.getText();
    return fs.readFile(this.uri(rel).fsPath, 'utf8');
  }

  async exists(rel: string): Promise<boolean> {
    if (this.openDoc(rel)) return true;
    try {
      await fs.access(this.uri(rel).fsPath);
      return true;
    } catch {
      return false;
    }
  }

  async writeText(rel: string, text: string): Promise<void> {
    const uri = this.uri(rel);
    const edit = new vscode.WorkspaceEdit();
    if (!(await this.exists(rel))) {
      edit.createFile(uri, { ignoreIfExists: false, contents: Buffer.from(text, 'utf8') });
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error(`VS Code refused to create ${rel}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    edit.replace(uri, full, text);
    if (!(await vscode.workspace.applyEdit(edit))) throw new Error(`VS Code refused the edit to ${rel}`);
    await doc.save();
  }

  async deleteFile(rel: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.deleteFile(this.uri(rel), { ignoreIfNotExists: true });
    await vscode.workspace.applyEdit(edit);
  }
}
