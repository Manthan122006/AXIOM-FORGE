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
  /** All tool calls this proposal answers (merged same-file edits). Defaults to [toolCallId]. */
  memberToolCallIds?: string[];
}

export interface ChangeSetResult {
  changeSetId: string;
  outcomes: ApplyOutcome[];
  /** Files written then restored because a later write failed. */
  rolledBack: string[];
  /** Files that could NOT be restored: the user must check them by hand. Empty in the normal case. */
  rollbackFailures: Array<{ path: string; error: string }>;
  /** true for the call that actually performed the apply; false for later calls that read the recorded result. */
  first: boolean;
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
  private sets = new Map<string, { proposalIds: string[]; result?: Omit<ChangeSetResult, 'first'>; running?: Promise<Omit<ChangeSetResult, 'first'>> }>();
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
      memberToolCallIds: input.memberToolCallIds ?? [input.toolCallId],
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
    return this.all().filter((p) => p.toolCallId === toolCallId || p.memberToolCallIds?.includes(toolCallId));
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

  /**
   * Group proposals approved in one review into a change set that is applied all-or-nothing.
   * Proposals the user fully rejected may be included; they are reported as rejected and not written.
   */
  createChangeSet(proposalIds: string[]): string {
    const id = randomUUID();
    for (const pid of proposalIds) this.require(pid).changeSetId = id;
    this.sets.set(id, { proposalIds: [...new Set(proposalIds)] });
    this.emit();
    return id;
  }

  /**
   * Apply a change set as a transaction with compensation:
   *  1. Validate EVERY decided proposal first (file unchanged since staging, new file still absent,
   *     accepted hunks apply cleanly). If any fails, nothing is written.
   *  2. Write files one by one, re-checking each file's hash immediately before writing it.
   *  3. If a write fails, restore every file already written (pre-image, or delete a created file)
   *     in reverse order, verify each restore by reading it back, and report any restore that failed.
   * This is NOT crash-atomic: a process crash between two writes leaves the files written so far
   * (the undo journal is only recorded on success). Concurrent callers (several approved tool calls
   * of the same set arriving at once) share one apply and all receive its recorded result.
   */
  async applyChangeSet(changeSetId: string): Promise<ChangeSetResult> {
    const set = this.sets.get(changeSetId);
    if (!set) throw new Error(`Unknown change set ${changeSetId}.`);
    if (set.result) return { ...set.result, first: false };
    if (set.running) return { ...(await set.running), first: false };
    set.running = this.runChangeSet(changeSetId, set.proposalIds);
    try {
      set.result = await set.running;
    } finally {
      set.running = undefined;
    }
    return { ...set.result, first: true };
  }

  changeSetOf(proposalId: string): string | undefined {
    return this.proposals.get(proposalId)?.changeSetId;
  }

