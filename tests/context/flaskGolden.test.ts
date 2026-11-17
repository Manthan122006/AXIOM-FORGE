/**
 * Golden retrieval tests on the official competition repository (pallets/flask 3.1.3).
 * Requires `npm run fixture:flask`. Skipped (with a visible reason) if the fixture is missing.
 */
import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContextEngine } from '../../src/context/engine';
import { extractTerms } from '../../src/context/assemble';

const ROOT = 'fixtures/flask';
const hasFixture = existsSync(`${ROOT}/src/flask/cli.py`);
const TASK_A = "Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.";
const TASK_B =
  'Add a new built-in CLI command flask config that prints the loaded application\'s configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.';

describe.skipIf(!hasFixture)('context engine on Flask 3.1.3 (fixture)', () => {
  let engine: ContextEngine;
  beforeAll(async () => {
    engine = new ContextEngine(ROOT);
    await engine.ready();
  });

  it('indexes the repository and it is larger than the budget', async () => {
    const s = await engine.stats();
    expect(s.files).toBeGreaterThan(150);
    expect(s.lines).toBeGreaterThan(17_000);
    const { receipt } = await engine.assemble({ task: TASK_B });
    expect(receipt.repo.estTokensTotal).toBeGreaterThan(receipt.budget.limitTokens * 5);
  });

  it('Task B: finds implementation, test and docs in the top 5 without file names', async () => {
    const { receipt } = await engine.assemble({ task: TASK_B });
    const top5 = receipt.selected.slice(0, 5).map((s) => s.path);
    expect(top5).toEqual(expect.arrayContaining(['src/flask/cli.py', 'tests/test_cli.py', 'docs/cli.rst']));
    const byPath = Object.fromEntries(receipt.selected.map((s) => [s.path, s]));
    expect(byPath['src/flask/cli.py']!.category).toBe('implementation');
    expect(byPath['tests/test_cli.py']!.category).toBe('test');
    expect(byPath['docs/cli.rst']!.category).toBe('documentation');
  });

  it('Task B: respects the budget and explains every choice and exclusion', async () => {
    const { receipt, bundle } = await engine.assemble({ task: TASK_B, budgetTokens: 24_000 });
    expect(receipt.budget.usedTokens).toBeLessThanOrEqual(24_000);
    expect(Math.ceil(bundle.length / 4)).toBeLessThanOrEqual(24_000 + 400); // header overhead
    for (const s of receipt.selected) {
      expect(s.reason.length).toBeGreaterThan(10);
      expect(s.signals.length).toBeGreaterThan(0);
    }
    expect(receipt.excluded.length).toBeGreaterThan(0);
    for (const e of receipt.excluded) expect(e.detail.length).toBeGreaterThan(5);
  });

  it('Task B: large cli.py is sent as focused windows covering the built-in command definitions', async () => {
    const { receipt } = await engine.assemble({ task: TASK_B });
    const cli = receipt.selected.find((s) => s.path === 'src/flask/cli.py')!;
    expect(cli.inclusion.mode).toBe('ranges');
    const ranges = cli.inclusion.mode === 'ranges' ? cli.inclusion.ranges : [];
    const covers = (line: number) => ranges.some(([a, b]) => a <= line && line <= b);
    expect(covers(1009) || covers(1069)).toBe(true); // shell_command / routes_command definitions
  });

  it('Task A: the selection file comes first and its test file is paired', async () => {
    const { receipt } = await engine.assemble({ task: TASK_A, selection: { rel: 'src/flask/helpers.py', startLine: 27, endLine: 34 } });
    expect(receipt.selected[0]!.path).toBe('src/flask/helpers.py');
    expect(receipt.selected[0]!.category).toBe('selection');
    expect(receipt.selected.map((s) => s.path)).toContain('tests/test_helpers.py');
  });

  it('explicit @file and @symbol mentions are hard-included', async () => {
    const { receipt } = await engine.assemble({
      task: 'explain this',
      mentions: [
        { kind: 'file', value: 'src/flask/blueprints.py' },
        { kind: 'symbol', value: 'get_debug_flag' },
      ],
    });
    const cats = Object.fromEntries(receipt.selected.map((s) => [s.path, s.category]));
    expect(cats['src/flask/blueprints.py']).toBe('explicit_mention');
    expect(cats['src/flask/helpers.py']).toBe('explicit_mention');
  });

  it('finds symbols, references and relations', async () => {
    const s = await engine.symbol('get_debug_flag');
    expect(s.definitions[0]).toMatchObject({ rel: 'src/flask/helpers.py', line: 28, kind: 'function' });
    expect(s.references.length).toBeGreaterThan(0);
    const routes = await engine.symbol('routes');
    expect(routes.definitions.some((d) => d.kind === 'command' && d.rel === 'src/flask/cli.py')).toBe(true);
    const rel = await engine.related('src/flask/cli.py');
    expect(rel.some((e) => e.from === 'tests/test_cli.py' && e.kind === 'tests')).toBe(true);
    expect(rel.some((e) => e.from === 'docs/cli.rst' && e.kind === 'documents')).toBe(true);
  });

  it('search is literal, case-insensitive and glob-filterable', async () => {
    const r = await engine.search('add_command', { glob: 'src/**/*.py' });
    expect(r.matches.every((m) => m.rel.startsWith('src/'))).toBe(true);
    expect(r.matches.some((m) => m.rel === 'src/flask/cli.py')).toBe(true);
  });
});

describe('extractTerms', () => {
  it('keeps meaningful words and identifiers, drops stop words', () => {
    const t = extractTerms(TASK_B);
    expect(t).toEqual(expect.arrayContaining(['cli', 'command', 'config', 'json', 'secret', 'password', 'token', 'key']));
    expect(t).not.toContain('the');
    expect(t).not.toContain('must');
  });
});

if (!hasFixture) {
  describe('flask fixture', () => {
    it.skip('fixtures/flask missing: run `npm run fixture:flask` to enable golden retrieval tests', () => {});
  });
}
