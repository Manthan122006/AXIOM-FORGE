/**
 * Streaming cost on the extension-host thread, without VS Code: a SYNTHETIC turn (not recorded) with
 * ~60 tool calls, 1,500 text deltas and a 40 KB propose_edit whose arguments stream in 800 deltas.
 * Replays what AxiomController does per event (TurnTracker.apply → sync timeline into host state)
 * plus one state serialisation per 40 ms post window (approximated as every 10 events).
 *
 *   npx tsx scripts/bench-stream.ts
 */
import { performance } from 'node:perf_hooks';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { AgentEvent } from '../src/shared/contracts';
import { TurnTracker } from '../src/trueforge/reducer';

type Ev = TrueForgeApi.TurnStreamingEvent;
const mcp = (name: string) => ({ type: 'mcp' as const, name, serverId: 's', serverName: 'axiom-forge' });

function turn(): Ev[] {
  const evs: Ev[] = [{ type: 'turn.created', id: 'e0', turnId: 't', previousTurnId: null, threadId: null, createdAt: 'x', state: { status: 'running' } } as Ev];
  for (let i = 0; i < 60; i++) {
    evs.push({ type: 'model.message', id: `r${i}`, threadId: 'main', createdAt: 'x', content: null, toolCalls: [{ id: `c${i}`, type: 'function', function: { name: 'axiom-forge__read_file', arguments: `{"path":"src/f${i}.py"}` }, toolInfo: mcp('read_file') }] } as Ev);
    evs.push({ type: 'tool.response', id: `tr${i}`, threadId: 'main', createdAt: 'x', toolCallId: `c${i}`, content: 'x'.repeat(1500) } as Ev);
  }
  evs.push({ type: 'model.message', id: 'm', threadId: 'main', createdAt: 'x', content: '' } as Ev);
  for (let i = 0; i < 1500; i++) evs.push({ type: 'model.message.delta', id: 'm', threadId: 'main', content: 'word ' } as Ev);
  const args = JSON.stringify({ path: 'src/big.py', rationale: 'r', new_content: 'print("hello world")\n'.repeat(1900) });
  evs.push({ type: 'model.message', id: 'p', threadId: 'main', createdAt: 'x', content: null, toolCalls: [{ id: 'cp', type: 'function', function: { name: 'axiom-forge__propose_edit', arguments: '' }, toolInfo: mcp('propose_edit') }] } as Ev);
  const step = Math.ceil(args.length / 800);
  for (let i = 0; i < args.length; i += step) evs.push({ type: 'model.message.delta', id: 'p', threadId: 'main', toolCalls: [{ index: 0, function: { arguments: args.slice(i, i + step) } }] } as unknown as Ev);
  evs.push({ type: 'tool.approval_required', id: 'a', threadId: 'main', createdAt: 'x', toolCalls: [{ id: 'cp', sourceEventId: 'p' }] } as Ev);
  return evs;
}

/** Controller-equivalent sync. `dirtyOnly` uses TurnTracker.drainDirty() when available. */
function run(dirtyOnly: boolean) {
  const tracker = new TurnTracker();
  const timeline: AgentEvent[] = [];
  const idx = new Map<string, number>();
  const push = (ev: AgentEvent) => {
    const at = idx.get(ev.id);
    if (at === undefined) {
      idx.set(ev.id, timeline.length);
      dirtyRows.add(timeline.length);
      timeline.push(ev);
    } else {
      timeline[at] = ev;
      dirtyRows.add(at);
    }
  };
  const copy = (ev: AgentEvent): AgentEvent => (ev.kind === 'tool_call' ? { ...ev, call: { ...ev.call } } : { ...ev });
  const evs = turn();
  let worst = 0;
  let bytes = 0;
  const dirtyRows = new Set<number>();
  const t0 = performance.now();
  evs.forEach((ev, i) => {
    const s = performance.now();
    if (tracker.apply(ev)) {
      const drain = (tracker as unknown as { drainDirty?: () => string[] }).drainDirty;
      if (dirtyOnly && drain) {
        for (const id of drain.call(tracker)) {
          const e = tracker.timeline.find((x) => x.id === id);
          if (e) push(copy(e));
        }
      } else for (const e of tracker.timeline) push(copy(e));
    }
    if (i % 10 === 0) {
      // Phase 2 posted the whole state each window; Phase 3 posts only changed rows (patch).
      bytes += dirtyOnly
        ? JSON.stringify({ type: 'patch', timeline: { length: timeline.length, set: [...dirtyRows].map((r) => [r, timeline[r]]) } }).length
        : JSON.stringify({ type: 'state', state: { timeline: [...timeline] } }).length;
      dirtyRows.clear();
    }
    worst = Math.max(worst, performance.now() - s);
  });
  return { events: evs.length, totalMs: performance.now() - t0, worstEventMs: worst, serializedMB: bytes / 1e6 };
}

const fmt = (r: ReturnType<typeof run>) => `${r.events} events: total ${r.totalMs.toFixed(0)} ms, worst single event ${r.worstEventMs.toFixed(1)} ms, serialised ${r.serializedMB.toFixed(1)} MB`;
run(false); // warm-up
console.log(`copy-all sync + full posts (Phase 2): ${fmt(run(false))}`);
console.log(`dirty-only sync + patch posts:      ${fmt(run(true))}`);
