import { memo, useMemo } from 'react';
import { runsOf, shortModel, unverifiedChanges } from '../derive';
import { Trace } from '../components/Trace';
import { post, useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Dot, Empty, Figure, Kbd, Section, type Tone } from '../ui/primitives';

const EXAMPLES = [
  'Explain how configuration is loaded, with the files involved',
  'Add a command-line option and cover it with a test',
  'Find where errors are logged and make the message include the request path',
];

function HealthRow({ tone, title, detail, action }: { tone: Tone; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <li className="health-row">
      <Dot tone={tone} />
      <div className="health-text">
        <span className="health-title">{title}</span>
        <span className="health-detail">{detail}</span>
      </div>
      {action}
    </li>
  );
}

const Health = memo(function Health() {
  const conn = useAxiom((s) => s.connection);
  const mcp = useAxiom((s) => s.mcp);
  const models = useAxiom((s) => s.models);
  const nav = useNav();
  const listed = (m: { listed: boolean | null } | null): Tone => (!m ? 'idle' : m.listed ? 'ok' : m.listed === false ? 'bad' : 'idle');
  return (
    <Section title="Health">
      <ul className="health">
        <HealthRow
          tone={conn.kind === 'connected' ? 'ok' : conn.kind === 'connecting' ? 'wait' : 'bad'}
          title="TrueForge"
          detail={conn.kind === 'connected' ? `Connected at ${conn.baseUrl}` : conn.kind === 'connecting' ? 'Connecting…' : conn.reason}
          action={conn.kind === 'disconnected' ? <button className="btn" onClick={() => post({ type: 'command', id: 'reconnect' })}>Reconnect</button> : undefined}
        />
        <HealthRow tone={mcp.kind === 'listening' ? 'ok' : mcp.kind === 'error' ? 'bad' : 'idle'} title="Editor tools" detail={mcp.kind === 'listening' ? `7 tools served at ${mcp.url}` : mcp.kind === 'error' ? mcp.message : 'Starting…'} />
        <HealthRow
          tone={listed(models.primary)}
          title="Primary model"
          detail={models.primary ? `${shortModel(models.primary.name)}: ${models.primary.listed ? 'listed in TrueForge' : models.primary.listed === false ? 'not listed in TrueForge' : 'unknown'}` : 'Not set. Choose one under Models.'}
          action={<button className="btn ghost" onClick={() => nav.go('models')}>Models</button>}
        />
        <HealthRow tone={listed(models.backup)} title="Backup model" detail={models.backup ? `${shortModel(models.backup.name)}: ${models.backup.listed ? 'listed in TrueForge' : models.backup.listed === false ? 'not listed in TrueForge' : 'unknown'}` : 'None. A failing primary will stop the run.'} />
      </ul>
    </Section>
  );
});

