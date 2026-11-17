import { mkdtempSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommandPolicyError, parseCommand, runCommand, tokenize } from '../../src/verification/commandRunner';
import { scrubSecrets } from '../../src/shared/secrets';

const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-cmd-')));

describe('tokenize / parseCommand', () => {
  it('parses the official Task A verification command with an env prefix and quoted code', () => {
    const p = parseCommand(`FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"`);
    expect(p.env).toEqual({ FLASK_DEBUG: 'off' });
    expect(p.program).toBe('python');
    expect(p.args).toEqual(['-c', 'from flask.helpers import get_debug_flag; print(get_debug_flag())']);
  });

  it('parses pytest with flags', () => {
    expect(parseCommand('pytest tests/test_cli.py -q')).toEqual({ env: {}, program: 'pytest', args: ['tests/test_cli.py', '-q'] });
  });

  it.each([
    ['rm -rf /', /not an allowed program/],
    ['curl https://example.com', /not an allowed program/],
    ['bash -c "ls"', /not an allowed program/],
    ['pytest; rm -rf /', /Shell operators/],
    ['pytest && echo hi', /Shell operators/],
    ['pytest | tee out', /Shell operators/],
    ['python -c "x" > out.txt', /Shell operators/],
    ['echo $HOME', /Shell operators/],
    ['/bin/ls', /by name/],
    ['git push origin main', /read-only git/],
    ['git reset --hard', /read-only git/],
    ['PATH=/tmp pytest', /not allowed/],
    ['DYLD_INSERT_LIBRARIES=x python', /not allowed/],
    ['npm install leftpad', /npm test/],
    ['', /empty/],
  ])('refuses %s', (cmd, re) => {
    expect(() => parseCommand(cmd)).toThrow(CommandPolicyError);
    expect(() => parseCommand(cmd)).toThrow(re);
  });

  it('keeps semicolons inside quotes', () => {
    expect(tokenize(`python -c "a; b"`)).toEqual(['python', '-c', 'a; b']);
  });
});

describe('runCommand', () => {
  it('captures output and exit code without a shell', async () => {
    const r = await runCommand(`python3 -c "import sys; print('hello'); sys.exit(3)"`, { workspaceRoot: root });
    expect(r.exitCode).toBe(3);
    expect(r.outputTail).toContain('hello');
    expect(r.timedOut).toBe(false);
  });

  it('passes allowed env vars through', async () => {
    const r = await runCommand(`FLASK_DEBUG=off python3 -c "import os; print(os.environ['FLASK_DEBUG'])"`, { workspaceRoot: root });
    expect(r.outputTail.trim()).toBe('off');
  });

  it('kills commands that exceed the timeout', async () => {
    const r = await runCommand(`python3 -c "import time; time.sleep(10)"`, { workspaceRoot: root, timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).not.toBe(0);
    expect(r.durationMs).toBeLessThan(5000);
  });

  it('stops on abort', async () => {
    const ac = new AbortController();
    const p = runCommand(`python3 -c "import time; time.sleep(10)"`, { workspaceRoot: root, signal: ac.signal });
    setTimeout(() => ac.abort(), 200);
    const r = await p;
    expect(r.cancelled).toBe(true);
  });

  it('caps and scrubs output', async () => {
    const fake = 'gsk_' + 'A'.repeat(40);
    const r = await runCommand(`python3 -c "print('x'*50000); print('${fake}')"`, { workspaceRoot: root, maxOutputBytes: 1000 });
    expect(r.outputTail.length).toBeLessThanOrEqual(1000);
    expect(r.truncated).toBe(true);
    expect(r.outputTail).not.toContain(fake);
    expect(r.outputTail).toContain('[REDACTED]');
  });
});

describe('scrubSecrets', () => {
  it('redacts provider keys but leaves code alone', () => {
    const text = `key=AIza${'b'.repeat(35)} app.config["SECRET_KEY"] = "dev"`;
    const out = scrubSecrets(text);
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('app.config["SECRET_KEY"] = "dev"');
  });
});
