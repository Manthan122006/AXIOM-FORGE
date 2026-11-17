import type { FailureClass, ModelRecoveryState } from '../shared/contracts';
import { classifyFailure, isTransient, warrantsFallback } from './classify';

/** Result of one attempt to run a turn on a given model, as observed from the TrueForge stream. */
export type AttemptOutcome =
  | { kind: 'done' }
  | { kind: 'cancelled' }
  /** The turn failed before the agent did anything with side effects (no approved tool ran). */
  | { kind: 'failed'; error: unknown; sideEffects: false }
  /** The turn failed AFTER an approved write/command ran: never replay automatically. */
  | { kind: 'failed'; error: unknown; sideEffects: true };

export interface ShieldPolicy {
  primary: string;
  backup?: string | undefined;
  maxRetries: number; // retries on the same model for transient failures
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface ShieldDeps {
  /** Start a fresh attempt on `model` (new TrueForge session when `freshSession`). */
  attempt: (model: string, info: { attemptNo: number; freshSession: boolean }) => Promise<AttemptOutcome>;
  onState: (s: ModelRecoveryState) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  signal?: AbortSignal;
}

export type ShieldResult =
  | { kind: 'done'; model: string; usedBackup: boolean }
  | { kind: 'cancelled' }
  | { kind: 'failed'; failure: FailureClass; message: string; tried: string[]; reason: 'exhausted' | 'side_effects' | 'not_retryable' };

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  });

export function backoffDelay(attempt: number, p: Pick<ShieldPolicy, 'baseDelayMs' | 'maxDelayMs'>, random = Math.random): number {
  const exp = p.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(p.maxDelayMs, Math.round(exp * (0.8 + 0.4 * random())));
}

const messageOf = (e: unknown) => (typeof e === 'string' ? e : ((e as Error)?.message ?? String(e)));

/**
 * ModelShield: run a turn with bounded retry and automatic fallback, entirely through TrueForge.
 *
 * - Transient failures (rate limit, 5xx, timeout, unreachable) retry on the same model with
 *   exponential backoff + jitter, up to `maxRetries`.
 * - Non-transient provider failures (bad key, unknown model) skip retries.
 * - Then, if a backup model is configured, a NEW TrueForge session is started on the backup.
 * - Cancellation is never treated as a failure.
 * - If an approved write/command already ran in the failed attempt, nothing is replayed
 *   automatically (the user decides), so a write can never execute twice.
 */
export async function runWithShield(policy: ShieldPolicy, deps: ShieldDeps): Promise<ShieldResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const tried: string[] = [];
  const models = [policy.primary, ...(policy.backup && policy.backup !== policy.primary ? [policy.backup] : [])];
  let lastFailure: FailureClass = 'unknown';
  let lastMessage = '';

  for (let m = 0; m < models.length; m++) {
    const model = models[m]!;
    tried.push(model);
    if (m > 0) deps.onState({ kind: 'switching', from: models[m - 1]!, to: model });
    for (let attemptNo = 1; ; attemptNo++) {
      if (deps.signal?.aborted) return { kind: 'cancelled' };
      const outcome = await deps.attempt(model, { attemptNo, freshSession: m > 0 || attemptNo > 1 });
      if (outcome.kind === 'done') {
        deps.onState(m > 0 ? { kind: 'recovered', model, slot: 'backup' } : { kind: 'healthy', model });
        return { kind: 'done', model, usedBackup: m > 0 };
      }
      if (outcome.kind === 'cancelled') return { kind: 'cancelled' };

      const failure = classifyFailure(outcome.error);
      lastFailure = failure;
      lastMessage = messageOf(outcome.error);
      if (failure === 'cancelled') return { kind: 'cancelled' };
      deps.onState({ kind: 'failed', model, failure, message: lastMessage });

      if (outcome.sideEffects) {
        return { kind: 'failed', failure, message: lastMessage, tried, reason: 'side_effects' };
      }
      if (isTransient(failure) && attemptNo <= policy.maxRetries) {
        const delayMs = backoffDelay(attemptNo, policy, deps.random);
        deps.onState({ kind: 'retrying', model, attempt: attemptNo, maxAttempts: policy.maxRetries, delayMs });
        try {
          await sleep(delayMs, deps.signal);
        } catch {
          return { kind: 'cancelled' };
        }
        continue;
      }
      if (!warrantsFallback(failure)) return { kind: 'failed', failure, message: lastMessage, tried, reason: 'not_retryable' };
      break; // move on to the next model
    }
  }
  deps.onState({ kind: 'exhausted', tried, message: lastMessage });
  return { kind: 'failed', failure: lastFailure, message: lastMessage, tried, reason: 'exhausted' };
}
