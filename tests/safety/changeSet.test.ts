/**
 * Phase 3 SafeChange: same-file edit merging (stageProposeEdits / mergeFileVersions) and
 * all-or-nothing change sets with compensating rollback (SafeChange.applyChangeSet).
 * Real files in a temp workspace; write failures are injected through a wrapping host.
 */
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { lineOps, mergeFileVersions } from '../../src/safety/merge';
import { SafeChange } from '../../src/safety/safeChange';
import { stageProposeEdits } from '../../src/safety/stage';
import { NodeWorkspaceHost, type WorkspaceHost } from '../../src/workspace/host';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const meta = { sessionId: 's', turnId: 't' };

/** Host wrapper that can fail chosen writes/deletes, to exercise rollback. */
class FlakyHost implements WorkspaceHost {
  failWrite = new Set<string>();
  failRestore = new Set<string>();
  writes: string[] = [];
  constructor(private readonly inner: NodeWorkspaceHost) {}
  get root() {
    return this.inner.root;
  }
  readText(rel: string) {
    return this.inner.readText(rel);
  }
  exists(rel: string) {
    return this.inner.exists(rel);
  }
  async writeText(rel: string, text: string) {
    const isRestore = this.writes.includes(rel);
    if (!isRestore && this.failWrite.has(rel)) throw new Error('disk full (injected)');
    if (isRestore && this.failRestore.has(rel)) throw new Error('permission denied (injected)');
    this.writes.push(rel);
    return this.inner.writeText(rel, text);
  }
  async deleteFile(rel: string) {
    if (this.failRestore.has(rel)) throw new Error('permission denied (injected)');
    return this.inner.deleteFile(rel);
  }
}

describe('mergeFileVersions', () => {
  const base = lines(40);
  it('merges non-overlapping edits from separate calls into one text', () => {
    const a = base.replace('line 3\n', 'LINE 3\n');
    const b = base.replace('line 30\n', 'LINE 30\nline 30b\n');
    const m = mergeFileVersions(base, [{ id: 'a', text: a }, { id: 'b', text: b }]);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.merged).toEqual(['a', 'b']);
    expect(m.text).toBe(base.replace('line 3\n', 'LINE 3\n').replace('line 30\n', 'LINE 30\nline 30b\n'));
  });

  it('refuses overlapping edits and keeps the first, never a silent overwrite', () => {
    const a = base.replace('line 10\n', 'A10\n');
    const b = base.replace('line 10\n', 'B10\n');
    const m = mergeFileVersions(base, [{ id: 'a', text: a }, { id: 'b', text: b }]);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.merged).toEqual(['a']);
    expect(m.refused).toEqual([expect.objectContaining({ source: 'b', with: 'a', lines: [10, 10] })]);
    expect(m.text).toContain('A10\n');
    expect(m.text).not.toContain('B10');
  });

  it('treats adjacent-line edits and same-point insertions as conflicts (conservative)', () => {
    const adj = mergeFileVersions(base, [
      { id: 'a', text: base.replace('line 10\n', 'A\n') },
      { id: 'b', text: base.replace('line 11\n', 'B\n') },
    ]);
    expect(adj.ok && adj.refused.map((r) => r.source)).toEqual(['b']);
    const ins = mergeFileVersions(base, [
      { id: 'a', text: base.replace('line 5\n', 'line 5\nX\n') },
      { id: 'b', text: base.replace('line 5\n', 'line 5\nY\n') },
    ]);
    expect(ins.ok && ins.refused.map((r) => r.source)).toEqual(['b']);
  });

  it('applies an identical change proposed twice only once', () => {
    const a = base.replace('line 7\n', 'SEVEN\n');
    const m = mergeFileVersions(base, [{ id: 'a', text: a }, { id: 'b', text: a }]);
    expect(m.ok && m.merged).toEqual(['a', 'b']);
    expect(m.ok && m.text).toBe(a);
  });

  it('a source that does not change the file is refused', () => {
    const m = mergeFileVersions(base, [{ id: 'a', text: base }]);
    expect(m.ok).toBe(false);
  });

  it('preserves CRLF line endings and a missing final newline', () => {
    const b = 'a\r\nb\r\nc\r\nd\r\ne\r\nf';
    const m = mergeFileVersions(b, [
      { id: 'x', text: 'A\r\nb\r\nc\r\nd\r\ne\r\nf' },
      { id: 'y', text: 'a\r\nb\r\nc\r\nd\r\ne\r\nF' },
    ]);
    expect(m.ok && m.text).toBe('A\r\nb\r\nc\r\nd\r\ne\r\nF');
  });

  it('lineOps reports exact base ranges', () => {
    expect(lineOps(['a', 'b', 'c'], ['a', 'X', 'c'], 's')).toEqual([{ source: 's', start: 1, end: 2, lines: ['X'] }]);
    expect(lineOps(['a', 'c'], ['a', 'b', 'c'], 's')).toEqual([{ source: 's', start: 1, end: 1, lines: ['b'] }]);
  });
});

