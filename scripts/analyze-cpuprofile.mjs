/**
 * Attribute extension-host stalls from a V8 .cpuprofile (from `AXIOM_PROFILE=… npm run test:vscode`).
 * Finds contiguous busy stretches (no "(idle)" sample) longer than --min ms and, for each, the
 * functions with the most self time and whether they belong to AXIOM Forge (dist/extension.js),
 * VS Code itself, or node internals.
 *   node scripts/analyze-cpuprofile.mjs <file.cpuprofile> [--min 200]
 */
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const min = Number(process.argv[process.argv.indexOf('--min') + 1] || 200) || 200;
const prof = JSON.parse(readFileSync(file, 'utf8'));
let marks = [];
try {
  marks = JSON.parse(readFileSync(file + '.marks.json', 'utf8'));
} catch {}
const testAt = (ms) => marks.find((m) => ms >= m.start && ms <= (m.end ?? Infinity))?.title ?? 'between tests (before/after hooks, activation)';
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const owner = (url) =>
  !url ? 'native/(program)' : /axiom-forge\/dist\/extension\.js/.test(url) ? 'AXIOM Forge' : /node_modules|axiom-forge/.test(url) ? 'AXIOM deps' : /^node:|internal\//.test(url) ? 'node' : 'VS Code';
const stackOwners = (id) => {
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) seen.add(owner(byId.get(cur).callFrame.url));
  return seen;
};
let t = prof.startTime;
const samples = prof.samples.map((id, i) => ((t += prof.timeDeltas[i]), { id, t }));
const isIdle = (id) => ['(idle)', '(garbage collector)'].includes(byId.get(id).callFrame.functionName) && byId.get(id).callFrame.functionName === '(idle)';
const runs = [];
let start = null;
for (let i = 0; i < samples.length; i++) {
  const busy = !isIdle(samples[i].id);
  if (busy && start === null) start = i;
  if ((!busy || i === samples.length - 1) && start !== null) {
    const ms = (samples[i].t - samples[start].t) / 1000;
    if (ms >= min) runs.push({ start, end: i, ms });
    start = null;
  }
}
console.log(`profile ${((samples.at(-1).t - samples[0].t) / 1e6).toFixed(1)} s, ${samples.length} samples; busy stretches ≥ ${min} ms: ${runs.length}`);
for (const r of runs.sort((a, b) => b.ms - a.ms).slice(0, 8)) {
  const self = new Map();
  const owners = new Map();
  for (let i = r.start; i < r.end; i++) {
    const dt = (samples[i + 1].t - samples[i].t) / 1000;
    const f = byId.get(samples[i].id).callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
    const top = owner(f.url);
    owners.set(top, (owners.get(top) ?? 0) + dt);
  }
  const at = (samples[r.start].t - samples[0].t) / 1000;
  console.log(`\n— ${r.ms.toFixed(0)} ms busy at +${(at / 1000).toFixed(2)} s [${testAt(at)}] · self time by owner: ${[...owners].sort((a, b) => b[1] - a[1]).map(([o, ms]) => `${o} ${ms.toFixed(0)} ms`).join(', ')}`);
  for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${ms.toFixed(0).padStart(5)} ms  ${k}`);
}
