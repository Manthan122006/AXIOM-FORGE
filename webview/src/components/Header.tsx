import { memo } from 'react';
import { useAxiom } from '../store';

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
      <span className="pill code" title={model ? `Model configured in TrueForge${slot ? ` (${slot})` : ''}` : 'No run yet'}>
        <span className={`dot ${running ? 'run' : model && conn === 'connected' ? 'ok' : ''}`} aria-hidden="true" />
        {model ? `${model.split('/').pop()}${slot === 'backup' ? ' · backup' : ''}` : 'model'}
      </span>
    </header>
  );
});