describe('stageProposeEdits (one approval pause)', () => {
  let root: string;
  let host: NodeWorkspaceHost;
  let sc: SafeChange;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-cs-')));
    writeFileSync(path.join(root, 'a.py'), lines(40));
    writeFileSync(path.join(root, 'b.py'), lines(10));
    host = new NodeWorkspaceHost(root);
    sc = new SafeChange(host);
  });

  it('two edits to the same file become ONE proposal with one combined diff, and apply cleanly', async () => {
    const r = await stageProposeEdits(
      [
        { toolCallId: 'c1', rawArgs: { path: 'a.py', rationale: 'first', edits: [{ old_text: 'line 3\n', new_text: 'LINE 3\n' }] } },
        { toolCallId: 'c2', rawArgs: { path: 'a.py', rationale: 'second', edits: [{ old_text: 'line 30\n', new_text: 'LINE 30\n' }] } },
      ],
      meta,
      host,
      sc,
    );
    expect(r.every((x) => x.ok)).toBe(true);
    const ids = new Set(r.map((x) => (x.ok ? x.proposal.id : '')));
    expect(ids.size).toBe(1);
    const p = sc.all()[0]!;
    expect(p.memberToolCallIds).toEqual(['c1', 'c2']);
    expect(p.hunks).toHaveLength(2);
    expect(p.rationale).toBe('(1) first (2) second');
    expect(sc.byToolCall('c2')).toHaveLength(1);
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    const res = await sc.applyChangeSet(sc.createChangeSet([p.id]));
    expect(res.outcomes[0]!.status).toBe('applied');
    expect(readFileSync(path.join(root, 'a.py'), 'utf8')).toBe(lines(40).replace('line 3\n', 'LINE 3\n').replace('line 30\n', 'LINE 30\n'));
    // the second tool call of the same proposal gets the recorded result, no second write
    const again = await sc.applyChangeSet(p.changeSetId!);
    expect(again.first).toBe(false);
    expect(again.outcomes[0]!.status).toBe('applied');
  });

  it('an overlapping second edit is refused with an actionable reason; the first is staged', async () => {
    const r = await stageProposeEdits(
      [
        { toolCallId: 'c1', rawArgs: { path: 'a.py', rationale: 'r', edits: [{ old_text: 'line 10\n', new_text: 'X\n' }] } },
        { toolCallId: 'c2', rawArgs: { path: 'a.py', rationale: 'r', edits: [{ old_text: 'line 10\nline 11\n', new_text: 'Y\n' }] } },
      ],
      meta,
      host,
      sc,
    );
    expect(r[0]!.ok).toBe(true);
    expect(r[1]!.ok).toBe(false);
    expect(!r[1]!.ok && r[1]!.error).toMatch(/same or adjacent lines.*Re-read the file/);
    expect(sc.all()).toHaveLength(1);
    expect(sc.all()[0]!.memberToolCallIds).toEqual(['c1']);
  });

  it('a call whose old_text is missing is refused alone; other files are unaffected', async () => {
    const r = await stageProposeEdits(
      [
        { toolCallId: 'c1', rawArgs: { path: 'a.py', rationale: 'r', edits: [{ old_text: 'nope', new_text: 'X' }] } },
        { toolCallId: 'c2', rawArgs: { path: 'b.py', rationale: 'r', edits: [{ old_text: 'line 2\n', new_text: 'TWO\n' }] } },
      ],
      meta,
      host,
      sc,
    );
    expect(r.map((x) => x.ok)).toEqual([false, true]);
  });

  it('two calls creating the same new file: the first is staged, the second refused', async () => {
    const r = await stageProposeEdits(
      [
        { toolCallId: 'c1', rawArgs: { path: 'new.py', rationale: 'r', new_content: 'x = 1\n' } },
        { toolCallId: 'c2', rawArgs: { path: 'new.py', rationale: 'r', new_content: 'y = 2\n' } },
      ],
      meta,
      host,
      sc,
    );
    expect(r.map((x) => x.ok)).toEqual([true, false]);
    expect(!r[1]!.ok && r[1]!.error).toMatch(/already creates it/);
  });

  it('a path outside the workspace is refused before anything is staged', async () => {
    const r = await stageProposeEdits([{ toolCallId: 'c1', rawArgs: { path: '../evil.py', rationale: 'r', new_content: 'x' } }], meta, host, sc);
    expect(r[0]!.ok).toBe(false);
    expect(sc.all()).toHaveLength(0);
  });
});

