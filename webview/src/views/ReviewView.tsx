import { memo, useMemo } from 'react';
import type { DiffHunk, ProposedEdit } from '../../../src/shared/contracts';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Empty, Section, ViewHead } from '../ui/primitives';

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

const STATUS: Record<ProposedEdit['status'], { label: string; tone: string }> = {
  staged: { label: 'waiting for you', tone: 'wait' },
  decided: { label: 'applying', tone: 'run' },
  applied: { label: 'applied', tone: 'ok' },
  rejected: { label: 'rejected', tone: 'idle' },
  conflict: { label: 'not applied: file changed', tone: 'bad' },
  discarded: { label: 'discarded: run stopped', tone: 'idle' },
  undone: { label: 'undone', tone: 'idle' },
  failed: { label: 'not applied', tone: 'bad' },
};

const Hunk = memo(function Hunk({ proposalId, hunk, open }: { proposalId: string; hunk: DiffHunk; open: boolean }) {
  const lines = hunk.newLines ? `lines ${hunk.newStart}–${hunk.newStart + hunk.newLines - 1}` : `after line ${hunk.oldStart}`;
  const state =
    hunk.applyState === 'applied' ? ['applied', 'ok'] : hunk.applyState === 'reverted' ? ['undone', 'idle'] : hunk.applyState === 'failed' ? ['failed', 'bad'] : hunk.decision === 'accepted' ? ['accepted', 'ok'] : hunk.decision === 'rejected' ? ['rejected', 'bad'] : ['undecided', 'wait'];
  return (
    <div className={`hunk d-${hunk.decision}`}>
      <div className="hunk-head">
        <span className="hunk-name">
          Hunk {hunk.index + 1} <span className="muted num">{lines}</span>
        </span>
        <span className={`chip t-${state[1]}`}>{state[0]}</span>
        {open ? (
          <span className="hunk-actions">
            <button className={`btn sm${hunk.decision === 'accepted' ? ' on-ok' : ''}`} aria-pressed={hunk.decision === 'accepted'} onClick={() => post({ type: 'hunkDecision', proposalId, hunkId: hunk.id, decision: 'accepted' })}>
              Accept
            </button>
            <button className={`btn sm${hunk.decision === 'rejected' ? ' on-bad' : ''}`} aria-pressed={hunk.decision === 'rejected'} onClick={() => post({ type: 'hunkDecision', proposalId, hunkId: hunk.id, decision: 'rejected' })}>
              Reject
            </button>
          </span>
        ) : null}
      </div>
      <pre className="diff" aria-label={`Hunk ${hunk.index + 1}, ${lines}`}>
        {hunk.lines.map((l, i) => (
          <span key={i} className={l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : ''}>
            {l}
          </span>
        ))}
      </pre>
    </div>
  );
});

const FileReview = memo(function FileReview({ p }: { p: ProposedEdit }) {
  const { add, del } = stats(p);
  const open = p.status === 'staged';
  const st = STATUS[p.status];
  const decided = p.hunks.filter((h) => h.decision !== 'pending').length;
  return (
    <article className={`file s-${p.status}`} aria-label={`Changes to ${p.path}`}>
      <header className="file-head">
        <div className="file-id">
          <span className="code file-path" title={p.path}>
            {p.path}
          </span>
          <span className="file-delta num">
            <span className="c-ok">+{add}</span> <span className="c-bad">−{del}</span>
            {p.isNewFile ? <span className="tag">new file</span> : null}
          </span>
        </div>
        <span className={`chip t-${st.tone}`}>{st.label}</span>
      </header>
      <p className="file-why">{p.rationale}</p>
      {(p.memberToolCallIds?.length ?? 1) > 1 ? <p className="file-note">Combines {p.memberToolCallIds!.length} edits the agent made to this file into one diff.</p> : null}
      {(p.status === 'conflict' || p.status === 'failed') && p.outcomeMessage ? (
        <p className="file-note c-bad" role="alert">
          {p.outcomeMessage}
        </p>
      ) : null}
      <div className="file-actions">
        <button className="btn sm" onClick={() => post({ type: 'openDiff', proposalId: p.id })}>
          Open diff in editor
        </button>
        {open ? (
          <>
            <span className="muted small num">
              {decided} of {p.hunks.length} decided
            </span>
            <button className="btn sm" onClick={() => post({ type: 'acceptAll', proposalIds: [p.id] })}>
              Accept file
            </button>
            <button className="btn sm" onClick={() => post({ type: 'rejectAll', proposalIds: [p.id] })}>
              Reject file
            </button>
          </>
        ) : null}
        {p.status === 'applied' ? (
          <button className="btn sm" onClick={() => post({ type: 'undo', proposalId: p.id })}>
            Undo change
          </button>
        ) : null}
      </div>
      {open || p.status === 'applied' ? p.hunks.map((h) => <Hunk key={h.id} proposalId={p.id} hunk={h} open={open} />) : null}
    </article>
  );
});