export function Overview() {
  const ws = useAxiom((s) => s.workspace);
  const timeline = useAxiom((s) => s.timeline);
  const proposals = useAxiom((s) => s.proposals);
  const verification = useAxiom((s) => s.verification);
  const running = useAxiom((s) => s.session.status === 'running' || s.session.status === 'paused');
  const nav = useNav();
  const runs = useMemo(() => runsOf(timeline), [timeline]);
  const props = useMemo(() => Object.values(proposals).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [proposals]);
  const checks = useMemo(() => Object.values(verification).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [verification]);
  const applied = props.filter((p) => p.status === 'applied').length;
  const passed = checks.filter((c) => c.status === 'passed').length;
  const unverified = useMemo(() => unverifiedChanges(props, checks).length, [props, checks]);
  const current = runs[runs.length - 1];
  const fresh = runs.length === 0;

  return (
    <div className="view overview">
      <header className="ov-hero">
        <p className="ov-kicker">{ws ? 'Workspace' : 'Indexing workspace…'}</p>
        <h1 className="ov-name">{ws?.name ?? '…'}</h1>
        <p className="ov-motto">Understand the code. Justify every change. Verify before delivery.</p>
        <div className="figures">
          <Figure value={ws ? ws.files.toLocaleString() : '–'} label="files indexed" />
          <Figure value={ws ? ws.symbols.toLocaleString() : '–'} label="symbols" />
          <Figure value={applied} label="changes applied" tone={applied ? 'ok' : undefined} />
          <Figure value={unverified} label="not yet verified" tone={unverified ? 'wait' : undefined} />
        </div>
      </header>

      {fresh ? (
        <Section title="Start here">
          <ol className="steps">
            <li>
              <span className="step-n num">1</span>
              <div>
                <strong>Describe a change</strong> in plain words. You don't need to name files: AXIOM Forge finds them and shows why.
              </div>
            </li>
            <li>
              <span className="step-n num">2</span>
              <div>
                <strong>Review every hunk</strong> before anything is written. Accept, reject, or undo later.
              </div>
            </li>
            <li>
              <span className="step-n num">3</span>
              <div>
                <strong>Check the proof</strong>: commands the agent ran, with exit codes and test counts.
              </div>
            </li>
          </ol>
          <div className="quick">
            <button className="btn primary" onClick={() => nav.go('workspace')}>
              Describe a task
            </button>
            <button className="btn" onClick={() => post({ type: 'command', id: 'inlineEdit' })} title="Select code in the editor first">
              Edit selection <Kbd>⌘I</Kbd>
            </button>
          </div>
          <p className="muted small">Try one of these:</p>
          <ul className="examples">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <button className="example" onClick={() => nav.draft(e)}>
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {running && current ? (
        <Section title="Running now" aside={<button className="btn ghost" onClick={() => nav.go('workspace')}>Open task</button>}>
          <p className="run-request">{current.request}</p>
          <Trace />
        </Section>
      ) : null}

      <Health />

      {fresh && !props.length && !checks.length ? null : (
      <div className="ov-grid">
        <Section title="Recent runs" count={runs.length || undefined}>
          {runs.length ? (
            <ul className="list">
              {[...runs].reverse().slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button className="list-row" onClick={() => nav.go('activity')}>
                    <Dot tone={!r.end ? 'run' : r.end.status === 'done' ? 'ok' : 'bad'} live={!r.end} />
                    <span className="list-main">{r.request}</span>
                    <span className="list-meta">{!r.end ? 'running' : r.end.status === 'done' ? 'finished' : r.end.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No runs in this window yet." />
          )}
        </Section>
        <Section title="Recent changes" count={props.length || undefined}>
          {props.length ? (
            <ul className="list">
              {props.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <button className="list-row" onClick={() => nav.go('review')}>
                    <Dot tone={p.status === 'applied' ? 'ok' : p.status === 'staged' ? 'wait' : p.status === 'conflict' || p.status === 'failed' ? 'bad' : 'idle'} />
                    <span className="list-main code">{p.path}</span>
                    <span className="list-meta">{p.status === 'staged' ? 'waiting for you' : p.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nothing proposed yet." />
          )}
        </Section>
        <Section title="Checks" count={checks.length || undefined}>
          {checks.length ? (
            <ul className="list">
              {checks.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <button className="list-row" onClick={() => nav.go('proof')}>
                    <Dot tone={c.status === 'passed' ? (c.stale ? 'wait' : 'ok') : c.status === 'running' ? 'run' : 'bad'} live={c.status === 'running'} />
                    <span className="list-main code">{c.command}</span>
                    <span className="list-meta num">{c.exitCode !== null ? `exit ${c.exitCode}` : c.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={passed ? 'No checks in this window.' : 'No commands have run yet.'}>The agent asks before running a check; results land in Proof.</Empty>
          )}
        </Section>
      </div>
      )}

      <Section title="Tools">
        <div className="quick">
          <button className="btn" onClick={() => post({ type: 'command', id: 'setupTrueForge' })}>
            Register agent in TrueForge
          </button>
          <button className="btn" onClick={() => post({ type: 'command', id: 'perfReport' })}>
            Performance report
          </button>
        </div>
      </Section>
    </div>
  );
}
