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
  if (/trueforge is not reachable/.test(msg)) return 'trueforge_error';
  if (/timed? ?out|etimedout|deadline|headers timeout|und_err_(headers|body)_timeout|connect_timeout/.test(msg)) return 'timeout';
  if (/econnrefused|enotfound|eai_again|ehostunreach|enetunreach|econnreset|socket hang up|fetch failed|network|getaddrinfo|outbound url blocked|connection (refused|error)|unreachable/.test(msg)) return 'unreachable';
  if ((status !== undefined && status >= 500) || /\b5\d\d\b|internal server error|bad gateway|service unavailable|overloaded|upstream/.test(msg)) return 'server';
  if (/tool .*(failed|error)/.test(msg)) return 'tool_error';
  if (/trueforge (rejected|is not reachable|responded)|truefo?rge agent .* not (saved|found)|validation|invalid (agent|session|request)/.test(msg) || status === 400 || status === 409 || status === 422) return 'trueforge_error';
  return 'unknown';
}

/** Failures worth retrying on the same model. */
export const isTransient = (c: FailureClass) => c === 'rate_limit' || c === 'server' || c === 'timeout' || c === 'unreachable';
/** Switching models helps only for provider-side problems; never for cancellation, tool errors or TrueForge errors. */
export const warrantsFallback = (c: FailureClass) => c === 'auth' || c === 'bad_config' || isTransient(c) || c === 'unknown';

export function describeFailure(c: FailureClass): string {
  switch (c) {
    case 'auth':
      return 'The model provider rejected the API key.';
    case 'rate_limit':
      return 'The model provider is rate-limiting requests.';
    case 'bad_config':
      return 'The configured model was not found or is not available.';
    case 'timeout':
      return 'The model provider did not respond in time.';
    case 'unreachable':
      return 'The model endpoint could not be reached.';
    case 'server':
      return 'The model provider returned a server error.';
    case 'cancelled':
      return 'The run was cancelled.';
    case 'tool_error':
      return 'A tool failed.';
    case 'trueforge_error':
      return 'TrueForge rejected the request (not a model problem).';
    default:
      return 'The model call failed for an unrecognised reason.';
  }
}
