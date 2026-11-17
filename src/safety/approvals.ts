import { createHash } from 'node:crypto';

/**
 * Approval registry: the extension-side gate that makes "no write without approval"
 * true even if a TrueForge agent were misconfigured without `require_approval_for_tools`.
 *
 * Flow: the extension sees a `propose_edit` / `run_command` tool call on the TrueForge stream,
 * the user approves it in AXIOM Forge, and we `grant()` that exact call (tool + canonical args).
 * When TrueForge then invokes the MCP tool, the handler must `consume()` a matching grant
 * or refuse. A grant is single-use and expires.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function fingerprint(tool: string, args: unknown): string {
  return createHash('sha256').update(`${tool}\u0000${canonicalJson(args)}`).digest('hex');
}

export interface Grant<P = unknown> {
  tool: string;
  fingerprint: string;
  toolCallId: string;
  payload: P;
  expiresAt: number;
}

export class ApprovalRegistry {
  private grants = new Map<string, Grant>();
  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  grant<P>(tool: string, args: unknown, toolCallId: string, payload: P): Grant<P> {
    const g: Grant<P> = { tool, fingerprint: fingerprint(tool, args), toolCallId, payload, expiresAt: this.now() + this.ttlMs };
    this.grants.set(g.fingerprint, g);
    return g;
  }

  /** Remove and return the grant matching this exact invocation, or undefined if not approved. */
  consume<P>(tool: string, args: unknown): Grant<P> | undefined {
    const fp = fingerprint(tool, args);
    const g = this.grants.get(fp);
    if (!g) return undefined;
    this.grants.delete(fp);
    if (g.expiresAt < this.now()) return undefined;
    return g as Grant<P>;
  }

  revokeForToolCall(toolCallId: string): void {
    for (const [fp, g] of this.grants) if (g.toolCallId === toolCallId) this.grants.delete(fp);
  }

  revokeAll(): void {
    this.grants.clear();
  }

  get size(): number {
    return this.grants.size;
  }
}
