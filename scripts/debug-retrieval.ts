/** Print the top-N ranking with signals for selected eval tasks: npx tsx scripts/debug-retrieval.ts E8 H12 */
import { ContextEngine } from '../src/context/engine';
import { extractTerms } from '../src/context/assemble';
import { TASKS } from './eval-retrieval';
const ids = process.argv.slice(2);
void (async () => {
const engine = new ContextEngine('fixtures/flask');
await engine.ready();
for (const t of TASKS.filter((x) => ids.some((i) => x.id.startsWith(i + ' ')))) {
  const { receipt } = await engine.assemble({ task: t.task, ...(t.selection ? { selection: t.selection } : {}) });
  console.log(`\n## ${t.id}  expected: ${t.expected.join(', ')}\nterms: ${extractTerms(t.task).join(' ')}`);
  receipt.selected.slice(0, 8).forEach((s, i) => console.log(`${i + 1}. ${t.expected.includes(s.path) ? '✓' : ' '} ${s.path} ${s.score}  ${s.signals.map((g) => `${g.signal}:${g.weight}`).join(' ')}`));
  for (const e of receipt.excluded.filter((x) => t.expected.includes(x.path))) console.log(`   ✗ excluded ${e.path}: ${e.detail}`);
}
})();
