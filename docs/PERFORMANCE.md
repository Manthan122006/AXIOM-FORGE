# Extension-host performance (Phase 3 investigation)

**Question:** where does the ~1.4–2.4 s extension-host stall seen in the VS Code integration tests come from, and how much of it is AXIOM Forge?

## Method
1. **CPU profile of the real extension host** during the integration suite: `AXIOM_PROFILE=/path/x.cpuprofile npm run test:vscode`, then `node scripts/analyze-cpuprofile.mjs /path/x.cpuprofile --min 300`. The analyser finds stretches with no idle sample, maps each one to the test that was running, and splits **self time by owner**: AXIOM Forge (`dist/extension.js`), test-harness dependencies (`node_modules`), VS Code, node internals.
2. **Per-test event-loop lag** (`monitorEventLoopDelay`, printed as `[lag]` per test).
3. **Instrumented spans** in the product (`src/shared/perf.ts`): every synchronous AXIOM operation that can be heavy is timed (context assembly, index derivation, diff, merge, apply, stream reduce, webview post, MCP server build, MCP body parse). The suite prints the report as `[perf]`.
4. **Node micro-benchmarks** for the same code outside VS Code: `scripts/bench-mcp.ts`, `scripts/bench-build.ts`, `scripts/bench-stream.ts`.

## Findings

### 1. The largest stalls are VS Code's own work, not AXIOM's
| Stall (max lag) | Test | Self time: VS Code | Self time: AXIOM | Cause |
|---|---|---|---|---|
| 1.5–2.4 s | B/I/J (real TrueForge failure path) | 1,630–2,606 ms | 5–45 ms | the test writes workspace settings, and VS Code loads its built-in JSON extension (`jsonClientMain.js`, `extensionHostProcess.js load`) |
| 0.6–2.1 s | SafeChange WorkspaceEdit test | 160–670 ms | 3–53 ms | test-harness `require` of the MCP SDK from `node_modules` (`zod core.cjs init`), GC, VS Code document work |

### 2. AXIOM work that was avoidable, now fixed
| Problem (found in profile/spans) | Fix | Evidence |
|---|---|---|
| A new MCP server (7 tools, zod schemas) built for **every** HTTP request | built servers are pooled and reconnected per request | VS Code run: 20 requests served by 3 instances (was 1 per request). Per-test max lag on the MCP-heavy D-G test: 839–869 ms → 376–453 ms |
| zod objects re-created on every `normalizeGatedArgs` call | hoisted to module scope | — |
| First `tools/list` (~0.4 s cold: zod → JSON Schema + JIT) landed when the user pressed Run | warmed 3 s after activation, off the Run path | `mcp.warmup` span |
| Every streamed event copied **every** timeline row (O(n²) per turn) | reducer tracks dirty rows; host copies only those | `scripts/bench-stream.ts`, synthetic 2,412-event turn: 20 ms → 3 ms CPU |
| Whole state posted to the webview every 40 ms | `patch` messages: changed slices + changed timeline rows only | same bench: **25.7 MB → 0.7 MB** posted per turn; VS Code run: 2 full posts, 28–29 patches |
| Streamed tool arguments re-parsed with `JSON.parse` (and thrown on) per delta | parse only when the JSON could be complete | reducer test |
| Full symbol index + relation graph rebuilt after **each** applied file | marked stale and rebuilt once at the next query | `context.relations` ~6 ms on Flask in Node; scales with repo size |

### 3. The VS Code test instance is far slower than real use, so its absolute numbers aren't representative
For identical synchronous code, `buildMcpServer` takes **2.7 ms cold / 0.2 ms warm** in plain Node (`scripts/bench-build.ts`) but **166–528 ms** inside the test's extension host. VS Code's own `WorkspaceEdit` + save took **10.6 s** and opening a document **5.5 s** in the same run, with AXIOM work disabled for those calls. We have **not established why** this instance is so slow. Background throttling of the unfocused test window is plausible but unverified. Treat the test's absolute lag numbers as an upper bound, and the profile's ownership split as the reliable part.

## What remains (honest)
- In the slow test host, AXIOM still blocks for up to: `mcp.buildServer` 239 ms (per new pooled instance, at most once per concurrent request), `safechange.diff` 160 ms (first call; jsdiff cold), `webview.post` 75 ms (first full post). In Node, the same operations take under 3 ms.
- **Not yet verified in a normal F5 session or with a real model stream.** Next check (Vivan/Manthan): set `axiomForge.perfLog: true`, run Task B, then **AXIOM Forge: Show Performance Report**. The stall detector now logs each stall > 250 ms with the AXIOM spans that ran in that window, or says that none did (VS Code or another extension).

## How to reproduce
```bash
npm run build:ext
AXIOM_PROFILE=$PWD/exthost.cpuprofile npm run test:vscode
node scripts/analyze-cpuprofile.mjs exthost.cpuprofile --min 300
npx tsx scripts/bench-stream.ts && npx tsx scripts/bench-mcp.ts && npx tsx scripts/bench-build.ts
```
