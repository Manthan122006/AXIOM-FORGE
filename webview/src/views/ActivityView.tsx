import { memo, useMemo, useState } from 'react';
import type { AgentEvent } from '../../../src/shared/contracts';
import { Trace } from '../components/Trace';
import { durationMs, filesTouched, formatMs, runsOf, shortModel, toolCounts, type Run } from '../derive';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Dot, Empty, Figure, Section, ViewHead, type Tone } from '../ui/primitives';

const TOOL: Record<string, string> = {
  assemble_context: 'Assemble context',
  read_file: 'Read file',
  search_workspace: 'Search',
  find_symbol: 'Find symbol',
  related_files: 'Related files',
  propose_edit: 'Propose edit',
  run_command: 'Run command',
  create_sub_agent: 'Start subagent',
};

function clock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const Row = memo(function Row({ ev }: { ev: AgentEvent }) {
  let tone: Tone = 'idle';
  let title = '';
  let detail = '';
  let at = '';
  let ms: number | null = null;
  switch (ev.kind) {
    case 'user_message':
      return null;
    case 'assistant_text':
      tone = ev.streaming ? 'run' : 'act';
      title = ev.streaming ? 'Agent is writing' : 'Agent replied';
      detail = ev.text.replace(/\s+/g, ' ').slice(0, 140);
      at = ev.at;
      break;
    case 'tool_call': {
      const c = ev.call;
      tone = c.phase === 'succeeded' ? 'ok' : c.phase === 'failed' || c.phase === 'denied' ? 'bad' : c.phase === 'awaiting_approval' ? 'wait' : 'run';
      title = TOOL[c.toolName] ?? c.toolName;
      const a = c.args;
      detail = typeof a.path === 'string' ? a.path : typeof a.command === 'string' ? a.command : typeof a.query === 'string' ? `"${a.query}"` : typeof a.name === 'string' ? a.name : '';
      at = c.startedAt;
      ms = durationMs(c);
      title += c.phase === 'awaiting_approval' ? ' (waiting for you)' : c.phase === 'denied' ? ' (denied)' : c.phase === 'failed' ? ' (failed)' : '';
      break;
    }
    case 'subagent':
      tone = ev.status === 'running' ? 'run' : 'ok';
      title = `Subagent ${ev.title}`;
      detail = ev.status === 'running' ? 'working' : 'finished';
      at = ev.at;
      break;
    case 'compaction':
      title = ev.status === 'started' ? 'TrueForge compacting earlier context' : 'Earlier context compacted';
      at = ev.at;
      break;
    case 'context_receipt':
      tone = 'ok';
      title = 'Context assembled';
      at = ev.at;
      break;
    case 'recovery': {
      const s = ev.state;
      tone = s.kind === 'recovered' ? 'ok' : s.kind === 'exhausted' || s.kind === 'failed' ? 'bad' : 'wait';
      title = s.kind === 'failed' ? `${shortModel(s.model)} failed (${s.failure.replace('_', ' ')})` : s.kind === 'retrying' ? `Retrying ${shortModel(s.model)} (${s.attempt}/${s.maxAttempts})` : s.kind === 'switching' ? `Switched to ${shortModel(s.to)}${s.failure ? ` after ${s.failure.replace('_', ' ')} failure` : ''}` : s.kind === 'recovered' ? `${shortModel(s.model)} completed on backup` : s.kind === 'exhausted' ? 'No model could complete the run' : `On ${shortModel(s.model)}`;
      detail = s.kind === 'failed' || s.kind === 'exhausted' ? s.message : '';
      at = ev.at;
      break;
    }
    case 'verification':
      tone = 'act';
      title = 'Verification recorded';
      at = ev.at;
      break;
    case 'turn_end':
      tone = ev.status === 'done' ? 'ok' : 'bad';
      title = ev.status === 'done' ? 'Run finished' : ev.status === 'cancelled' ? 'Run stopped' : 'Run failed';
      detail = ev.message ?? '';
      at = ev.at;
      break;
  }
  return (
    <li className="act-row">
      <span className="act-time num">{clock(at)}</span>
      <Dot tone={tone} live={tone === 'run'} />
      <div className="act-main">
        <span className="act-title">{title}</span>
        {detail ? <span className="act-detail code">{detail}</span> : null}
      </div>
      <span className="act-ms num">{formatMs(ms)}</span>
    </li>
  );
});

function RunDetail({ run }: { run: Run }) {
  const files = useMemo(() => filesTouched(run.events), [run]);
  const counts = useMemo(() => toolCounts(run.events), [run]);
  const total = run.end ? Date.parse(run.end.at) - Date.parse(run.startedAt) : null;
  const calls = counts.reduce((a, c) => a + c.count, 0);
  const failed = counts.reduce((a, c) => a + c.failed, 0);
  return (
    <>
      <p className="run-request">{run.request}</p>
      <Trace run={run} />
      <div className="figures">
        <Figure value={!run.end ? 'running' : run.end.status === 'done' ? 'finished' : run.end.status} label="outcome" tone={!run.end ? 'run' : run.end.status === 'done' ? 'ok' : 'bad'} />
        <Figure value={total !== null && total >= 0 ? formatMs(total) : '–'} label="total time" />
        <Figure value={calls} label="tool calls" />
        <Figure value={failed} label="failed or denied" tone={failed ? 'bad' : undefined} />
      </div>
      <div className="act-split">
        <Section title="Tools used" count={counts.length || undefined}>
          {counts.length ? (
            <ul className="counts">
              {counts.map((c) => (
                <li key={c.name}>
                  <span>{TOOL[c.name] ?? c.name}</span>
                  <span className="num">{c.count}</span>
                  {c.failed ? <span className="num c-bad">{c.failed} failed</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No tools called yet." />
          )}
        </Section>
        <Section title="Files touched" count={files.length || undefined}>
          {files.length ? (
            <ul className="counts">
              {files.map((f) => (
                <li key={f.path}>
                  <button className="linkish code" onClick={() => post({ type: 'openFile', path: f.path })}>
                    {f.path}
                  </button>
                  <span className={f.how === 'proposed' ? 'c-wait' : 'muted'}>{f.how === 'proposed' ? 'change proposed' : 'read'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No files read yet." />
          )}
        </Section>
      </div>
      <Section title="Every step">
        <ol className="act-list">
          {run.events.map((ev) => (
            <Row key={ev.id} ev={ev} />
          ))}
        </ol>
      </Section>
    </>
  );
}

export function ActivityView() {
  const timeline = useAxiom((s) => s.timeline);
  const runs = useMemo(() => runsOf(timeline), [timeline]);
  const [pick, setPick] = useState<string | null>(null);
  const nav = useNav();
  const run = runs.find((r) => r.id === pick) ?? runs[runs.length - 1];
  return (
    <div className="view">
      <ViewHead
        title="Activity"
        lede="What the agent did, step by step, as TrueForge reported it."
        actions={
          runs.length > 1 ? (
            <select className="select" aria-label="Choose a run" value={run?.id} onChange={(e) => setPick(e.target.value)}>
              {[...runs].reverse().map((r, i) => (
                <option key={r.id} value={r.id}>
                  {i === 0 ? 'Latest' : clock(r.startedAt)}: {r.request.slice(0, 40)}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      {run ? (
        <RunDetail run={run} />
      ) : (
        <Empty title="No runs yet." action={<button className="btn primary" onClick={() => nav.go('workspace')}>Describe a task</button>}>
          Each run's tool calls, files and timings appear here.
        </Empty>
      )}
    </div>
  );
}
