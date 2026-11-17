/**
 * Generates webview/src/dev/fixture.json for the browser preview.
 * The Context Receipt and the diff hunks are REAL outputs of our engine (context engine on
 * Flask 3.1.3, SafeChange hunking on hand-written example edits). The agent turn itself is simulated.
 *
 *   npx tsx scripts/gen-preview-fixture.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ContextEngine } from '../src/context/engine';
import { SafeChange } from '../src/safety/safeChange';
import { NodeWorkspaceHost } from '../src/workspace/host';

const TASK_B =
  'Add a new built-in CLI command flask config that prints the loaded application\'s configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.';

async function main() {
  const root = path.resolve('fixtures/flask');
  const engine = new ContextEngine(root);
  const { receipt } = await engine.assemble({ task: TASK_B });

  const host = new NodeWorkspaceHost(root);
  const sc = new SafeChange(host);
  const cli = readFileSync(path.join(root, 'src/flask/cli.py'), 'utf8');
  const cliNext = cli
    .replace(
      '            self.add_command(routes_command)\n',
      '            self.add_command(routes_command)\n            self.add_command(config_command)\n',
    )
    .replace(
      '\ncli = FlaskGroup(',
      `\n@click.command("config", short_help="Show the app's configuration as JSON.")\n@with_appcontext\ndef config_command() -> None:\n    """Print the loaded application's configuration as JSON.\n\n    Values of keys containing SECRET, PASSWORD, TOKEN or KEY are shown as "***".\n    """\n    masked = {\n        key: "***" if any(w in key.upper() for w in ("SECRET", "PASSWORD", "TOKEN", "KEY")) else value\n        for key, value in current_app.config.items()\n    }\n    click.echo(json.dumps(masked, indent=2, sort_keys=True, default=str))\n\n\ncli = FlaskGroup(`,
    );
  const testPath = 'tests/test_cli.py';
  const test = readFileSync(path.join(root, testPath), 'utf8');
  const testNext = `${test}\n\ndef test_config_command_masks_secrets(runner):\n    app = Flask(__name__)\n    app.config.update(SECRET_KEY="s3cret", API_TOKEN="t", DEBUG_VALUE=1)\n    result = runner.invoke(config_command, obj=ScriptInfo(create_app=lambda: app))\n    data = json.loads(result.output)\n    assert data["SECRET_KEY"] == "***"\n    assert data["API_TOKEN"] == "***"\n    assert data["DEBUG_VALUE"] == 1\n`;
  const mk = (p: string, base: string, next: string, rationale: string, toolCallId: string) =>
    sc.stage({ toolCallId, sessionId: 'preview', turnId: 'preview', path: p, rationale, baseText: base, proposedText: next });
  const proposals = [
    mk('src/flask/cli.py', cli, cliNext, 'Register a built-in `config` command next to run/shell/routes.', 'call-edit-1'),
    mk(testPath, test, testNext, 'Cover masking of SECRET/TOKEN keys and pass-through of other values.', 'call-edit-2'),
  ];
  writeFileSync(
    path.resolve('webview/src/dev/fixture.json'),
    JSON.stringify({ note: 'SIMULATED preview run. Receipt and hunks are real engine output; the agent turn is not.', task: TASK_B, receipt, proposals }, null, 1),
  );
  console.log(`wrote fixture: ${receipt.selected.length} receipt items, ${proposals.map((p) => `${p.path}:${p.hunks.length}`).join(', ')}`);
}
void main();