describe('applyChangeSet (multi-file, all-or-nothing with rollback)', () => {
  let root: string;
  let host: FlakyHost;
  let sc: SafeChange;
  const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-tx-')));
    for (const f of ['a.py', 'b.py', 'c.py']) writeFileSync(path.join(root, f), lines(10));
    host = new FlakyHost(new NodeWorkspaceHost(root));
    sc = new SafeChange(host);
  });
  const stage = (rel: string, base: string | null, next: string) => {
    const p = sc.stage({ toolCallId: rel, sessionId: 's', turnId: 't', path: rel, rationale: 'r', baseText: base, proposedText: next });
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    return p;
  };

  it('applies every file, records undo for each', async () => {
    const ps = ['a.py', 'b.py'].map((f) => stage(f, lines(10), lines(10).replace('line 1\n', `${f}\n`)));
    const r = await sc.applyChangeSet(sc.createChangeSet(ps.map((p) => p.id)));
    expect(r.outcomes.map((o) => o.status)).toEqual(['applied', 'applied']);
    expect(read('a.py').startsWith('a.py\n')).toBe(true);
    expect(sc.undoStack()).toHaveLength(2);
  });

  it('validates all targets first: a conflict in the LAST file means NO file is written', async () => {
    const ps = ['a.py', 'b.py', 'c.py'].map((f) => stage(f, lines(10), lines(10).replace('line 1\n', 'CHANGED\n')));
    writeFileSync(path.join(root, 'c.py'), lines(10) + 'user edit\n');
    const r = await sc.applyChangeSet(sc.createChangeSet(ps.map((p) => p.id)));
    expect(r.outcomes.map((o) => o.status)).toEqual(['failed', 'failed', 'conflict']);
    expect(host.writes).toEqual([]);
    expect(read('a.py')).toBe(lines(10));
    expect(read('b.py')).toBe(lines(10));
    expect(r.outcomes[0]!.message).toMatch(/all-or-nothing/);
    expect(sc.undoStack()).toHaveLength(0);
  });

  it('a write failure part-way rolls back the files already written, including a created file', async () => {
    const pa = stage('a.py', lines(10), 'A\n');
    const pn = stage('new.py', null, 'created\n');
    const pc = stage('c.py', lines(10), 'C\n');
    host.failWrite.add('c.py');
    const r = await sc.applyChangeSet(sc.createChangeSet([pa.id, pn.id, pc.id]));
    expect(r.outcomes.map((o) => o.status)).toEqual(['failed', 'failed', 'failed']);
    expect(r.rolledBack).toEqual(['new.py', 'a.py']);
    expect(r.rollbackFailures).toEqual([]);
    expect(read('a.py')).toBe(lines(10));
    expect(existsSync(path.join(root, 'new.py'))).toBe(false);
    expect(read('c.py')).toBe(lines(10));
    expect(r.outcomes[0]!.message).toMatch(/disk full.*Restored new\.py, a\.py/);
    expect(sc.undoStack()).toHaveLength(0);
  });

  it('a rollback that fails is reported explicitly, never hidden', async () => {
    const pa = stage('a.py', lines(10), 'A\n');
    const pb = stage('b.py', lines(10), 'B\n');
    host.failWrite.add('b.py');
    host.failRestore.add('a.py');
    const r = await sc.applyChangeSet(sc.createChangeSet([pa.id, pb.id]));
    expect(r.rollbackFailures).toEqual([{ path: 'a.py', error: 'permission denied (injected)' }]);
    expect(r.outcomes[0]!.message).toMatch(/ROLLBACK FAILED for a\.py/);
    expect(read('a.py')).toBe('A\n'); // honest: the file really is left modified
  });

  it('fully rejected proposals in the set are reported as rejected and not written', async () => {
    const pa = stage('a.py', lines(10), 'A\n');
    const pb = sc.stage({ toolCallId: 'b', sessionId: 's', turnId: 't', path: 'b.py', rationale: 'r', baseText: lines(10), proposedText: 'B\n' });
    sc.decideAll(pb.id, 'rejected');
    sc.closeReview(pb.id);
    const r = await sc.applyChangeSet(sc.createChangeSet([pa.id, pb.id]));
    expect(r.outcomes.map((o) => o.status)).toEqual(['applied', 'rejected']);
    expect(read('b.py')).toBe(lines(10));
  });

  it('concurrent callers share one apply (no double write)', async () => {
    const pa = stage('a.py', lines(10), 'A\n');
    const id = sc.createChangeSet([pa.id]);
    const [x, y] = await Promise.all([sc.applyChangeSet(id), sc.applyChangeSet(id)]);
    expect([x.first, y.first].sort()).toEqual([false, true]);
    expect(host.writes).toEqual(['a.py']);
  });

  it('a file changed between validation and its write is caught and the set rolled back', async () => {
    const pa = stage('a.py', lines(10), 'A\n');
    const pb = stage('b.py', lines(10), 'B\n');
    const orig = host.writeText.bind(host);
    host.writeText = async (rel, text) => {
      await orig(rel, text);
      if (rel === 'a.py') writeFileSync(path.join(root, 'b.py'), 'someone else\n');
    };
    const r = await sc.applyChangeSet(sc.createChangeSet([pa.id, pb.id]));
    expect(r.outcomes.every((o) => o.status === 'failed')).toBe(true);
    expect(r.outcomes[1]!.message).toMatch(/changed while the change set was being applied/);
    expect(read('a.py')).toBe(lines(10));
    expect(read('b.py')).toBe('someone else\n');
  });
});
