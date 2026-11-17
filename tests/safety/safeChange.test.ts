import { mkdtempSync, readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyHunks, computeHunks } from '../../src/safety/hunks';
import { SafeChange } from '../../src/safety/safeChange';
import { ApprovalRegistry, canonicalJson, fingerprint } from '../../src/safety/approvals';
import { computeProposedText, EditSpecError } from '../../src/safety/proposeEditArgs';
import { NodeWorkspaceHost } from '../../src/workspace/host';

const lines = (n: number, f = (i: number) => `line ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

describe('hunks', () => {
  const base = lines(30);
  const proposed = base.replace('line 3\n', 'LINE THREE\n').replace('line 25\n', 'line 25\nline 25b\n');

  it('splits distant changes into separate hunks', () => {
    expect(computeHunks(base, proposed)).toHaveLength(2);
  });

  it('applies all, none, or a subset of hunks', () => {
    const h = computeHunks(base, proposed);
    expect(applyHunks(base, proposed, h, new Set([0, 1]))).toBe(proposed);
    expect(applyHunks(base, proposed, h, new Set())).toBe(base);
    const onlySecond = applyHunks(base, proposed, h, new Set([1]));
    expect(onlySecond).toContain('line 3\n');
    expect(onlySecond).toContain('line 25b\n');
  });

  it('preserves CRLF and missing final newline', () => {
    const b = 'a\r\nb\r\nc';
    const p = 'a\r\nB\r\nc';
    const h = computeHunks(b, p);
    expect(applyHunks(b, p, h, new Set([0]))).toBe(p);
    expect(applyHunks(b, p, h, new Set())).toBe(b);
  });

  it('handles creating a file from empty', () => {
    const h = computeHunks('', 'x\ny\n');
    expect(applyHunks('', 'x\ny\n', h, new Set([0]))).toBe('x\ny\n');
  });

  it('throws on conflicting base text', () => {
    const h = computeHunks(base, proposed);
    expect(() => applyHunks(base.replace('line 2\n', 'changed\n'), proposed, h, new Set([0]))).toThrow(/no longer matches/);
  });
});

describe('computeProposedText', () => {
  const file = 'def f():\n    return 1\n\ndef g():\n    return 1\n';
  it('applies unique search/replace edits', () => {
    expect(computeProposedText(file, { path: 'a.py', rationale: 'r', edits: [{ old_text: 'def f():\n    return 1', new_text: 'def f():\n    return 2' }] })).toContain('return 2');
  });
  it('rejects ambiguous and missing old_text with actionable messages', () => {
    expect(() => computeProposedText(file, { path: 'a.py', rationale: 'r', edits: [{ old_text: 'return 1', new_text: 'x' }] })).toThrow(/more than once/);
    expect(() => computeProposedText(file, { path: 'a.py', rationale: 'r', edits: [{ old_text: 'nope', new_text: 'x' }] })).toThrow(/not found/);
    expect(() => computeProposedText(file, { path: 'a.py', rationale: 'r' })).toThrow(EditSpecError);
  });
});

describe('approval registry', () => {
  it('fingerprints are key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
    expect(fingerprint('t', { a: 1, b: 2 })).toBe(fingerprint('t', { b: 2, a: 1 }));
  });
  it('grants are single-use, exact-match and expire', () => {
    let now = 0;
    const r = new ApprovalRegistry(1000, () => now);
    r.grant('propose_edit', { path: 'a', x: 1 }, 'call-1', 'p1');
    expect(r.consume('propose_edit', { path: 'a', x: 2 })).toBeUndefined();
    expect(r.consume('run_command', { path: 'a', x: 1 })).toBeUndefined();
    expect(r.consume('propose_edit', { x: 1, path: 'a' })?.payload).toBe('p1');
    expect(r.consume('propose_edit', { path: 'a', x: 1 })).toBeUndefined();
    r.grant('propose_edit', { path: 'b' }, 'call-2', 'p2');
    now = 5000;
    expect(r.consume('propose_edit', { path: 'b' })).toBeUndefined();
  });
});

describe('SafeChange', () => {
  let root: string;
  let host: NodeWorkspaceHost;
  let sc: SafeChange;
  const base = lines(30);
  const proposed = base.replace('line 3\n', 'LINE THREE\n').replace('line 25\n', 'line 25\nline 25b\n');

  beforeEach(() => {
    root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-sc-')));
    writeFileSync(path.join(root, 'f.py'), base);
    host = new NodeWorkspaceHost(root);
    sc = new SafeChange(host);
  });
  const stage = (p = proposed, baseText: string | null = base, file = 'f.py') =>
    sc.stage({ toolCallId: 'c1', sessionId: 's', turnId: 't', path: file, rationale: 'r', baseText, proposedText: p });

  it('staging never touches disk', () => {
    stage();
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe(base);
  });

  it('applies only accepted hunks and undo restores the exact pre-image', async () => {
    const p = stage();
    sc.decide(p.id, p.hunks[0]!.id, 'rejected');
    sc.decide(p.id, p.hunks[1]!.id, 'accepted');
    expect(sc.closeReview(p.id)).toBe('decided');
    const out = await sc.apply(p.id);
    expect(out.status).toBe('applied');
    const disk = readFileSync(path.join(root, 'f.py'), 'utf8');
    expect(disk).toContain('line 3\n');
    expect(disk).toContain('line 25b\n');
    expect((await sc.revert(p.id)).ok).toBe(true);
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe(base);
  });

  it('refuses to apply without a closed review', async () => {
    const p = stage();
    expect((await sc.apply(p.id)).status).toBe('rejected');
    expect(() => sc.closeReview(p.id)).toThrow(/Every hunk/);
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe(base);
  });

  it('all-rejected review becomes rejected and writes nothing', async () => {
    const p = stage();
    sc.decideAll(p.id, 'rejected');
    expect(sc.closeReview(p.id)).toBe('rejected');
    expect((await sc.apply(p.id)).status).toBe('rejected');
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe(base);
  });

  it('detects a conflicting edit made after staging', async () => {
    const p = stage();
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    writeFileSync(path.join(root, 'f.py'), base.replace('line 10', 'user edit'));
    const out = await sc.apply(p.id);
    expect(out.status).toBe('conflict');
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toContain('user edit');
  });

  it('undo refuses to clobber later user edits', async () => {
    const p = stage();
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    await sc.apply(p.id);
    writeFileSync(path.join(root, 'f.py'), 'user rewrote it\n');
    expect((await sc.revert(p.id)).ok).toBe(false);
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe('user rewrote it\n');
  });

  it('creates and undoes new files', async () => {
    const p = stage('print(1)\n', null, 'pkg/new.py');
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    expect((await sc.apply(p.id)).status).toBe('applied');
    expect(existsSync(path.join(root, 'pkg/new.py'))).toBe(true);
    await sc.revert(p.id);
    expect(existsSync(path.join(root, 'pkg/new.py'))).toBe(false);
  });

  it('cancellation discards pending proposals so they can never be applied', async () => {
    const p = stage();
    sc.decideAll(p.id, 'accepted');
    sc.closeReview(p.id);
    expect(sc.discardPending('t')).toBe(1);
    expect((await sc.apply(p.id)).status).toBe('rejected');
    expect(readFileSync(path.join(root, 'f.py'), 'utf8')).toBe(base);
  });
});
