import { memo } from 'react';
import type { AgentEvent, ToolCallState } from '../../../src/shared/contracts';
import { durationMs, formatMs } from '../derive';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Skeleton } from '../ui/primitives';
import { Markdown } from './Markdown';

const PHASE: Record<ToolCallState['phase'], { label: string; cls: string; node: string }> = {
  requested: { label: 'requested', cls: 'muted', node: 'act' },
  awaiting_approval: { label: 'waiting for you', cls: 'state-wait', node: 'wait' },
  approved: { label: 'approved', cls: 'state-run', node: 'run' },
  denied: { label: 'denied', cls: 'state-bad', node: 'bad' },
  running: { label: 'running', cls: 'state-run', node: 'run' },
  succeeded: { label: 'done', cls: 'state-ok', node: 'ok' },
  failed: { label: 'failed', cls: 'state-bad', node: 'bad' },
};

function toolDetail(c: ToolCallState): string {
  const a = c.args as Record<string, unknown>;
  if (typeof a.path === 'string') {
    const range = a.start_line ? ` L${a.start_line}${a.end_line ? `–${a.end_line}` : ''}` : '';
    return `${a.path}${range}`;
  }
  if (typeof a.command === 'string') return a.command;
  if (typeof a.query === 'string') return `"${a.query}"${a.glob ? ` in ${a.glob}` : ''}`;
  if (typeof a.name === 'string') return a.name;
  return ''; // assemble_context's task is the user's own request, already shown above
}

const TOOL_LABEL: Record<string, string> = {
  assemble_context: 'Assemble context',
  read_file: 'Read',
  search_workspace: 'Search',
  find_symbol: 'Find symbol',
  related_files: 'Related files',
  propose_edit: 'Propose edit',
  run_command: 'Run',
  create_sub_agent: 'Start subagent',
};

const ToolStep = memo(function ToolStep({ call }: { call: ToolCallState }) {
  const p = PHASE[call.phase];
  const detail = toolDetail(call);
  const ms = durationMs(call);
  const file = typeof call.args.path === 'string' ? call.args.path : null;
  return (
    <li className={`step tool p-${call.phase}`}>
      <span className={`node ${p.node}${call.phase === 'running' || call.phase === 'awaiting_approval' ? ' live' : ''}`} aria-hidden="true" />
      <details>
        <summary className="step-head">
          <span className="step-title">{TOOL_LABEL[call.toolName] ?? call.toolName}</span>
          <span className="step-detail code" title={detail}>
            {detail}
          </span>
          <span className={`step-state ${p.cls}`}>
            {p.label}
            {ms !== null ? <span className="step-ms num"> {formatMs(ms)}</span> : null}
          </span>
        </summary>
        {file ? (
          <button className="linkish code" onClick={() => post({ type: 'openFile', path: file, ...(typeof call.args.start_line === 'number' ? { line: call.args.start_line } : {}) })}>
            Open {file}
          </button>
        ) : null}
        {call.resultPreview ? <div className="tool-result">{call.resultPreview}</div> : null}
      </details>
      {call.toolName === 'assemble_context' && (call.phase === 'running' || call.phase === 'requested') ? <Skeleton rows={3} /> : null}
    </li>
  );
});

declare global {
  interface Window {
    __axiomRenders?: Record<string, number>;
  }
}

const Step = memo(function Step({ ev }: { ev: AgentEvent }) {
  // Dev-only render counter used to verify that streaming re-renders only the changed row.
  if (import.meta.env.DEV) (window.__axiomRenders ??= {})[ev.id] = (window.__axiomRenders[ev.id] ?? 0) + 1;
  switch (ev.kind) {
    case 'user_message':
      return (
        <li className="step">
          <span className="node act" aria-hidden="true" />
          <div className="user-msg">{ev.text}</div>
        </li>
      );
    case 'assistant_text':
      return (
        <li className="step">
          <span className={`node ${ev.streaming ? 'run live' : 'act'}`} aria-hidden="true" />
          <div className="assistant" aria-live={ev.streaming ? 'polite' : undefined}>
            <Markdown text={ev.text} />
            {ev.streaming && <span className="caret" aria-hidden="true" />}
          </div>
        </li>
      );
    case 'tool_call':
      return <ToolStep call={ev.call} />;
    case 'subagent':
      return (
        <li className="step">
          <span className={`node ${ev.status === 'running' ? 'run' : 'ok'}`} aria-hidden="true" />
          <div className="step-head">
            <span className="step-title">Subagent</span>
            <span className="step-detail code">{ev.title}</span>
            <span className={`step-state ${ev.status === 'running' ? 'state-run' : 'state-ok'}`}>{ev.status === 'running' ? 'running' : 'done'}</span>
          </div>
        </li>
      );
    case 'compaction':
      return (
        <li className="step">
          <span className="node" aria-hidden="true" />
          <div className="step-head muted">TrueForge {ev.status === 'started' ? 'is compacting' : 'compacted'} earlier context</div>
        </li>
      );
    case 'context_receipt':
      return <ReceiptStep receiptId={ev.receiptId} />;
    case 'recovery':
      return null; // shown in the recovery banner
    case 'verification':
      return null; // shown in Proof
    case 'turn_end':
      return (
        <li className="step">
          <span className={`node ${ev.status === 'done' ? 'ok' : 'bad'}`} aria-hidden="true" />
          <div className={`step-head ${ev.status === 'done' ? 'muted' : 'state-bad'}`}>
            {ev.status === 'done' ? 'Run finished' : ev.status === 'cancelled' ? 'Run stopped. Nothing unapproved was written.' : `Run failed: ${ev.message ?? 'unknown error'}`}
          </div>
        </li>
      );
  }
});

function ReceiptStep({ receiptId }: { receiptId: string }) {
  const receipt = useAxiom((s) => s.receipts[receiptId]);
  const nav = useNav();
  if (!receipt) return null;
  const top = receipt.selected.slice(0, 3);
  return (
    <li className="step receipt-step">
      <span className="node ok" aria-hidden="true" />
      <div>
        <div className="step-head">
          <span className="step-title">Context assembled</span>
        </div>
        <p className="receipt-sum num">
          {receipt.selected.length} of {receipt.repo.files} files, {(receipt.budget.usedTokens / 1000).toFixed(1)}k of {(receipt.budget.limitTokens / 1000).toFixed(0)}k tokens
        </p>
        <ul className="receipt-peek">
          {top.map((s) => (
            <li key={s.path} className="code">
              {s.path}
            </li>
          ))}
        </ul>
        <button className="linkish" onClick={() => nav.go('context', { receiptId })}>
          See why these files were chosen
        </button>
      </div>
    </li>
  );
}

export function Timeline() {
  const timeline = useAxiom((s) => s.timeline);
  return (
    <ol className="tl" aria-label="Agent activity">
      {timeline.map((ev) => (
        <Step key={ev.id} ev={ev} />
      ))}
    </ol>
  );
}
