import { memo } from 'react';
import type { ModelRecoveryState, VerificationResult } from '../../../src/shared/contracts';
import { useAxiom } from '../store';

const STATUS: Record<VerificationResult['status'], [string, string]> = {
  not_run: ['not run', 'muted'],
  running: ['running', 'state-run'],
  passed: ['passed', 'state-ok'],
  failed: ['failed', 'state-bad'],
  skipped: ['skipped', 'muted'],
  error: ['error', 'state-bad'],
  timed_out: ['timed out', 'state-bad'],
};

/** Proof of Change: only results of commands that actually ran, with exit codes. */
export const Proof = memo(function Proof() {
  const results = useAxiom((s) => s.verification);
  const list = Object.values(results).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!list.length) return null;
  return (
    <section className="dock" aria-label="Proof">
      <div className="dock-scroll">
        <h3>Proof</h3>
        {list.map((r) => {
          const [label, cls] = STATUS[r.status];
          return (
            <details key={r.id} className="proof-row" open={r.status !== 'passed'}>
              <summary style={{ display: 'contents' }}>
                <span className={cls}>{label}</span>
                <span className="code" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.command}>
                  {r.command}
                </span>
                <span className="muted num" style={{ fontSize: 11 }}>
                  {r.exitCode !== null ? `exit ${r.exitCode}` : ''}
                  {r.durationMs !== null ? ` · ${(r.durationMs / 1000).toFixed(1)} s` : ''}
                  {r.stale ? ' · stale' : ''}
                </span>
              </summary>
              {r.outputTail && <div className="proof-out">{r.outputTail}</div>}
            </details>
          );
        })}
      </div>
    </section>
  );
});

function describe(r: ModelRecoveryState): { cls: string; title: string; body: string } | null {
  switch (r.kind) {
    case 'healthy':
      return null;
    case 'failed':
      return { cls: 'bad', title: `${r.model.split('/').pop()} failed (${r.failure.replace('_', ' ')})`, body: r.message };
    case 'retrying':
      return { cls: 'wait', title: `Retrying ${r.model.split('/').pop()} (${r.attempt}/${r.maxAttempts})`, body: `Waiting ${(r.delayMs / 1000).toFixed(1)} s before the next attempt.` };
    case 'switching':
      return { cls: 'wait', title: `Running on backup model ${r.to.split('/').pop()}`, body: `${r.from.split('/').pop()} failed, so AXIOM Forge started a fresh TrueForge session on the backup with the same request. Nothing unapproved was written.` };
    case 'recovered':
      return { cls: 'ok', title: `Backup model ${r.model.split('/').pop()} completed the request`, body: 'The primary model failed; the backup took over automatically.' };
    case 'exhausted':
      return { cls: 'bad', title: 'No model could complete the request', body: `${r.message} Tried: ${r.tried.join(', ')}. Your files are unchanged.` };
  }
}

export const RecoveryBanner = memo(function RecoveryBanner() {
  const recovery = useAxiom((s) => s.recovery);
  const conn = useAxiom((s) => s.connection);
  if (conn.kind === 'disconnected') {
    return (
      <div className="banner bad" role="alert">
        <strong>TrueForge isn't reachable</strong>
        <span>{conn.reason}</span>
        <span className="muted">
          Start it with <span className="code">OUTBOUND_URL_ALLOWED_HOSTS='["127.0.0.1"]' npx @truefoundry/trueforge@0.185.1</span>, then run "AXIOM Forge: Reconnect".
        </span>
      </div>
    );
  }
  const d = describe(recovery);
  if (!d) return null;
  return (
    <div className={`banner ${d.cls}`} role={d.cls === 'bad' ? 'alert' : 'status'}>
      <strong>{d.title}</strong>
      <span className="muted">{d.body}</span>
    </div>
  );
});
