/**
 * Retrieval evaluation on pallets/flask 3.1.3 (fixtures/flask).
 * Ground truth = files a correct change must touch, checked against the repo with grep
 * (see docs/RETRIEVAL_EVAL.md). Tasks deliberately span different modules so ranking can't be
 * tuned to Task B alone.
 *
 *   npx tsx scripts/eval-retrieval.ts [--json]
 */
import { ContextEngine } from '../src/context/engine';

interface EvalTask {
  id: string;
  task: string;
  expected: string[];
  selection?: { rel: string; startLine: number; endLine: number };
}

export const TASKS: EvalTask[] = [
  {
    id: 'B (official)',
    task: 'Add a new built-in CLI command flask config that prints the loaded application\'s configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.',
    expected: ['src/flask/cli.py', 'tests/test_cli.py', 'docs/cli.rst'],
  },
  {
    id: 'A (official, selection)',
    task: "Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.",
    expected: ['src/flask/helpers.py'],
    selection: { rel: 'src/flask/helpers.py', startLine: 28, endLine: 33 },
  },
  { id: 'E1 session samesite', task: 'Make the session cookie SameSite attribute default to Lax when SESSION_COOKIE_SAMESITE is not configured, and add a test.', expected: ['src/flask/sessions.py', 'tests/test_basic.py'] },
  { id: 'E2 json sort keys', task: 'Let the default JSON provider keep insertion order instead of sorting keys when a new option is set, with a test.', expected: ['src/flask/json/provider.py', 'tests/test_json.py'] },
  { id: 'E3 run host env', task: 'Allow the development server run command to read its default host from an environment variable, document it and test it.', expected: ['src/flask/cli.py', 'tests/test_cli.py', 'docs/cli.rst'] },
  { id: 'E4 blueprint twice', task: 'Log a warning instead of raising when the same blueprint is registered twice under one name; update the blueprint tests.', expected: ['src/flask/sansio/blueprints.py', 'tests/test_blueprints.py'] },
  { id: 'E5 flash categories', task: 'Let get_flashed_messages filter by a category prefix, and cover it with a test.', expected: ['src/flask/helpers.py', 'tests/test_basic.py'] },
  { id: 'E6 template filter', task: 'Register a default Jinja template filter that formats a byte count as a human readable size, with tests and documentation in the templating docs.', expected: ['src/flask/sansio/app.py', 'tests/test_templating.py', 'docs/templating.rst'] },
  { id: 'E7 class views methods', task: 'Let class-based views declare allowed HTTP methods through as_view arguments; add tests and update the views documentation.', expected: ['src/flask/views.py', 'tests/test_views.py', 'docs/views.rst'] },
  { id: 'E8 test client json', task: 'Make the test client open method send a json body for GET requests too, with a test.', expected: ['src/flask/testing.py', 'tests/test_testing.py'] },
  { id: 'E9 instance path', task: 'Change how the default instance folder path is found for namespace packages and update the instance config tests.', expected: ['src/flask/sansio/app.py', 'tests/test_instance_config.py'] },
  { id: 'E10 config from file signal', task: 'Send a new signal whenever configuration is loaded from a file, document it with the other signals and test it.', expected: ['src/flask/config.py', 'src/flask/signals.py', 'docs/signals.rst', 'tests/test_signals.py'] },
  { id: 'E11 json tag', task: 'Support tagging Python Decimal values in the session serializer tags so they round-trip, with a test.', expected: ['src/flask/json/tag.py', 'tests/test_json_tag.py'] },
];

async function main() {
  const engine = new ContextEngine('fixtures/flask');
  const t0 = performance.now();
  await engine.ready();
  const indexMs = performance.now() - t0;
  const rows: Array<{ id: string; inCtx: number; r5: number; r10: number; selected: number; noise: number; tokens: number; ms: number; missing: string[]; top5: string[] }> = [];
  for (const t of TASKS) {
    const s = performance.now();
    const { receipt } = await engine.assemble({ task: t.task, ...(t.selection ? { selection: t.selection } : {}) });
    const ms = performance.now() - s;
    const ranked = receipt.selected.map((x) => x.path);
    const at = (k: number) => t.expected.filter((e) => ranked.slice(0, k).includes(e)).length / t.expected.length;
    const missing = t.expected.filter((e) => !ranked.includes(e));
    const inCtx = t.expected.filter((e) => ranked.includes(e)).length / t.expected.length;
    const noise = ranked.filter((p) => !t.expected.includes(p)).length;
    rows.push({ id: t.id, inCtx, r5: at(5), r10: at(10), selected: ranked.length, noise, tokens: receipt.budget.usedTokens, ms: Math.round(ms), missing, top5: ranked.slice(0, 5) });
  }
  if (process.argv.includes('--json')) return void console.log(JSON.stringify({ indexMs, rows }, null, 2));
  console.log(`index ${indexMs.toFixed(0)} ms\n`);
  console.log('task                       ctx   R@5   R@10  sel noise tokens   ms  missing');
  for (const r of rows) console.log(`${r.id.padEnd(26)} ${r.inCtx.toFixed(2)}  ${r.r5.toFixed(2)}  ${r.r10.toFixed(2)}  ${String(r.selected).padStart(3)} ${String(r.noise).padStart(5)} ${String(r.tokens).padStart(6)} ${String(r.ms).padStart(4)}  ${r.missing.join(', ')}`);
  const mean = (k: 'r5' | 'r10' | 'inCtx') => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  console.log(`\nmean in-context recall ${mean('inCtx').toFixed(2)} · mean recall@5 ${mean('r5').toFixed(2)} · mean recall@10 ${mean('r10').toFixed(2)} · tasks with full recall@5: ${rows.filter((r) => r.r5 === 1).length}/${rows.length}`);
}
void main();
