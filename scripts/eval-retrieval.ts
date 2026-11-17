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
  // ---- Held-out set H1–H12: written and committed BEFORE any Phase 3 ranking change (see RETRIEVAL_EVAL.md).
  // Ground truth checked with grep on Flask 3.1.3. Not to be edited to make numbers go up.
  { id: 'H1 prefixed env sep', task: 'Add an option to Config.from_prefixed_env to use a custom separator for nested keys instead of double underscores; document it and add a test.', expected: ['src/flask/config.py', 'tests/test_config.py', 'docs/config.rst'] },
  { id: 'H2 log request path', task: 'Make the default logging handler include the request method and path in each log line, and update the logging docs and tests.', expected: ['src/flask/logging.py', 'tests/test_logging.py', 'docs/logging.rst'] },
  { id: 'H3 copy ctx async', task: 'Let copy_current_request_context also wrap async functions, with a test.', expected: ['src/flask/ctx.py', 'tests/test_reqctx.py'] },
  { id: 'H4 form memory error', task: 'Raise a clearer error message when MAX_FORM_MEMORY_SIZE is exceeded, and add a request test for it.', expected: ['src/flask/wrappers.py', 'tests/test_request.py'] },
  { id: 'H5 send dir name', task: 'Make send_from_directory fall back to a sensible download name when the requested file has no extension, with tests.', expected: ['src/flask/helpers.py', 'tests/test_helpers.py'] },
  { id: 'H6 redirect debug msg', task: 'Improve the debug-mode error raised when a form POST gets redirected because the URL was defined with a trailing slash, so the message names the HTTP method; update the existing test.', expected: ['src/flask/debughelpers.py', 'tests/test_basic.py'] },
  { id: 'H7 stream template list', task: 'Let stream_template accept a list of template names and use the first that exists, with tests and a note in the templating docs.', expected: ['src/flask/templating.py', 'tests/test_templating.py', 'docs/templating.rst'] },
  { id: 'H8 blueprint cli group', task: "Allow a blueprint's cli_group to be changed after the blueprint is constructed, and cover it in the CLI tests.", expected: ['src/flask/sansio/blueprints.py', 'tests/test_cli.py'] },
  { id: 'H9 auto options config', task: 'Add a configuration key that disables automatic OPTIONS responses for every route, and document it in the configuration docs.', expected: ['src/flask/sansio/app.py', 'docs/config.rst'] },
  { id: 'H10 async install hint', task: 'Give a clearer install hint in the error raised when an async view is used without the async extra installed, and test it.', expected: ['src/flask/app.py', 'tests/test_async.py'] },
  { id: 'H11 shell banner names', task: 'Make the interactive shell command list the names provided by shell context processors in its banner.', expected: ['src/flask/cli.py'] },
  { id: 'H12 template attribute', task: 'Make get_template_attribute raise an error naming the template when the attribute is missing, with a templating test.', expected: ['src/flask/helpers.py', 'tests/test_templating.py'] },
  // ---- Fresh set F1–F8: written and committed AFTER the Phase 3 ranking changes and scored once,
  // with no ranking change afterwards. This is the honest generalisation number (H1–H12 were
  // partly inspected while designing the changes; see RETRIEVAL_EVAL.md).
  { id: 'F1 build error params', task: 'When building a URL fails, make the error message list the parameters the endpoint accepts, and test it.', expected: ['src/flask/sansio/app.py', 'tests/test_basic.py'] },
  { id: 'F2 abort description', task: 'Make abort accept a description keyword that is passed to the HTTP exception, with tests.', expected: ['src/flask/helpers.py', 'tests/test_helpers.py'] },
  { id: 'F3 cli runner env', task: 'Let the CLI test runner take default environment variables that apply to every invoke call, with a test.', expected: ['src/flask/testing.py', 'tests/test_testing.py'] },
  { id: 'F4 accepts json', task: 'Add a request property that reports whether the client accepts a JSON response based on the Accept header, with a test.', expected: ['src/flask/wrappers.py', 'tests/test_request.py'] },
  { id: 'F5 bp hooks endpoints', task: 'Let blueprint before_request hooks be limited to a given set of endpoints, with tests and an update to the blueprint docs.', expected: ['src/flask/sansio/blueprints.py', 'tests/test_blueprints.py', 'docs/blueprints.rst'] },
  { id: 'F6 cookie size warning', task: 'Log a warning when the serialized session cookie is larger than browsers accept.', expected: ['src/flask/sessions.py'] },
  { id: 'F7 routes reverse sort', task: 'Let the command that lists URL routes sort in reverse order, and test it.', expected: ['src/flask/cli.py', 'tests/test_cli.py'] },
  { id: 'F8 response tuple headers', task: 'Make view return tuples accept headers given as a list of pairs together with a status, and test it.', expected: ['src/flask/app.py', 'tests/test_basic.py'] },
];

const split = (id: string) => (id.startsWith('H') ? 'heldout' : id.startsWith('F') ? 'fresh' : 'dev');

