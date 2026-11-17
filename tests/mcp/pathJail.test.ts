import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { isSecretPath, PathPolicyError, resolveWorkspacePath } from '../../src/mcp/pathJail';

let root: string;
let outside: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-ws-')));
  outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-out-')));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'a.py'), 'x = 1\n');
  writeFileSync(path.join(outside, 'secret.txt'), 'nope');
  symlinkSync(outside, path.join(root, 'link-out'));
});

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof PathPolicyError ? e.code : 'other';
  }
}

describe('resolveWorkspacePath', () => {
  it('accepts workspace-relative paths and normalises them', () => {
    expect(resolveWorkspacePath(root, 'src/a.py', 'read').rel).toBe('src/a.py');
    expect(resolveWorkspacePath(root, './src/../src/a.py', 'read').rel).toBe('src/a.py');
    expect(resolveWorkspacePath(root, path.join(root, 'src/a.py'), 'read').rel).toBe('src/a.py');
  });

  it('accepts new files inside the workspace for writing', () => {
    expect(resolveWorkspacePath(root, 'src/new/dir/b.py', 'write').rel).toBe('src/new/dir/b.py');
  });

  it.each([
    ['../../etc/passwd'],
    ['/etc/passwd'],
    ['%2e%2e/%2e%2e/etc/passwd'],
    ['src/../../outside.txt'],
    ['~/.ssh/id_rsa'],
  ])('rejects escape attempt %s', (p) => {
    expect(code(() => resolveWorkspacePath(root, p, 'read'))).toBe('outside_workspace');
  });

  it('rejects symlink escapes', () => {
    expect(code(() => resolveWorkspacePath(root, 'link-out/secret.txt', 'read'))).toBe('symlink_escape');
  });

  it.each(['.env', 'config/.env.production', '.git/config', 'certs/server.pem', 'keys/id_ed25519', '.npmrc', 'config/models.local.json'])(
    'denies secret path %s',
    (p) => {
      expect(code(() => resolveWorkspacePath(root, p, 'read'))).toBe('denied');
      expect(isSecretPath(p)).toBe(true);
    },
  );

  it('allows reading but not writing generated dirs and lockfiles', () => {
    expect(code(() => resolveWorkspacePath(root, '.venv/lib/x.py', 'read'))).toBeUndefined();
    expect(code(() => resolveWorkspacePath(root, '.venv/lib/x.py', 'write'))).toBe('denied');
    expect(code(() => resolveWorkspacePath(root, 'package-lock.json', 'write'))).toBe('denied');
  });

  it('rejects empty, NUL and root paths', () => {
    expect(code(() => resolveWorkspacePath(root, '', 'read'))).toBe('empty');
    expect(code(() => resolveWorkspacePath(root, 'a\0b', 'read'))).toBe('invalid');
    expect(code(() => resolveWorkspacePath(root, '.', 'read'))).toBe('invalid');
  });

  it('allows .env.example', () => {
    expect(code(() => resolveWorkspacePath(root, '.env.example', 'read'))).toBeUndefined();
  });
});
