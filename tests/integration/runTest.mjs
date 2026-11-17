// Runs the extension inside the locally installed VS Code (no download) against a temp workspace.
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.VSCODE_EXECUTABLE ?? path.join(os.homedir(), 'Applications/Visual Studio Code.app/Contents/MacOS/Code');
const ws = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'axiom-int-')));
mkdirSync(path.join(ws, 'pkg'));
writeFileSync(path.join(ws, 'pkg', 'flags.py'), 'def get_flag():\n    """Return the flag."""\n    return True\n');
writeFileSync(path.join(ws, 'tests_flags.py'), 'from pkg.flags import get_flag\n');
writeFileSync(path.join(ws, 'pkg', 'long.py'), Array.from({ length: 20 }, (_, i) => `value_${i + 1} = ${i + 1}`).join('\n') + '\n');

await runTests({
  vscodeExecutablePath: exe,
  extensionDevelopmentPath: repo,
  extensionTestsPath: path.join(repo, 'tests/integration/suite/index.cjs'),
  launchArgs: [ws, '--disable-extensions', ...(process.env.AXIOM_TEST_DISABLE ?? '').split(',').filter(Boolean).flatMap((id) => ['--disable-extension', id]), '--skip-welcome', '--skip-release-notes', `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'axiom-ud-'))}`],
  extensionTestsEnv: { AXIOM_TEST_WORKSPACE: ws, AXIOM_TEST_NO_START: process.env.AXIOM_TEST_NO_START ?? '', AXIOM_PROFILE: process.env.AXIOM_PROFILE ?? '', AXIOM_LIVE_PRIMARY: process.env.AXIOM_LIVE_PRIMARY ?? '', AXIOM_LIVE_BACKUP: process.env.AXIOM_LIVE_BACKUP ?? '' },
});
