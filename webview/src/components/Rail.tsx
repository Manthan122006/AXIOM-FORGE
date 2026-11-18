import { memo, type KeyboardEvent } from 'react';
import { isRunning, pendingReviewCount, proofAlert, shieldAlert } from '../derive';
import { insideVsCode, post, useAxiom } from '../store';
import { ExpandGlyph } from '../ui/icons';
import { useNav, VIEWS, type ViewId } from '../ui/nav';

/** Signals per destination, all derived from real state (components re-render only when these change). */
function useSignal(id: ViewId): { badge?: number; tone?: 'run' | 'wait' | 'bad' } {
  const pending = useAxiom(pendingReviewCount);
  const running = useAxiom(isRunning);
  const shield = useAxiom(shieldAlert);
  const shieldBad = useAxiom((s) => s.recovery.kind === 'exhausted' || s.recovery.kind === 'failed');
  const proofBad = useAxiom(proofAlert);
  const offline = useAxiom((s) => s.connection.kind === 'disconnected');
  switch (id) {
    case 'overview':
      return offline ? { tone: 'bad' } : {};
    case 'workspace':
      return running ? { tone: 'run' } : {};
    case 'review':
      return pending ? { badge: pending, tone: 'wait' } : {};
    case 'models':
      return shield ? { tone: shieldBad ? 'bad' : 'wait' } : {};
    case 'proof':
      return proofBad ? { tone: 'bad' } : {};
    default:
      return {};
  }
}

const RailItem = memo(function RailItem({ id, label, hint, Glyph, active, onGo }: { id: ViewId; label: string; hint: string; Glyph: () => React.ReactNode; active: boolean; onGo: (v: ViewId) => void }) {
  const sig = useSignal(id);
  return (
    <li>
      <button className={`rail-btn${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined} tabIndex={active ? 0 : -1} data-view={id} title={`${label}: ${hint}`} onClick={() => onGo(id)}>
        <span className="rail-glyph">
          <Glyph />
          {sig.badge ? <span className={`rail-badge t-${sig.tone}`}>{sig.badge}</span> : sig.tone ? <span className={`rail-pip t-${sig.tone}`} /> : null}
        </span>
        <span className="rail-label">{label}</span>
        {sig.badge ? <span className="sr-only">, {sig.badge} waiting</span> : null}
      </button>
    </li>
  );
});

/** Primary navigation. Icon rail in the sidebar; icons with labels when there is room. */
export function Rail() {
  const nav = useNav();
  const idx = VIEWS.findIndex((v) => v.id === nav.view);
  const isPanel = typeof document !== 'undefined' && document.body.dataset.surface === 'panel';
  // One tab stop for the whole rail; arrows/Home/End move between areas (roving tabindex).
  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.rail-btn')];
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
    const step = keys[e.key]!;
    const next = step === -Infinity ? 0 : step === Infinity ? btns.length - 1 : (Math.max(cur, 0) + step + btns.length) % btns.length;
    btns.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
    btns[next]?.focus();
  };
  return (
    <nav className="rail" aria-label="AXIOM Forge">
      <div className="rail-list" style={{ ['--ax-rail-i' as string]: idx }}>
        <span className="rail-ind" aria-hidden="true" />
        <ul onKeyDown={onKey}>
          {VIEWS.map((v) => (
            <RailItem key={v.id} id={v.id} label={v.label} hint={v.hint} Glyph={v.glyph} active={v.id === nav.view} onGo={nav.go} />
          ))}
        </ul>
      </div>
      {insideVsCode && !isPanel ? (
        <button className="rail-btn rail-foot" title="Open AXIOM Forge as a full-size tab" onClick={() => post({ type: 'command', id: 'openWorkspace' })}>
          <span className="rail-glyph">
            <ExpandGlyph />
          </span>
          <span className="rail-label">Open full size</span>
        </button>
      ) : null}
    </nav>
  );
}
