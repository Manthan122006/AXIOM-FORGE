import { memo, useMemo } from 'react';
import type { VerificationResult } from '../../../src/shared/contracts';
import { formatMs, parseTestCounts, unverifiedChanges } from '../derive';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Dot, Empty, Figure, Section, ViewHead, type Tone } from '../ui/primitives';

const STATUS: Record<VerificationResult['status'], { label: string; tone: Tone }> = {
  not_run: { label: 'not run', tone: 'idle' },
  running: { label: 'running', tone: 'run' },
  passed: { label: 'passed', tone: 'ok' },
  failed: { label: 'failed', tone: 'bad' },
  skipped: { label: 'skipped', tone: 'idle' },
  error: { label: 'error', tone: 'bad' },
  timed_out: { label: 'timed out', tone: 'bad' },
};

const Result = memo(function Result({ r }: { r: VerificationResult }) {
  const st = STATUS[r.status];
  const counts = parseTestCounts(r.outputTail);
  return (
    <details className={`proof s-${r.status}${r.stale ? ' stale' : ''}`} open={r.status !== 'passed'}>
      <summary>
        <Dot tone={r.stale && r.status === 'passed' ? 'wait' : st.tone} live={r.status === 'running'} />
        <span className="proof-cmd code">$ {r.command}</span>
        <span className={`chip t-${r.stale && r.status === 'passed' ? 'wait' : st.tone}`}>{r.stale && r.status === 'passed' ? 'passed, now stale' : st.label}</span>
      </summary>
      <dl className="kv">
        <dt>Exit code</dt>
        <dd className="num">{r.exitCode ?? 'none'}</dd>
        <dt>Duration</dt>
        <dd className="num">{formatMs(r.durationMs) || '–'}</dd>
        <dt>Tests</dt>
        <dd className="num">{counts ? `${counts.passed} passed, ${counts.failed} failed${counts.skipped ? `, ${counts.skipped} skipped` : ''}${counts.errors ? `, ${counts.errors} errors` : ''}` : 'no test summary in the output'}</dd>
        <dt>Ran at</dt>
        <dd className="num">{new Date(r.startedAt).toLocaleTimeString()}</dd>
        {r.filesAtRun.length ? (
          <>
            <dt>Changed files then</dt>
            <dd className="code">{r.filesAtRun.join(', ')}</dd>
          </>
        ) : null}
      </dl>
      {r.stale ? <p className="file-note c-wait">A file changed after this ran, so it no longer proves the current code.</p> : null}
      {r.outputTail ? <pre className="proof-out">{r.outputTail}</pre> : null}
    </details>
  );
});

export function ProofView() {
  const verification = useAxiom((s) => s.verification);
  const proposals = useAxiom((s) => s.proposals);
  const nav = useNav();
  const list = useMemo(() => Object.values(verification).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [verification]);
  const unverified = useMemo(() => unverifiedChanges(Object.values(proposals), list), [proposals, list]);
  const latest = list[0];
  const latestCounts = latest ? parseTestCounts(latest.outputTail) : null;
  const passed = list.filter((r) => r.status === 'passed' && !r.stale).length;
  const failed = list.filter((r) => STATUS[r.status].tone === 'bad').length;
  return (
    <div className="view">
      <ViewHead title="Proof" lede="Only commands that actually ran, with their exit codes and output. A change counts as verified only after a passing check that ran after it." />
      <div className="figures">
        <Figure value={latestCounts ? latestCounts.passed : '–'} label={latestCounts ? 'tests passed in the latest check' : 'tests passed (no summary yet)'} tone={latestCounts?.passed ? 'ok' : undefined} />
        <Figure value={latestCounts ? latestCounts.failed : '–'} label="tests failed" tone={latestCounts?.failed ? 'bad' : undefined} />
        <Figure value={passed} label={`passing check${passed === 1 ? '' : 's'}`} tone={passed ? 'ok' : undefined} />
        <Figure value={failed} label="failed checks" tone={failed ? 'bad' : undefined} />
      </div>
      {unverified.length ? (
        <Section title="Applied but not verified" count={unverified.length}>
          <ul className="list">
            {unverified.map((p) => (
              <li key={p.id}>
                <button className="list-row" onClick={() => post({ type: 'openFile', path: p.path })}>
                  <Dot tone="wait" />
                  <span className="list-main code">{p.path}</span>
                  <span className="list-meta">no passing check since</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">Ask the agent to run the tests, for example "run the tests for the files you changed". It will ask before running anything.</p>
        </Section>
      ) : null}
      <Section title="Checks" count={list.length || undefined}>
        {list.length ? (
          list.map((r) => <Result key={r.id} r={r} />)
        ) : (
          <Empty title="No commands have run yet." action={<button className="btn" onClick={() => nav.go('workspace')}>Go to task</button>}>
            When the agent wants to run a check, you approve the exact command. Its real output lands here.
          </Empty>
        )}
      </Section>
    </div>
  );
}
