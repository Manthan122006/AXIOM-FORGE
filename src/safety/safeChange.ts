import { randomUUID } from 'node:crypto';
import type { DiffHunk, HunkDecision, ProposedEdit, UndoEntry } from '../shared/contracts';
import { sha256, type WorkspaceHost } from '../workspace/host';
import { applyHunks, computeHunks, HunkConflictError, type RawHunk } from './hunks';

export interface StageInput {
  toolCallId: string;
  sessionId: string;
  turnId: string;
  path: string;
  rationale: string;
  baseText: string | null; // null = file does not exist yet
  proposedText: string;
}

export interface ApplyOutcome {
  proposalId: string;
  path: string;
  status: 'applied' | 'rejected' | 'conflict' | 'failed';
  acceptedHunks: number;
  rejectedHunks: number;
  message: string;
}

type Listener = () => void;

/**
 * SafeChange: stages proposals, tracks per-hunk decisions, applies only accepted hunks,
 * detects conflicts, and keeps an undo journal. Holds no vscode dependency: all I/O goes
 * through WorkspaceHost, so it is unit-testable and identical in the extension.
 */
export class SafeChange {
  private proposals = new Map<string, ProposedEdit>();
  private raw = new Map<string, { base: string; proposed: string; hunks: RawHunk[] }>();
  private undo: UndoEntry[] = [];
  private listeners = new Set<Listener>();

  constructor(private readonly host: WorkspaceHost) {}

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  stage(input: StageInput): ProposedEdit {
    const base = input.baseText ?? '';
    const hunksRaw = computeHunks(base, input.proposedText);
    const id = randomUUID();
    const hunks: DiffHunk[] = hunksRaw.map((h) => ({
      id: `${id}:${h.index}`,
      index: h.index,
      oldStart: h.oldStart,
      oldLines: h.oldLines,
      newStart: h.newStart,
      newLines: h.newLines,
      lines: h.lines,
      decision: 'pending',
      applyState: 'not_applied',
    }));
    const proposal: ProposedEdit = {
      id,
      toolCallId: input.toolCallId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      path: input.path,
      isNewFile: input.baseText === null,
      rationale: input.rationale,
      baseHash: sha256(base),
      hunks,
      status: 'staged',
      createdAt: new Date().toISOString(),
    };
    this.proposals.set(id, proposal);
    this.raw.set(id, { base, proposed: input.proposedText, hunks: hunksRaw });
    this.emit();
    return proposal;
  }

  get(id: string): ProposedEdit | undefined {
    return this.proposals.get(id);
  }
  all(): ProposedEdit[] {
    return [...this.proposals.values()];
  }
  byToolCall(toolCallId: string): ProposedEdit[] {
    return this.all().filter((p) => p.toolCallId === toolCallId);
  }
  undoStack(): UndoEntry[] {
    return [...this.undo];
  }
  /** Full proposed text, for the native diff editor's right-hand side. */
  proposedText(id: string): string | undefined {
    return this.raw.get(id)?.proposed;
  }
  baseText(id: string): string | undefined {
    return this.raw.get(id)?.base;
  }

  decide(proposalId: string, hunkId: string, decision: Exclude<HunkDecision, 'pending'>): void {
    const p = this.require(proposalId);
    if (p.status !== 'staged') throw new Error(`Proposal is ${p.status}; decisions are closed.`);
    const h = p.hunks.find((x) => x.id === hunkId);
    if (!h) throw new Error(`Unknown hunk ${hunkId}.`);
    h.decision = decision;
    this.emit();
  }

  decideAll(proposalId: string, decision: Exclude<HunkDecision, 'pending'>): void {
    const p = this.require(proposalId);
    if (p.status !== 'staged') return;
    for (const h of p.hunks) h.decision = decision;
    this.emit();
  }

  isFullyDecided(proposalId: string): boolean {
    return this.require(proposalId).hunks.every((h) => h.decision !== 'pending');
  }

  acceptedCount(proposalId: string): number {
    return this.require(proposalId).hunks.filter((h) => h.decision === 'accepted').length;
  }

