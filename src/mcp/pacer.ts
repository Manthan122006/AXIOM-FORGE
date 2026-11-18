/**
 * Opt-in pacing of agent steps for free-tier model quotas (e.g. Gemini free tier: 5 requests and
 * 250k input tokens per minute per model, measured live on 18 Nov). Every model step after the first
 * follows a tool result, so holding each result until at least `minMs` has passed since the previous
 * one spaces the agent's model requests without touching TrueForge. 0 = off (default).
 */
export class StepPacer {
  private last = 0;
  constructor(
    private readonly minMs: () => number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = (ms, signal) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('cancelled while pacing'), { name: 'AbortError' }));
        }, { once: true });
      }),
  ) {}

  /** Wait (if needed) before a tool result is returned. Resolves with the time waited in ms. */
  async beforeResult(signal?: AbortSignal): Promise<number> {
    const min = this.minMs();
    let waited = 0;
    if (min > 0 && this.last > 0) {
      waited = Math.max(0, this.last + min - this.now());
      if (waited > 0) await this.sleep(waited, signal);
    }
    this.last = this.now();
    return waited;
  }
}
