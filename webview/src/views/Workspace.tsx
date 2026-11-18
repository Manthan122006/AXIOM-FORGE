import { useEffect, useRef } from 'react';
import { Composer } from '../components/Composer';
import { RecoveryBanner } from '../components/Proof';
import { Timeline } from '../components/Timeline';
import { Trace } from '../components/Trace';
import { pendingReviewCount } from '../derive';
import { useAxiom } from '../store';
import { useNav } from '../ui/nav';
import { Kbd } from '../ui/primitives';

const EXAMPLES = [
  { label: 'Understand', text: 'Explain how configuration is loaded, with the files involved' },
  { label: 'Change', text: 'Add a command-line option and cover it with a test' },
  { label: 'Fix', text: 'Find where errors are logged and make the message include the request path' },
];

function FirstRun() {
  const nav = useNav();
  return (
    <div className="firstrun">
      <h1>What should change?</h1>
      <p className="lede">Describe it in plain words. AXIOM Forge reads the repository, shows which files it chose and why, and proposes edits you approve hunk by hunk. Nothing is written without you.</p>
      <ul className="examples">
        {EXAMPLES.map((e) => (
          <li key={e.text}>
            <button className="example" onClick={() => nav.draft(e.text)}>
              <span className="example-kind">{e.label}</span>
              {e.text}
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small">
        To change one function, select it in the editor and press <Kbd>⌘I</Kbd>. Type <Kbd>@</Kbd> here to point at a file or symbol.
      </p>
    </div>
  );
}

function ReviewPrompt() {
  const pending = useAxiom(pendingReviewCount);
  const nav = useNav();
  if (!pending) return null;
  return (
    <div className="review-prompt" role="status">
      <span className="dot t-wait live" aria-hidden="true" />
      <span>
        {pending} file{pending > 1 ? 's' : ''} waiting for your review. The agent is paused until you decide.
      </span>
      <button className="btn primary" onClick={() => nav.go('review')}>
        Review changes
      </button>
    </div>
  );
}

export function Workspace({ seed }: { seed: { text: string; n: number } | null }) {
  const empty = useAxiom((s) => s.timeline.length === 0);
  const len = useAxiom((s) => s.timeline.length);
  const ref = useRef<HTMLDivElement>(null);
  // Follow the newest step while the run streams, unless the user scrolled up to read.
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTop = el.scrollHeight;
  }, [len]);
  return (
    <div className="view workspace">
      {empty ? null : <Trace />}
      <div className="ws-scroll" ref={ref}>
        <RecoveryBanner />
        {empty ? <FirstRun /> : <Timeline />}
      </div>
      <ReviewPrompt />
      <Composer seed={seed} />
    </div>
  );
}