  private async runChangeSet(changeSetId: string, ids: string[]): Promise<Omit<ChangeSetResult, 'first'>> {
    const props = ids.map((id) => this.require(id));
    const outcomes = new Map<string, ApplyOutcome>();
    const counts = (p: ProposedEdit) => {
      const a = p.hunks.filter((h) => h.decision === 'accepted').length;
      return { acceptedHunks: a, rejectedHunks: p.hunks.length - a };
    };
    const finish = (p: ProposedEdit, status: ApplyOutcome['status'], message: string) => {
      outcomes.set(p.id, { proposalId: p.id, path: p.path, status, ...counts(p), message });
      p.outcomeMessage = message;
    };
    for (const p of props) if (p.status !== 'decided') finish(p, 'rejected', `Proposal is ${p.status}; nothing written to ${p.path}.`);
    const todo = props.filter((p) => p.status === 'decided');
    const dupPath = todo.find((p, i) => todo.findIndex((q) => q.path === p.path) !== i);
    /** Abort before any write: the proposal that caused it already has its outcome; the rest are marked failed. */
    const abort = (why: string) => {
      for (const p of todo) {
        if (outcomes.has(p.id)) continue;
        p.status = 'failed';
        finish(p, 'failed', `Not written: ${why}`);
      }
      this.emit();
      return { changeSetId, outcomes: props.map((p) => outcomes.get(p.id)!), rolledBack: [], rollbackFailures: [] };
    };
    if (dupPath) return abort(`two proposals in this change set target ${dupPath.path}; nothing was written.`);

    // 1. Validate everything before touching the disk.
    const plan: Array<{ p: ProposedEdit; existed: boolean; pre: string; next: string }> = [];
    for (const p of todo) {
      const raw = this.raw.get(p.id)!;
      const existed = await this.host.exists(p.path);
      const pre = existed ? await this.host.readText(p.path) : '';
      if ((p.isNewFile && existed) || sha256(pre) !== p.baseHash) {
        p.status = 'conflict';
        finish(p, 'conflict', `${p.path} changed after the proposal was made; nothing in this change set was written.`);
        return abort(`${p.path} changed after the proposals were made, so the whole change set was cancelled (all-or-nothing).`);
      }
      try {
        const accepted = new Set(p.hunks.filter((h) => h.decision === 'accepted').map((h) => h.index));
        plan.push({ p, existed, pre, next: applyHunks(raw.base, raw.proposed, raw.hunks, accepted) });
      } catch (err) {
        p.status = err instanceof HunkConflictError ? 'conflict' : 'failed';
        finish(p, p.status === 'conflict' ? 'conflict' : 'failed', `${(err as Error).message}; nothing in this change set was written.`);
        return abort(`${p.path} could not be prepared, so the whole change set was cancelled (all-or-nothing).`);
      }
    }

    // 2. Write, re-checking each file right before writing it.
    const written: typeof plan = [];
    let failure: string | null = null;
    for (const step of plan) {
      try {
        const nowExists = await this.host.exists(step.p.path);
        const now = nowExists ? await this.host.readText(step.p.path) : '';
        if (nowExists !== step.existed || sha256(now) !== sha256(step.pre)) throw new Error(`${step.p.path} changed while the change set was being applied`);
        await this.host.writeText(step.p.path, step.next);
        written.push(step);
      } catch (err) {
        failure = `${step.p.path}: ${(err as Error).message}`;
        break;
      }
    }

    if (failure === null) {
      const at = new Date().toISOString();
      for (const { p, pre, next } of plan) {
        for (const h of p.hunks) if (h.decision === 'accepted') h.applyState = 'applied';
        p.status = 'applied';
        this.undo.push({ proposalId: p.id, path: p.path, preImage: p.isNewFile ? '' : pre, postHash: sha256(next), appliedAt: at });
        const c = counts(p);
        finish(p, 'applied', plan.length > 1 ? `Applied ${c.acceptedHunks} of ${p.hunks.length} hunk(s) to ${p.path} (one of ${plan.length} files applied together).` : `Applied ${c.acceptedHunks} of ${p.hunks.length} hunk(s) to ${p.path}.`);
      }
      this.emit();
      return { changeSetId, outcomes: props.map((p) => outcomes.get(p.id)!), rolledBack: [], rollbackFailures: [] };
    }

    // 3. Compensate: restore what was written, newest first, and verify each restore.
    const rolledBack: string[] = [];
    const rollbackFailures: Array<{ path: string; error: string }> = [];
    for (const step of [...written].reverse()) {
      try {
        if (step.existed) await this.host.writeText(step.p.path, step.pre);
        else await this.host.deleteFile(step.p.path);
        const ok = step.existed ? (await this.host.exists(step.p.path)) && sha256(await this.host.readText(step.p.path)) === sha256(step.pre) : !(await this.host.exists(step.p.path));
        if (!ok) throw new Error('read-back after restore did not match the original');
        rolledBack.push(step.p.path);
      } catch (err) {
        rollbackFailures.push({ path: step.p.path, error: (err as Error).message });
      }
    }
    const tail = rollbackFailures.length
      ? ` ROLLBACK FAILED for ${rollbackFailures.map((r) => r.path).join(', ')}: check these files by hand.`
      : rolledBack.length
        ? ` Restored ${rolledBack.join(', ')} to their previous content.`
        : '';
    for (const { p } of plan) {
      p.status = 'failed';
      for (const h of p.hunks) if (h.decision === 'accepted') h.applyState = 'failed';
      finish(p, 'failed', `Change set not applied: write failed (${failure}).${tail}`);
    }
    this.emit();
    return { changeSetId, outcomes: props.map((p) => outcomes.get(p.id)!), rolledBack, rollbackFailures };
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
