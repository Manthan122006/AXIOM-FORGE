import { useMemo } from 'react';
import type { ConfiguredModel, ModelRecoveryState } from '../../../src/shared/contracts';
import { recoveryHistory, shortModel } from '../derive';
import { useAxiom } from '../store';
import { Dot, Empty, Section, ViewHead, type Tone } from '../ui/primitives';

function describe(s: ModelRecoveryState): { tone: Tone; title: string; body: string } {
  switch (s.kind) {
    case 'healthy':
      return s.model ? { tone: 'ok', title: `Running on ${shortModel(s.model)}`, body: 'No failures in this run.' } : { tone: 'idle', title: 'No run yet', body: 'Routing starts when you run a task.' };
    case 'failed':
      return { tone: 'bad', title: `${shortModel(s.model)} failed (${s.failure.replace('_', ' ')})`, body: s.message };
    case 'retrying':
      return { tone: 'wait', title: `Retrying ${shortModel(s.model)}, attempt ${s.attempt} of ${s.maxAttempts}`, body: `Waiting ${(s.delayMs / 1000).toFixed(1)} s first. Transient failures (rate limits, timeouts, server errors) are retried; a bad key is not.` };
    case 'switching':
      return { tone: 'wait', title: `Running on backup ${shortModel(s.to)}`, body: `${shortModel(s.from)} failed${s.failure ? ` (${s.failure.replace('_', ' ')})` : ''}, so a fresh TrueForge session started on the backup with the same request. Nothing unapproved was written.` };
    case 'recovered':
      return { tone: 'ok', title: `Backup ${shortModel(s.model)} completed the request`, body: 'The primary failed and the backup took over automatically.' };
    case 'exhausted':
      return { tone: 'bad', title: 'No model could complete the request', body: `${s.message} Tried ${s.tried.map(shortModel).join(' and ')}. Your files are unchanged.` };
  }
}

function Node({ role, m, active, failed }: { role: string; m: ConfiguredModel | null; active: boolean; failed: boolean }) {
  const tone: Tone = failed ? 'bad' : active ? 'run' : !m ? 'idle' : m.listed ? 'ok' : m.listed === false ? 'bad' : 'idle';
  return (
    <div className={`route-node${active ? ' on' : ''}${failed ? ' failed' : ''}`}>
      <span className="route-role">{role}</span>
      <span className="route-model code">{m ? shortModel(m.name) : 'not set'}</span>
      <span className="route-status">
        <Dot tone={tone} live={active && !failed} />
        {failed ? 'failed in this run' : active ? 'serving this run' : !m ? `set axiomForge.models.${role.toLowerCase()}` : m.listed ? 'listed in TrueForge' : m.listed === false ? 'not listed in TrueForge' : 'TrueForge unreachable'}
      </span>
      {m ? <span className="route-fqn code">{m.name}</span> : null}
    </div>
  );
}

export function ModelsView() {
  const models = useAxiom((s) => s.models);
  const recovery = useAxiom((s) => s.recovery);
  const slot = useAxiom((s) => s.session.modelSlot);
  const status = useAxiom((s) => s.session.status);
  const timeline = useAxiom((s) => s.timeline);
  const history = useMemo(() => recoveryHistory(timeline), [timeline]);
  const d = describe(recovery);
  const live = status === 'running' || status === 'paused';
  // Routing facts from state only: the backup path lights up only if a switch really happened.
  const switched = recovery.kind === 'switching' || recovery.kind === 'recovered' || slot === 'backup';
  const primaryFailed = switched || (recovery.kind === 'exhausted' && !!models.primary) || (recovery.kind === 'failed' && recovery.model === models.primary?.name);
  const backupFailed = recovery.kind === 'exhausted' && recovery.tried.length > 1;
  return (
    <div className="view models">
      <ViewHead title="Models" lede="TrueForge calls the models; AXIOM Forge decides which one. If the primary fails, the same request moves to the backup on a fresh session." />
      <div className={`route${switched ? ' switched' : ''}${live ? ' live' : ''}`} role="group" aria-label="Model routing">
        <div className="route-src">
          <span className="route-role">Request</span>
          <span className="route-model">{live ? 'this run' : 'next run'}</span>
        </div>
        <svg className="route-lines" viewBox="0 0 60 120" preserveAspectRatio="none" aria-hidden="true">
          <path pathLength={100} className={`rl rl-p${!switched && live ? ' on' : ''}${primaryFailed ? ' cut' : ''}`} d="M0,60 C30,60 30,24 60,24" />
          <path pathLength={100} className={`rl rl-b${switched ? ' on' : ''}`} d="M0,60 C30,60 30,96 60,96" />
        </svg>
        <div className="route-dst">
          <Node role="Primary" m={models.primary} active={live && !switched} failed={primaryFailed} />
          <Node role="Backup" m={models.backup} active={switched && !backupFailed} failed={backupFailed} />
        </div>
      </div>
      <div className={`banner t-${d.tone}`} role={d.tone === 'bad' ? 'alert' : 'status'}>
        <strong>{d.title}</strong>
        <span>{d.body}</span>
      </div>
      <Section title="How failures are handled">
        <ul className="rules">
          <li>
            <strong>Bad key or unknown model</strong>: no retry, switch to the backup at once.
          </li>
          <li>
            <strong>Rate limit, timeout, server error</strong>: retry the same model up to twice, waiting as long as the provider asks (up to 30 s), then switch.
          </li>
          <li>
            <strong>An approved change was already written</strong>: never replayed automatically. You decide.
          </li>
          <li>
            <strong>TrueForge itself is down</strong>: not a model problem, so no switch.
          </li>
        </ul>
      </Section>
      <Section title="Routing history" count={history.length || undefined}>
        {history.length ? (
          <ol className="act-list">
            {history.map((h) => {
              const x = describe(h.state);
              return (
                <li key={h.id} className="act-row">
                  <span className="act-time num">{new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <Dot tone={x.tone} />
                  <div className="act-main">
                    <span className="act-title">{x.title}</span>
                    {h.state.kind === 'failed' || h.state.kind === 'exhausted' ? <span className="act-detail code">{x.body}</span> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty title="No failures or switches in this window." />
        )}
      </Section>
    </div>
  );
}
