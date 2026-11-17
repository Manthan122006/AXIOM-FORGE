// Usage: npx tsx scripts/receipt.ts <root> "<task>" [file:start:end]
import { ContextEngine } from '../src/context/engine';

const [root = 'fixtures/flask', task = '', sel] = process.argv.slice(2);
async function main() {
const engine = new ContextEngine(root);
const t0 = performance.now();
await engine.ready();
const t1 = performance.now();
const selection = sel ? { rel: sel.split(':')[0]!, startLine: Number(sel.split(':')[1]), endLine: Number(sel.split(':')[2]) } : undefined;
const { receipt } = await engine.assemble({ task, ...(selection ? { selection } : {}) });
const t2 = performance.now();
console.log(`index ${(t1 - t0).toFixed(0)}ms, assemble ${(t2 - t1).toFixed(0)}ms; repo ${receipt.repo.files} files / ${receipt.repo.indexedLines} lines / ~${receipt.repo.estTokensTotal} tokens`);
console.log(`budget ${receipt.budget.usedTokens}/${receipt.budget.limitTokens}`);
for (const s of receipt.selected) console.log(`  + ${s.path.padEnd(32)} ${String(s.score).padStart(6)} ${s.category.padEnd(14)} ${s.inclusion.mode.padEnd(7)} ${s.estTokens}t  ${s.reason}`);
for (const s of receipt.selected) if (s.inclusion.mode === 'ranges') console.log(`    ${s.path} ranges ${JSON.stringify(s.inclusion.ranges)}`);
for (const e of receipt.excluded.slice(0, 8)) console.log(`  - ${e.path.padEnd(32)} ${e.reason} ${e.detail}`);
}
void main();
