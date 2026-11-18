import { memo } from 'react';
import { post, useAxiom } from '../store';

const Mark = () => (
  <svg className="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1.5 14 14H2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M5.2 10h5.6" stroke="var(--ax-act)" strokeWidth="1.5" />
  </svg>
);

/** Status strip. Every dot reflects real host state; nothing here is decorative. */
export const Header = memo(function Header() {
  const conn = useAxiom((s) => s.connection.kind);
  const connReason = useAxiom((s) => (s.connection.kind === 'disconnected' ? s.connection.reason : ''));
  const mcp = useAxiom((s) => s.mcp.kind);
  const model = useAxiom((s) => s.session.model ?? (s.recovery.kind === 'healthy' ? s.recovery.model : ''));
  const slot = useAxiom((s) => s.session.modelSlot);
  const running = useAxiom((s) => s.session.status === 'running' || s.session.status === 'paused');
  const sessionId = useAxiom((s) => s.session.sessionId);
  const configured = useAxiom((s) => s.models);

  const tfDot = conn === 'connected' ? 'ok' : conn === 'connecting' ? 'wait' : 'bad';
  return (
    <header className="status" aria-label="Connection status">
      <span className="brand">
        <Mark />
        AXIOM Forge
      </span>
      <span className="pill" title={connReason || undefined}>
        <span className={`dot ${tfDot}`} aria-hidden="true" />
        TrueForge<span className="sr-only">: {conn}</span>
      </span>
      <span className="pill">
        <span className={`dot ${mcp === 'listening' ? 'ok' : mcp === 'error' ? 'bad' : ''}`} aria-hidden="true" />
        Tools<span className="sr-only">: {mcp}</span>
      </span>
      {model ? (
        <span className="pill code" title={`Model of the current run${slot ? ` (${slot})` : ''}`}>
          <span className={`dot ${running ? 'run' : conn === 'connected' ? 'ok' : ''}`} aria-hidden="true" />
          {`${model.split('/').pop()}${slot === 'backup' ? ' · backup' : ''}`}
        </span>
      ) : (
        <span className="pill code" title={modelTitle(configured)}>
          <span className={`dot ${configured.primary?.listed ? 'ok' : configured.primary?.listed === false ? 'bad' : ''}`} aria-hidden="true" />
          {configured.primary ? configured.primary.name.split('/').pop() : 'no model set'}
          {configured.backup && <span className="muted"> +backup</span>}
        </span>
      )}
      {sessionId && sessionId !== 'preview' && (
        <button className="btn" title={`Open TrueForge session ${sessionId}`} onClick={() => post({ type: 'openSessionInTrueForge' })}>
          Session
        </button>
      )}
    </header>
  );
});

function modelTitle(m: { primary: { name: string; listed: boolean | null } | null; backup: { name: string; listed: boolean | null } | null }): string {
  const line = (label: string, x: { name: string; listed: boolean | null } | null) =>
    x ? `${label}: ${x.name} (${x.listed === null ? 'TrueForge unreachable' : x.listed ? 'listed in TrueForge' : 'NOT listed in TrueForge'})` : `${label}: not set (axiomForge.models.${label.toLowerCase()})`;
  return `${line('Primary', m.primary)}\n${line('Backup', m.backup)}\nListed means TrueForge knows the model; quota is only known when it runs.`;
}
