import { memo } from 'react';
import type { DiffHunk, ProposedEdit } from '../../../src/shared/contracts';
import { post, useAxiom } from '../store';

function stats(p: ProposedEdit) {
  let add = 0;
  let del = 0;
  for (const h of p.hunks)
    for (const l of h.lines) {
      if (l[0] === '+') add++;
      else if (l[0] === '-') del++;
    }
  return { add, del };
}

const Hunk = memo(function Hunk({ proposalId, hunk, open }: { proposalId: string; hunk: DiffHunk; open: boolean }) {
  const label = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
  const state =
    hunk.applyState === 'applied' ? ['applied', 'state-ok'] : hunk.applyState === 'reverted' ? ['undone', 'muted'] : hunk.applyState === 'failed' ? ['failed', 'state-bad'] : hunk.decision === 'accepted' ? ['accepted', 'state-ok'] : hunk.decision === 'rejected' ? ['rejected', 'state-bad'] : ['pending', 'state-wait'];
  return (
    <div className={`hunk ${hunk.decision}`}>
      <div className="hunk-head">
        <span className="code" title={label}>
          Hunk {hunk.index + 1} <span className="muted">{label}</span>
        </span>
        <span className={`hunk-state ${state[1]}`}>{state[0]}</span>
        {open && (
          <>
            <button className={`btn ${hunk.decision === 'accepted' ? 'on-ok' : ''}`} aria-pressed={hunk.decision === 'accepted'} onClick={() => post({ type: 'hunkDecision', proposalId, hunkId: hunk.id, decision: 'accepted' })}>
              Accept
            </button>
            <button className={`btn ${hunk.decision === 'rejected' ? 'on-bad' : ''}`} aria-pressed={hunk.decision === 'rejected'} onClick={() => post({ type: 'hunkDecision', proposalId, hunkId: hunk.id, decision: 'rejected' })}>
              Reject
            </button>
          </>
        )}
      </div>
      <pre className="diff" aria-label={`Diff for hunk ${hunk.index + 1}`}>
        {hunk.lines.map((l, i) => (
          <span key={i} className={l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : ''}>
            {l}
          </span>
        ))}
      </pre>
    </div>
  );
});

const FileChange = memo(function FileChange({ p }: { p: ProposedEdit }) {
  const { add, del } = stats(p);
  const open = p.status === 'staged';
  const canUndo = p.status === 'applied';
  const statusText: Record<ProposedEdit['status'], string> = {
    staged: 'waiting for review',
    decided: 'applying…',
    applied: 'applied',
    rejected: 'rejected',
    conflict: 'file changed. Not applied',
    discarded: 'discarded (run stopped)',
    undone: 'undone',
    failed: 'failed',
  };
  return (
    <div className={`file ${open ? 'waiting' : ''}`}>
      <div className="file-head">
        <span className="path" title={p.path}>
          {p.path}
          {p.isNewFile ? ' (new)' : ''}
        </span>
        <span className="num code">
          <span className="add">+{add}</span> <span className="del">−{del}</span>
        </span>
        <button className="btn" onClick={() => post({ type: 'openDiff', proposalId: p.id })}>
          Open diff
        </button>
        {canUndo && (
          <button className="btn" onClick={() => post({ type: 'undo', proposalId: p.id })}>
            Undo change
          </button>
        )}
      </div>
      <div className="rationale">
        {p.rationale} · <span className={open ? 'state-wait' : p.status === 'applied' ? 'state-ok' : p.status === 'undone' || p.status === 'discarded' ? 'muted' : 'state-bad'}>{statusText[p.status]}</span>
        {(p.memberToolCallIds?.length ?? 1) > 1 && <span className="muted"> · combines {p.memberToolCallIds!.length} edits from the agent into one diff</span>}
      </div>
      {(p.status === 'failed' || p.status === 'conflict') && p.outcomeMessage && (
        <div className="rationale state-bad" role="alert">
          {p.outcomeMessage}
        </div>
      )}
      {p.hunks.map((h) => (
        <Hunk key={h.id} proposalId={p.id} hunk={h} open={open} />
      ))}
    </div>
  );
});

export function Review() {
  const proposals = useAxiom((s) => s.proposals);
  const list = Object.values(proposals).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!list.length) return null;
  const staged = list.filter((p) => p.status === 'staged');
  const hunks = staged.flatMap((p) => p.hunks);
  const accepted = hunks.filter((h) => h.decision === 'accepted').length;
  const pending = hunks.filter((h) => h.decision === 'pending').length;
  const applied = list.filter((p) => p.status === 'applied').length;
  return (
    <section className="dock" aria-label="Changes to review">
      <div className="dock-scroll">
        <h3>
          {staged.length ? 'Changes to review' : 'Changes'}
          <span className="muted num" style={{ fontWeight: 400 }}>
            {staged.length ? `${staged.length} file${staged.length > 1 ? 's' : ''} · ${hunks.length} hunk${hunks.length > 1 ? 's' : ''}` : `${applied} applied`}
          </span>
        </h3>
        {list.map((p) => (
          <FileChange key={p.id} p={p} />
        ))}
      </div>
      {staged.length > 0 && (
        <div className="review-actions">
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn danger" onClick={() => post({ type: 'rejectAll', proposalIds: staged.map((p) => p.id) })}>
              Reject all
            </button>
            <button className="btn" onClick={() => post({ type: 'acceptAll', proposalIds: staged.map((p) => p.id) })}>
              Accept all
            </button>
          </span>
          <button className="btn primary" disabled={pending > 0} title={pending > 0 ? `${pending} hunk(s) still need a decision` : staged.length > 1 ? 'All files are applied together: if any file cannot be written, none are changed' : undefined} onClick={() => post({ type: 'submitReview' })}>
            {pending > 0 ? `Decide ${pending} more` : accepted > 0 ? `Apply ${accepted} accepted hunk${accepted > 1 ? 's' : ''}` : 'Send rejection'}
          </button>
        </div>
      )}
    </section>
  );
}
