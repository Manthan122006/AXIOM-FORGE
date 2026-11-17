/**
 * Redacts credential-looking strings from text that leaves the extension host
 * (command output, tool-call previews sent to the webview, logs).
 * Deliberately conservative: it targets token formats, not ordinary code.
 */
const PATTERNS: RegExp[] = [
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google / Gemini API keys
  /\bgsk_[0-9A-Za-z]{20,}\b/g, // Groq
  /\bsk-(?:proj-|ant-)?[0-9A-Za-z_-]{20,}\b/g, // OpenAI / Anthropic style
  /\bgh[pousr]_[0-9A-Za-z]{30,}\b/g, // GitHub tokens
  /\bxox[abpr]-[0-9A-Za-z-]{10,}\b/g, // Slack
  /\bBearer\s+[0-9A-Za-z._~+/-]{20,}=*/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

/** Scrub every string value inside a JSON-like structure. */
export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return scrubSecrets(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v);
    return out as T;
  }
  return value;
}
