import { memo } from 'react';
import type { ModelRecoveryState } from '../../../src/shared/contracts';
import { useAxiom } from '../store';

function describe(r: ModelRecoveryState): { cls: string; title: string; body: string } | null {
  switch (r.kind) {
    case 'healthy':
      return null;
    case 'failed':
      return { cls: 'bad', title: `${r.model.split('/').pop()} failed (${r.failure.replace('_', ' ')})`, body: r.message };
    case 'retrying':
      return { cls: 'wait', title: `Retrying ${r.model.split('/').pop()} (${r.attempt}/${r.maxAttempts})`, body: `Waiting ${(r.delayMs / 1000).toFixed(1)} s before the next attempt.` };
    case 'switching':
      return { cls: 'wait', title: `Running on backup model ${r.to.split('/').pop()}`, body: `${r.from.split('/').pop()} failed${r.failure ? ` (${r.failure.replace('_', ' ')})` : ''}, so AXIOM Forge started a fresh TrueForge session on the backup with the same request. Nothing unapproved was written.` };
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
