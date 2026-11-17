import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Composer } from './components/Composer';
import { Header } from './components/Header';
import { Proof, RecoveryBanner } from './components/Proof';
import { Review } from './components/Review';
import { Timeline } from './components/Timeline';
import { handleHostMessage, insideVsCode, post, useAxiom } from './store';
import './styles.css';

function Empty() {
  return (
    <div className="empty">
      <h2>Change code you can review</h2>
      <p>AXIOM Forge finds the right files, shows why it chose them, and writes nothing until you accept each hunk.</p>
      <ul>
        <li>
          Select code and press <kbd>⌘I</kbd> to edit it in place
        </li>
        <li>Or describe a change below. You don't need to name the files</li>
        <li>
          Type <kbd>@</kbd> to point at a file or symbol
        </li>
      </ul>
    </div>
  );
}

function Activity() {
  const empty = useAxiom((s) => s.timeline.length === 0);
  const len = useAxiom((s) => s.timeline.length);
  const ref = useRef<HTMLDivElement>(null);
  // Keep the newest step in view while the run streams, unless the user scrolled up.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [len]);
  return (
    <div className="scroll" ref={ref}>
      <RecoveryBanner />
      {empty ? <Empty /> : <Timeline />}
    </div>
  );
}

function App() {
  return (
    <div className="app">
      <div>
        {!insideVsCode && <div className="preview-banner">Browser preview with simulated events. Not a real TrueForge run.</div>}
        <Header />
      </div>
      <Activity />
      <div>
        <Review />
        <Proof />
        <Composer />
      </div>
    </div>
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
