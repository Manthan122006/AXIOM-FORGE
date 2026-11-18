import { Component, memo, type ReactNode } from 'react';

export type Tone = 'idle' | 'act' | 'run' | 'ok' | 'wait' | 'bad';

/** Status dot. `live` adds the slow breathing ring used ONLY for things that are actually in progress. */
export const Dot = memo(function Dot({ tone, live = false, label }: { tone: Tone; live?: boolean; label?: string }) {
  return (
    <span className={`dot t-${tone}${live ? ' live' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
});

/** A labelled quantity. Numbers are tabular; the label sits below in the muted tone. */
export function Figure({ value, label, tone }: { value: ReactNode; label: string; tone?: Tone }) {
  return (
    <div className="figure">
      <span className={`figure-v num${tone ? ` c-${tone}` : ''}`}>{value}</span>
      <span className="figure-l">{label}</span>
    </div>
  );
}

/** Linear meter with a real value; never decorative. */
export function Meter({ value, max, label, tone = 'act' }: { value: number; max: number; label: string; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i className={`b-${tone}`} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

/** Page heading for a view: title, one plain sentence, optional right-side actions. */
export function ViewHead({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="vhead">
      <div>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {actions ? <div className="vhead-actions">{actions}</div> : null}
    </header>
  );
}

/** A section inside a view: a heading with an optional count, separated by a seam, not a card. */
export function Section({ title, count, children, aside }: { title: string; count?: number | string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <h2>
          {title}
          {count !== undefined ? <span className="sec-count num">{count}</span> : null}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Empty states give direction: what this is, and the one thing to do next. */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children ? <div className="empty-body">{children}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

/** Placeholder rows while something real is being computed (e.g. context assembling). */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  );
}

/** Keeps one broken view from blanking the whole app; shows the real error. */
export class ViewBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="banner bad" role="alert">
          <strong>The {this.props.name} view failed to render.</strong>
          <span className="code">{this.state.error.message}</span>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
