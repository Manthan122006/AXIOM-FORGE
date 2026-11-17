import { TrueForge as TrueForgeClient, type TrueForgeApi } from '@truefoundry/trueforge-sdk';

/**
 * Thin wrapper over the verified @truefoundry/trueforge-sdk 0.185.0 surface:
 * sessions.create / createTurnStream / createTurnEvents / subscribeToTurn / cancel.
 * Nothing here talks to a model provider; TrueForge does that.
 */
export interface TurnInput {
  text: string;
}

/**
 * TrueForge standalone may bind only to IPv6 loopback ([::1]); verified with 0.185.1 on macOS, where
 * 127.0.0.1:8790 refuses connections. For a localhost base URL we therefore probe each loopback form.
 */
export function loopbackCandidates(baseUrl: string): string[] {
  const u = new URL(baseUrl);
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(u.hostname)) return [baseUrl.replace(/\/$/, '')];
  const port = u.port ? `:${u.port}` : '';
  const forms = [`${u.protocol}//${u.hostname === '::1' ? '[::1]' : u.hostname}${port}`, `${u.protocol}//localhost${port}`, `${u.protocol}//[::1]${port}`, `${u.protocol}//127.0.0.1${port}`];
  return [...new Set(forms)];
}

export class TrueForgeConnection {
  sdk: TrueForgeClient;
  /** The base URL that actually answered (may differ from the configured one for loopback). */
  baseUrl: string;

  constructor(readonly configuredUrl: string) {
    this.baseUrl = configuredUrl.replace(/\/$/, '');
    this.sdk = new TrueForgeClient({ baseUrl: this.baseUrl, timeoutInSeconds: 900 });
  }

  /** Real reachability check (no fake "connected"): lists models via the HTTP API. */
  async health(signal?: AbortSignal): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
    let lastError = '';
    for (const base of loopbackCandidates(this.baseUrl === this.configuredUrl.replace(/\/$/, '') ? this.configuredUrl : this.baseUrl)) {
      try {
        const res = await fetch(`${base}/api/v1/models`, { signal: signal ?? AbortSignal.timeout(2500) });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        const body = (await res.json()) as { data?: Array<{ name?: string; id?: string }> };
        if (base !== this.baseUrl) {
          this.baseUrl = base;
          this.sdk = new TrueForgeClient({ baseUrl: base, timeoutInSeconds: 900 });
        }
        return { ok: true, models: (body.data ?? []).map((m) => m.name ?? m.id ?? '').filter(Boolean) };
      } catch (e) {
        lastError = (e as Error).message;
      }
    }
    return { ok: false, reason: `TrueForge is not reachable at ${this.configuredUrl} (${lastError})` };
  }

  /** Session on a saved agent, optionally overriding the model (used by ModelShield for the backup). */
  async createSession(opts: { agentName: string; modelOverride?: string; spec?: TrueForgeApi.AgentSpec; title?: string }): Promise<string> {
    let agent: TrueForgeApi.CreateSessionAgent;
    if (opts.spec) {
      agent = { spec: opts.modelOverride ? { ...opts.spec, model: { ...opts.spec.model, name: opts.modelOverride } } : opts.spec };
    } else if (opts.modelOverride) {
      // A saved agent can't be re-modelled per session, so fetch its manifest and run it inline with the override.
      const list = await this.sdk.agents.list();
      const found = list.data.find((a) => a.name === opts.agentName);
      if (!found) throw new Error(`TrueForge agent "${opts.agentName}" not found. Run "AXIOM Forge: Register MCP Server and Agent in TrueForge".`);
      const spec = found.manifest as TrueForgeApi.AgentSpec;
      agent = { spec: { ...spec, model: { ...spec.model, name: opts.modelOverride } } };
    } else {
      agent = { name: opts.agentName };
    }
    const { data } = await this.sdk.sessions.create({ agent, ...(opts.title ? { metadata: { title: opts.title } as never } : {}) });
    return data.id;
  }

  async streamTurn(sessionId: string, input: TurnInput, signal?: AbortSignal): Promise<AsyncIterable<TrueForgeApi.TurnStreamingEvent>> {
    const stream = await this.sdk.sessions.createTurnStream(
      sessionId,
      { input: [{ type: 'user.message', content: input.text }] },
      signal ? { abortSignal: signal } : undefined,
    );
    return eventsOf(stream);
  }

  /** Re-attach to a paused/running turn after sending answers (approvals) to it. */
  async subscribe(sessionId: string, turnId: string, lastEventId?: string, signal?: AbortSignal): Promise<AsyncIterable<TrueForgeApi.TurnStreamingEvent>> {
    const stream = await this.sdk.sessions.subscribeToTurn(
      sessionId,
      turnId,
      lastEventId ? { afterEventId: lastEventId } : {},
      signal ? { abortSignal: signal } : undefined,
    );
    return eventsOf(stream);
  }

  async sendApprovals(sessionId: string, turnId: string, decisions: Array<{ toolCallId: string; threadId: string; allow: boolean; reason?: string }>): Promise<void> {
    await this.sdk.sessions.createTurnEvents(sessionId, turnId, {
      events: decisions.map((d) => ({
        type: 'user.tool_approval' as const,
        toolCallId: d.toolCallId,
        threadId: d.threadId,
        approval: d.allow ? { status: 'allow' as const } : { status: 'deny' as const, reason: d.reason ?? 'Denied by the user.' },
      })),
    });
  }

  async cancel(sessionId: string): Promise<void> {
    await this.sdk.sessions.cancel(sessionId);
  }

  sessionUrl(sessionId: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/sessions/${sessionId}`;
  }
}

async function* eventsOf(stream: AsyncIterable<unknown> & { withMetadata?: () => AsyncIterable<{ data: TrueForgeApi.TurnStreamingEvent }> }) {
  if (typeof stream.withMetadata === 'function') {
    for await (const { data } of stream.withMetadata()) yield data;
  } else {
    for await (const ev of stream as AsyncIterable<TrueForgeApi.TurnStreamingEvent>) yield ev;
  }
}
