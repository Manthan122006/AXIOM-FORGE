import { performance } from 'node:perf_hooks';

/**
 * Lightweight performance instrumentation for the extension host (no vscode dependency).
 *
 * `perf.span(label, fn)` times a SYNCHRONOUS piece of work: while it runs nothing else can, so its
 * duration is exactly how long it blocked the event loop. Recent spans are kept in a ring buffer so
 * the stall detector can name the work that ran during a stall instead of guessing. Per-label
 * counts/total/max feed the "AXIOM Forge: Show Performance Report" command.
 */
export interface SpanRecord {
  label: string;
  start: number; // performance.now()
  ms: number;
}

interface LabelStats {
  count: number;
  totalMs: number;
  maxMs: number;
  over50: number;
}

export class PerfLog {
  private ring: SpanRecord[] = [];
  private next = 0;
  private stats = new Map<string, LabelStats>();
  /** Called for any span over `slowMs` (wired to the output channel). */
  onSlow: ((s: SpanRecord) => void) | null = null;
  slowMs = 50;

  constructor(private readonly size = 256) {}

  span<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.record(label, start, performance.now() - start);
    }
  }

  record(label: string, start: number, ms: number): void {
    const rec = { label, start, ms };
    if (this.ring.length < this.size) this.ring.push(rec);
    else this.ring[this.next] = rec;
    this.next = (this.next + 1) % this.size;
    const s = this.stats.get(label) ?? { count: 0, totalMs: 0, maxMs: 0, over50: 0 };
    s.count++;
    s.totalMs += ms;
    s.maxMs = Math.max(s.maxMs, ms);
    if (ms > 50) s.over50++;
    this.stats.set(label, s);
    if (ms > this.slowMs) this.onSlow?.(rec);
  }

  /** Spans that overlapped the window [from, to] (performance.now() times), longest first. */
  during(from: number, to: number): SpanRecord[] {
    return this.ring.filter((r) => r.start <= to && r.start + r.ms >= from).sort((a, b) => b.ms - a.ms);
  }

  report(): string {
    const rows = [...this.stats].sort((a, b) => b[1].maxMs - a[1].maxMs);
    if (!rows.length) return 'No instrumented work recorded yet.';
    const head = 'operation                      count   total ms   mean ms   max ms   >50ms';
    return [head, ...rows.map(([l, s]) => `${l.padEnd(30)} ${String(s.count).padStart(5)} ${s.totalMs.toFixed(0).padStart(10)} ${(s.totalMs / s.count).toFixed(2).padStart(9)} ${s.maxMs.toFixed(1).padStart(8)} ${String(s.over50).padStart(7)}`)].join('\n');
  }

  snapshot(): Record<string, LabelStats> {
    return Object.fromEntries(this.stats);
  }

  reset(): void {
    this.ring = [];
    this.next = 0;
    this.stats.clear();
  }
}

/** Process-wide instance (one extension host). */
export const perf = new PerfLog();