async function ablation(engine: ContextEngine) {
  console.log('ablation (all 33 tasks): signal family switched off → tasks fully in top 5 · mean R@5 · in-context');
  for (const fam of ['none', 'keyword', 'path', 'symbol', 'imports', 'pairing']) {
    let full = 0;
    let r5 = 0;
    let ctx = 0;
    for (const t of TASKS) {
      const { receipt } = await engine.assemble({ task: t.task, ...(t.selection ? { selection: t.selection } : {}), ablate: fam === 'none' ? [] : [fam] });
      const ranked = receipt.selected.map((x) => x.path);
      const hit5 = t.expected.filter((e) => ranked.slice(0, 5).includes(e)).length / t.expected.length;
      full += hit5 === 1 ? 1 : 0;
      r5 += hit5;
      ctx += t.expected.filter((e) => ranked.includes(e)).length / t.expected.length;
    }
    console.log(`  ${fam.padEnd(8)} ${String(full).padStart(2)}/${TASKS.length} · ${(r5 / TASKS.length).toFixed(2)} · ${(ctx / TASKS.length).toFixed(2)}`);
  }
}

async function main() {
  const engine = new ContextEngine('fixtures/flask');
  const t0 = performance.now();
  await engine.ready();
  const indexMs = performance.now() - t0;
  if (process.argv.includes('--ablate')) return void (await ablation(engine));
  const rows: Array<{ id: string; split: string; inCtx: number; r5: number; r10: number; selected: number; noise: number; dupes: number; tokens: number; budget: number; ms: number; missing: string[]; ranks: Record<string, number | null>; top5: string[]; p5: number; useful: number }> = [];
  for (const t of TASKS) {
    // warm-up run is excluded from latency so the first task isn't penalised by JIT
    if (rows.length === 0) await engine.assemble({ task: t.task });
    const s = performance.now();
    const { receipt } = await engine.assemble({ task: t.task, ...(t.selection ? { selection: t.selection } : {}) });
    const ms = performance.now() - s;
    const ranked = receipt.selected.map((x) => x.path);
    const at = (k: number) => t.expected.filter((e) => ranked.slice(0, k).includes(e)).length / t.expected.length;
    const missing = t.expected.filter((e) => !ranked.includes(e));
    const inCtx = t.expected.filter((e) => ranked.includes(e)).length / t.expected.length;
    const noise = ranked.filter((p) => !t.expected.includes(p)).length;
    const dupes = ranked.length - new Set(ranked).size;
    const ranks = Object.fromEntries(t.expected.map((e) => [e, ranked.includes(e) ? ranked.indexOf(e) + 1 : null]));
    const p5 = ranked.slice(0, 5).filter((p) => t.expected.includes(p)).length / Math.min(5, ranked.length || 1);
    const useful = receipt.selected.filter((x) => t.expected.includes(x.path)).reduce((a, x) => a + x.estTokens, 0) / Math.max(1, receipt.budget.usedTokens);
    rows.push({ p5, useful, id: t.id, split: split(t.id), inCtx, r5: at(5), r10: at(10), selected: ranked.length, noise, dupes, tokens: receipt.budget.usedTokens, budget: receipt.budget.limitTokens, ms: Math.round(ms), missing, ranks, top5: ranked.slice(0, 5) });
  }
  if (process.argv.includes('--json')) return void console.log(JSON.stringify({ indexMs, rows }, null, 2));
  console.log(`index ${indexMs.toFixed(0)} ms\n`);
  console.log('task                        split    ctx   R@5   R@10  sel dup tokens   ms  ranks of expected files');
  for (const r of rows) console.log(`${r.id.padEnd(27)} ${r.split.padEnd(7)} ${r.inCtx.toFixed(2)}  ${r.r5.toFixed(2)}  ${r.r10.toFixed(2)}  ${String(r.selected).padStart(3)} ${String(r.dupes).padStart(3)} ${String(r.tokens).padStart(6)} ${String(r.ms).padStart(4)}  ${Object.entries(r.ranks).map(([f, k]) => `${f.split('/').pop()}:${k ?? '—'}`).join(' ')}`);
  const summary = (label: string, rs: typeof rows) => {
    const mean = (k: 'r5' | 'r10' | 'inCtx') => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
    const tok = rs.reduce((a, r) => a + r.tokens, 0) / rs.length;
    const p5 = rs.reduce((a, r) => a + r.p5, 0) / rs.length;
    const useful = rs.reduce((a, r) => a + r.useful, 0) / rs.length;
    console.log(`${label.padEnd(9)} precision@5 ${p5.toFixed(2)} · share of context tokens spent on ground-truth files ${(100 * useful).toFixed(0)}%`);
    console.log(`${label.padEnd(9)} n=${String(rs.length).padStart(2)} · tasks fully in top 5: ${rs.filter((r) => r.r5 === 1).length}/${rs.length} (${((100 * rs.filter((r) => r.r5 === 1).length) / rs.length).toFixed(0)}%) · mean R@5 ${mean('r5').toFixed(2)} · mean R@10 ${mean('r10').toFixed(2)} · in-context ${mean('inCtx').toFixed(2)} · latency p50 ${ms[Math.floor(ms.length / 2)]} ms max ${ms[ms.length - 1]} ms · mean context ${Math.round(tok)} tokens`);
  };
  console.log('');
  summary('dev', rows.filter((r) => r.split === 'dev'));
  summary('held-out', rows.filter((r) => r.split === 'heldout'));
  summary('fresh', rows.filter((r) => r.split === 'fresh'));
  summary('all', rows);
}
if (process.argv[1]?.endsWith("eval-retrieval.ts")) void main();
