import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { onMentionResults, post, useAxiom } from '../store';

type Mention = { kind: 'file' | 'symbol'; value: string };
type Suggestion = { kind: 'file' | 'symbol'; label: string; detail: string };

/**
 * Composer. Input text is local state (typing never touches the global store — rerender-defer-reads).
 * "@" opens file/symbol suggestions from the host's context engine.
 */
export function Composer({ seed }: { seed?: { text: string; n: number } | null }) {
  const running = useAxiom((s) => s.session.status === 'running' || s.session.status === 'paused');
  const connected = useAxiom((s) => s.connection.kind === 'connected');
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  // A picked example or quick action prefills the box (the user still decides to run it).
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(seed.text.length, seed.text.length);
    });
  }, [seed]);

  useEffect(() => {
    onMentionResults((r) => {
      setItems(r);
      setActive(0);
    });
    return () => onMentionResults(null);
  }, []);

  const updateQuery = (value: string, caret: number) => {
    const m = /(^|\s)@([\w./-]*)$/.exec(value.slice(0, caret));
    if (m) {
      setQuery(m[2]!);
      post({ type: 'mentionQuery', query: m[2]! });
    } else setQuery(null);
  };

  const pick = (s: Suggestion) => {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(/@[\w./-]*$/, '');
    const next = `${before}@${s.label} ${text.slice(caret)}`;
    setText(next);
    setMentions((m) => (m.some((x) => x.value === s.label) ? m : [...m, { kind: s.kind, value: s.label }]));
    setQuery(null);
    requestAnimationFrame(() => el.focus());
  };

  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    post({ type: 'send', text: t, mentions: mentions.filter((m) => t.includes(`@${m.value}`)) });
    setText('');
    setMentions([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(items[active]!);
        return;
      }
      if (e.key === 'Escape') {
        setQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      {query !== null && items.length > 0 && (
        <ul className="mentions" role="listbox" aria-label="Mention a file or symbol">
          {items.map((s, i) => (
            <li key={`${s.kind}:${s.label}`} role="option" aria-selected={i === active} onMouseDown={(e) => (e.preventDefault(), pick(s))}>
              <span className="code">{s.label}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                {s.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="composer-box">
        <div>
          {mentions.length > 0 && (
            <div className="chips">
              {mentions.map((m) => (
                <span className="chip" key={m.value}>
                  @{m.value}
                  <button aria-label={`Remove ${m.value}`} onClick={() => setMentions((x) => x.filter((y) => y.value !== m.value))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            rows={2}
            value={text}
            aria-label="Ask AXIOM Forge"
            placeholder={connected ? 'Describe the change you want. Type @ to point at a file or symbol.' : 'Waiting for TrueForge to connect…'}
            onChange={(e) => {
              setText(e.target.value);
              updateQuery(e.target.value, e.target.selectionStart);
            }}
            onKeyDown={onKey}
          />
        </div>
        <div className="composer-actions">
          {running ? (
            <button className="btn danger" onClick={() => post({ type: 'cancel' })}>
              Stop run
            </button>
          ) : (
            <button className="btn primary" disabled={!text.trim() || !connected} onClick={send}>
              Run
            </button>
          )}
        </div>
      </div>
      <div className="hint">
        <span>{running ? 'The agent is working. Stop discards anything not yet applied.' : 'Enter runs the task. Shift+Enter adds a line.'}</span>
        <span>Every edit waits for your approval</span>
      </div>
    </div>
  );
}
