import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * The only way AXIOM Forge code touches workspace files.
 *
 * - In the extension, `VsCodeWorkspaceHost` implements this with open-buffer-aware reads and
 *   `WorkspaceEdit` writes (so applied changes join VS Code's undo stack).
 * - In tests and headless scripts, `NodeWorkspaceHost` uses the filesystem directly.
 *
 * All paths are workspace-relative POSIX paths that have already passed `resolveWorkspacePath`.
 */
export interface WorkspaceHost {
  /** Absolute, realpath-resolved workspace root. */
  readonly root: string;
  /** Current text of the file: the unsaved editor buffer if one is open, else disk. */
  readText(rel: string): Promise<string>;
  exists(rel: string): Promise<boolean>;
  /** Replace the whole file atomically (creating parent folders for new files). */
  writeText(rel: string, text: string): Promise<void>;
  /** Delete a file created by AXIOM Forge (used only by undo of a new-file proposal). */
  deleteFile(rel: string): Promise<void>;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export class NodeWorkspaceHost implements WorkspaceHost {
  constructor(readonly root: string) {}

  private abs(rel: string): string {
    return path.join(this.root, ...rel.split('/'));
  }

  async readText(rel: string): Promise<string> {
    return fs.readFile(this.abs(rel), 'utf8');
  }

  async exists(rel: string): Promise<boolean> {
    try {
      await fs.access(this.abs(rel));
      return true;
    } catch {
      return false;
    }
  }

  async writeText(rel: string, text: string): Promise<void> {
    const target = this.abs(rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // write-then-rename so a crash never leaves a half-written file
    const tmp = `${target}.axiom-tmp-${process.pid}`;
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, target);
  }

  async deleteFile(rel: string): Promise<void> {
    await fs.rm(this.abs(rel), { force: true });
  }
}