function DecisionBar({ staged }: { staged: ProposedEdit[] }) {
  const hunks = staged.flatMap((p) => p.hunks);
  const pending = hunks.filter((h) => h.decision === 'pending').length;
  const accepted = hunks.filter((h) => h.decision === 'accepted').length;
  return (
    <div className="decision" role="region" aria-label="Decision">
      <div className="decision-text">
        {pending ? (
          <span>
            <strong className="num">{pending}</strong> {pending > 1 ? 'hunks still need' : 'hunk still needs'} a decision.
          </span>
        ) : accepted ? (
          <span>
            Ready to apply <strong className="num">{accepted}</strong> accepted hunk{accepted > 1 ? 's' : ''}
            {staged.length > 1 ? ` across ${staged.length} files, together. If one file can't be written, none are.` : '.'}
          </span>
        ) : (
          <span>Every hunk is rejected. The agent will be told not to apply this change.</span>
        )}
      </div>
      <div className="decision-actions">
        <button className="btn" onClick={() => post({ type: 'rejectAll', proposalIds: staged.map((p) => p.id) })}>
          Reject all
        </button>
        <button className="btn" onClick={() => post({ type: 'acceptAll', proposalIds: staged.map((p) => p.id) })}>
          Accept all
        </button>
        <button className="btn primary" disabled={pending > 0} onClick={() => post({ type: 'submitReview' })}>
          {pending ? `Decide ${pending} more` : accepted ? 'Apply accepted' : 'Send rejection'}
        </button>
      </div>
    </div>
  );
}

export function ReviewView() {
  const proposals = useAxiom((s) => s.proposals);
  const nav = useNav();
  const all = useMemo(() => Object.values(proposals).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [proposals]);
  const staged = all.filter((p) => p.status === 'staged');
  const history = all.filter((p) => p.status !== 'staged');
  return (
    <div className="view review">
      <ViewHead title="Review" lede="Nothing is written until you accept it. Decide each hunk, or a whole file, then apply." />
      <div className="review-scroll">
        {staged.length ? (
          <Section title="Waiting for you" count={staged.length}>
            {staged.map((p) => (
              <FileReview key={p.id} p={p} />
            ))}
          </Section>
        ) : (
          <Empty title={history.length ? 'Nothing is waiting for review.' : 'No changes proposed yet.'} action={history.length ? undefined : <button className="btn primary" onClick={() => nav.go('workspace')}>Describe a task</button>}>
            When the agent proposes an edit, its diff appears here and in the editor. The agent pauses until you decide.
          </Empty>
        )}
        {history.length ? (
          <Section title="Decided" count={history.length}>
            {history.map((p) => (
              <FileReview key={p.id} p={p} />
            ))}
          </Section>
        ) : null}
      </div>
      {staged.length ? <DecisionBar staged={staged} /> : null}
    </div>
  );
}
