import type { FailureClass } from '../shared/contracts';

/**
 * Classify a TrueForge turn error (turn.done{status:"error"}.message) or a client-side
 * exception into a FailureClass. TrueForge surfaces provider errors as text, so this is
 * pattern-based and deliberately conservative: unknown errors are NOT retried.
 */
export function classifyFailure(input: unknown): FailureClass {
  const err = input as { name?: string; code?: string; statusCode?: number; status?: number; message?: string; cause?: unknown } | string | undefined;
  if (!err) return 'unknown';
  if (typeof err === 'object' && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) return 'cancelled';
  const status = typeof err === 'object' ? (err.statusCode ?? err.status) : undefined;
  const msg = (typeof err === 'string' ? err : `${err.message ?? ''} ${err.code ?? ''} ${String((err.cause as { code?: string })?.code ?? '')}`).toLowerCase();

  if (/cancel|abort/.test(msg) && !/timeout/.test(msg)) return 'cancelled';
  if (status === 401 || status === 403 || /\b(401|403)\b|unauthori[sz]ed|invalid[ _-]?(api[ _-]?)?key|api key not valid|incorrect api key|permission[ _-]denied|authentication|forbidden|invalid x-api-key/.test(msg)) return 'auth';
  if (status === 429 || /\b429\b|rate[ _-]?limit|quota|resource[ _-]?exhausted|too many requests/.test(msg)) return 'rate_limit';
  if (status === 404 || /model[^.]*not (found|exist|supported)|unknown model|no such model|model .* is not available|invalid model|not configured|model provider .* not found/.test(msg)) return 'bad_config';
  // The provider refused the request itself (e.g. Groq rejecting `reasoning_content` echoed back by
  // TrueForge for a reasoning model): retrying the same model can't help, another model might.
  if (/\[model error\] request failed \((400|413|422)\)|is unsupported|not supported for this model/.test(msg)) return 'bad_config';
  if (/trueforge is not reachable/.test(msg)) return 'trueforge_error';
  if (/timed? ?out|etimedout|deadline|headers timeout|und_err_(headers|body)_timeout|connect_timeout/.test(msg)) return 'timeout';
  if (/econnrefused|enotfound|eai_again|ehostunreach|enetunreach|econnreset|socket hang up|fetch failed|network|getaddrinfo|outbound url blocked|connection (refused|error)|unreachable/.test(msg)) return 'unreachable';
  if ((status !== undefined && status >= 500) || /\b5\d\d\b|internal server error|bad gateway|service unavailable|overloaded|upstream/.test(msg)) return 'server';
  // The provider rejected a malformed tool call the model generated (Groq `tool_use_failed`):
  // not our tool failing. A fresh sample on the same model often succeeds, so it is retryable.
  if (/tool call validation failed|tool_use_failed|did not match schema/.test(msg)) return 'model_output';
  if (/tool .*(failed|error)/.test(msg)) return 'tool_error';
  if (/trueforge (rejected|is not reachable|responded)|truefo?rge agent .* not (saved|found)|validation|invalid (agent|session|request)/.test(msg) || status === 400 || status === 409 || status === 422) return 'trueforge_error';
  return 'unknown';
}

/**
 * Retry delay the provider asked for, in ms, if the message says so: Groq "Please try again in 4.5s",
 * "try again in 1m2.5s", Google "retryDelay": "27s", "Retry-After: 30". Undefined when absent.
 */
export function retryAfterMs(message: string): number | undefined {
  const m = message.match(/try again in (?:(\d+)m)?([\d.]+)\s*s/i);
  if (m) return Math.round(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) * 1000);
  const g = message.match(/retry[_-]?delay"?\s*[:=]\s*"?([\d.]+)s/i) ?? message.match(/retry-after:?\s*([\d.]+)/i);
  return g ? Math.round(Number(g[1]) * 1000) : undefined;
}

/** Failures worth retrying on the same model. */
export const isTransient = (c: FailureClass) => c === 'rate_limit' || c === 'server' || c === 'timeout' || c === 'unreachable' || c === 'model_output';
/** Switching models helps only for provider-side problems; never for cancellation, tool errors or TrueForge errors. */
export const warrantsFallback = (c: FailureClass) => c === 'auth' || c === 'bad_config' || isTransient(c) || c === 'unknown';

export function describeFailure(c: FailureClass): string {
  switch (c) {
    case 'auth':
      return 'The model provider rejected the API key.';
    case 'rate_limit':
      return 'The model provider is rate-limiting requests.';
    case 'bad_config':
      return 'The configured model was not found, is not available, or rejected the request.';
    case 'timeout':
      return 'The model provider did not respond in time.';
    case 'unreachable':
      return 'The model endpoint could not be reached.';
    case 'server':
      return 'The model provider returned a server error.';
    case 'cancelled':
      return 'The run was cancelled.';
    case 'model_output':
      return 'The model produced an invalid tool call that the provider rejected.';
    case 'tool_error':
      return 'A tool failed.';
    case 'trueforge_error':
      return 'TrueForge rejected the request (not a model problem).';
    default:
      return 'The model call failed for an unrecognised reason.';
  }
}
