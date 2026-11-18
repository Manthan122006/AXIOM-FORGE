import { memo, useMemo } from 'react';
import { runsOf, stationsOf, type Run, type Station } from '../derive';
import { useAxiom } from '../store';

const TONE: Record<Station['state'], string> = { idle: 'idle', active: 'run', done: 'ok', waiting: 'wait', failed: 'bad' };

/**
 * The Trace: AXIOM Forge's run at a glance. Six stations (context → verified), each lit only by an
 * event that actually happened in the latest run. Segments fill as the run reaches the next station.
 */
export const Trace = memo(function Trace({ compact = false, run }: { compact?: boolean; run?: Run }) {
  const timeline = useAxiom((s) => s.timeline);
  const proposals = useAxiom((s) => s.proposals);
  const verification = useAxiom((s) => s.verification);
  const stations = useMemo(() => {
    const runs = runsOf(timeline);
    const r = run ?? runs[runs.length - 1];
    return r ? stationsOf(r, Object.values(proposals), Object.values(verification)) : null;
  }, [timeline, proposals, verification, run]);
  if (!stations) return null;
  const focus = stations.find((s) => s.state === 'waiting' || s.state === 'failed') ?? [...stations].reverse().find((s) => s.state === 'active') ?? [...stations].reverse().find((s) => s.state === 'done');
  return (
    <div className={`trace${compact ? ' compact' : ''}`} role="group" aria-label="Run progress">
      <ol className="trace-line">
        {stations.map((s, i) => {
          const reached = s.state !== 'idle';
          return (
            <li key={s.id} className={`station s-${TONE[s.state]}`} aria-current={s === focus ? 'step' : undefined} title={`${s.label}: ${s.detail}`}>
              {i > 0 ? <span className={`seg${reached ? ' filled' : ''}`} aria-hidden="true" /> : null}
              <span className={`stop${s.state === 'active' ? ' live' : ''}`} aria-hidden="true" />
              <span className="station-l">{s.label}</span>
              <span className="sr-only">
                {s.label}: {s.detail}
              </span>
            </li>
          );
        })}
      </ol>
      {focus && !compact ? (
        <p className={`trace-focus c-${TONE[focus.state]}`} aria-live="polite">
          {focus.label}: {focus.detail}
        </p>
      ) : null}
    </div>
  );
});