  /** Close review: marks the proposal decided (≥1 accepted) or rejected (none accepted). */
  closeReview(proposalId: string): 'decided' | 'rejected' {
    const p = this.require(proposalId);
    if (!this.isFullyDecided(proposalId)) throw new Error('Every hunk needs a decision before submitting.');
    p.status = this.acceptedCount(proposalId) > 0 ? 'decided' : 'rejected';
    this.emit();
    return p.status;
  }

  /**
   * Write the accepted hunks. Only legal for a `decided` proposal. Re-reads the file and refuses
   * (status `conflict`) if it changed since staging. The write is a single whole-file replacement,
   * so the file is either fully updated or untouched.
   */
  async apply(proposalId: string): Promise<ApplyOutcome> {
    const p = this.require(proposalId);
    const raw = this.raw.get(proposalId)!;
    const accepted = new Set(p.hunks.filter((h) => h.decision === 'accepted').map((h) => h.index));
    const counts = { acceptedHunks: accepted.size, rejectedHunks: p.hunks.length - accepted.size };
    if (p.status !== 'decided') {
      return { proposalId, path: p.path, status: 'rejected', ...counts, message: `Proposal is ${p.status}; nothing written.` };
    }

    const exists = await this.host.exists(p.path);
    const current = exists ? await this.host.readText(p.path) : '';
    if ((p.isNewFile && exists) || sha256(current) !== p.baseHash) {
      p.status = 'conflict';
      this.emit();
      return { proposalId, path: p.path, status: 'conflict', ...counts, message: `${p.path} changed after the proposal was made; nothing written.` };
    }

    let next: string;
    try {
      next = applyHunks(raw.base, raw.proposed, raw.hunks, accepted);
    } catch (err) {
      p.status = err instanceof HunkConflictError ? 'conflict' : 'failed';
      this.emit();
      return { proposalId, path: p.path, status: p.status === 'conflict' ? 'conflict' : 'failed', ...counts, message: (err as Error).message };
    }

    try {
      await this.host.writeText(p.path, next);
    } catch (err) {
      p.status = 'failed';
      for (const h of p.hunks) if (h.decision === 'accepted') h.applyState = 'failed';
      this.emit();
      return { proposalId, path: p.path, status: 'failed', ...counts, message: `Write failed: ${(err as Error).message}` };
    }

    for (const h of p.hunks) if (h.decision === 'accepted') h.applyState = 'applied';
    p.status = 'applied';
    this.undo.push({ proposalId, path: p.path, preImage: p.isNewFile ? '' : current, postHash: sha256(next), appliedAt: new Date().toISOString() });
    this.emit();
    return { proposalId, path: p.path, status: 'applied', ...counts, message: `Applied ${accepted.size} of ${p.hunks.length} hunk(s) to ${p.path}.` };
  }

  /** Revert an applied proposal. Refuses if the file was edited after the apply. */
  async revert(proposalId: string): Promise<{ ok: boolean; message: string }> {
    const p = this.require(proposalId);
    const idx = this.undo.findIndex((u) => u.proposalId === proposalId);
    if (p.status !== 'applied' || idx === -1) return { ok: false, message: 'Nothing to undo for this proposal.' };
    const entry = this.undo[idx]!;
    const exists = await this.host.exists(entry.path);
    const current = exists ? await this.host.readText(entry.path) : '';
    if (sha256(current) !== entry.postHash) {
      return { ok: false, message: `${entry.path} was edited after AXIOM Forge applied it; undo would overwrite those edits.` };
    }
    if (p.isNewFile) await this.host.deleteFile(entry.path);
    else await this.host.writeText(entry.path, entry.preImage);
    this.undo.splice(idx, 1);
    p.status = 'undone';
    for (const h of p.hunks) if (h.applyState === 'applied') h.applyState = 'reverted';
    this.emit();
    return { ok: true, message: `Reverted ${entry.path}.` };
  }

  /** Cancellation / model failure: drop every proposal of the turn that has not been written. */
  discardPending(turnId?: string): number {
    let n = 0;
    for (const p of this.proposals.values()) {
      if ((turnId === undefined || p.turnId === turnId) && (p.status === 'staged' || p.status === 'decided')) {
        p.status = 'discarded';
        n++;
      }
    }
    if (n) this.emit();
    return n;
  }

  private require(id: string): ProposedEdit {
    const p = this.proposals.get(id);
    if (!p) throw new Error(`Unknown proposal ${id}.`);
    return p;
  }
}
