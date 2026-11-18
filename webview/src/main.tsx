import { Activity, StrictMode, useCallback, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Header } from './components/Header';
import { Rail } from './components/Rail';
import { handleHostMessage, insideVsCode, post } from './store';
import { NavContext, type Nav, type ViewId } from './ui/nav';
import { ViewBoundary } from './ui/primitives';
import { ActivityView } from './views/ActivityView';
import { ContextView } from './views/ContextView';
import { ModelsView } from './views/ModelsView';
import { Overview } from './views/Overview';
import { ProofView } from './views/ProofView';
import { ReviewView } from './views/ReviewView';
import { Workspace } from './views/Workspace';
import './styles.css';

const NAMES: Record<ViewId, string> = { overview: 'Overview', workspace: 'Task', context: 'Context', activity: 'Activity', review: 'Review', models: 'Models', proof: 'Proof' };

/** A view stays mounted (state, scroll, the half-typed task) but is hidden and deprioritised when not shown. */
function Pane({ id, view, children }: { id: ViewId; view: ViewId; children: ReactNode }) {
  return (
    <Activity mode={id === view ? 'visible' : 'hidden'}>
      <div className="pane" data-view={id}>
        <ViewBoundary name={NAMES[id]}>{children}</ViewBoundary>
      </div>
    </Activity>
  );
}

function App() {
  // The sidebar opens on the task; the full-size tab opens on the overview.
  const [view, setView] = useState<ViewId>(() => (document.body.dataset.surface === 'panel' ? 'overview' : 'workspace'));
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  const go = useCallback<Nav['go']>((v, opts) => {
    setView(v);
    if (opts?.receiptId !== undefined) setReceiptId(opts.receiptId);
  }, []);
  const draft = useCallback((text: string) => {
    setSeed((s) => ({ text, n: (s?.n ?? 0) + 1 }));
    setView('workspace');
  }, []);
  const nav = useMemo<Nav>(() => ({ view, go, receiptId, draft }), [view, go, receiptId, draft]);
  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        {!insideVsCode ? <div className="preview-banner">Browser preview with simulated events. Not a real TrueForge run.</div> : null}
        <Header />
        <div className="body">
          <Rail />
          <main className="main" aria-label={NAMES[view]}>
            <Pane id="overview" view={view}>
              <Overview />
            </Pane>
            <Pane id="workspace" view={view}>
              <Workspace seed={seed} />
            </Pane>
            <Pane id="context" view={view}>
              <ContextView />
            </Pane>
            <Pane id="activity" view={view}>
              <ActivityView />
            </Pane>
            <Pane id="review" view={view}>
              <ReviewView />
            </Pane>
            <Pane id="models" view={view}>
              <ModelsView />
            </Pane>
            <Pane id="proof" view={view}>
              <ProofView />
            </Pane>
          </main>
        </div>
      </div>
    </NavContext.Provider>
  );
}

window.addEventListener('message', (e) => handleHostMessage(e.data));
if (insideVsCode) {
  document.documentElement.classList.add('in-vscode');
  post({ type: 'ready' });
} else {
  // Development preview only: replays a simulated run. Loaded lazily so it's a separate chunk.
  void import('./dev/preview').then((m) => m.startPreview());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
