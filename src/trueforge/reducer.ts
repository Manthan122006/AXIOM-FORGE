import type { TrueForgeApi as TrueForge } from '@truefoundry/trueforge-sdk';
import { isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import type { AgentEvent, ToolCallState, TurnStatus } from '../shared/contracts';
import { scrubDeep, scrubSecrets } from '../shared/secrets';

type Ev = TrueForge.TurnStreamingEvent;

export interface ToolCallLookup {
  toolCallId: string;
  toolName: string;
  server: string | null;
  args: Record<string, unknown>;
  /** Raw JSON string exactly as the model sent it (used for approval fingerprints). */
  rawArgs: string;
  threadId: string;
}

/** Tool names may arrive namespaced (e.g. "axiom-forge__propose_edit"); MCP toolInfo is authoritative. */
function toolIdentity(call: TrueForge.ToolCall): { name: string; server: string | null } {
  const info = call.toolInfo as TrueForge.ToolInfo | undefined;
  if (info && info.type === 'mcp') return { name: info.name, server: info.serverName };
  if (info) return { name: info.name, server: null };
  return { name: call.function?.name ?? 'unknown', server: null };
}

/**
 * TrueForge invokes deferred (non-preloaded) MCP tools through its system tool `call_tool` with
 * arguments `{ tool_name, input, mcp_server }` (observed live with 0.185.1, 18 Nov). Unwrap it so
 * approval, grant fingerprints and the timeline see the real tool and the exact `input` the MCP
 * server will receive.
 */
export function unwrapDeferred(name: string, server: string | null, args: Record<string, unknown> | null): { name: string; server: string | null; args: Record<string, unknown> | null } {
  if (name !== 'call_tool' || server !== null || !args || typeof args.tool_name !== 'string') return { name, server, args };
  const input = args.input && typeof args.input === 'object' && !Array.isArray(args.input) ? (args.input as Record<string, unknown>) : {};
  return { name: args.tool_name, server: typeof args.mcp_server === 'string' ? args.mcp_server : null, args: input };
}

export function parseArgs(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function textOf(content: TrueForge.ModelMessageEventContent | null | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((p) => ((p as { type?: string; text?: string }).type === 'text' ? ((p as { text?: string }).text ?? '') : ''))
    .join('');
}

const FAILURE_PREFIX = /^(Refused:|Error:|Not applied:|Not run:)/;

/**
 * Folds the TrueForge turn stream into AXIOM Forge timeline state.
 * Pure state machine over real SDK event types; no I/O. One tracker per turn.
 */
export class TurnTracker {
  status: TurnStatus = 'idle';
  turnId: string | null = null;
  error: string | undefined;
  cancelReason: string | undefined;
  lastEventId: string | undefined;
  readonly timeline: AgentEvent[] = [];
  readonly toolCalls = new Map<string, ToolCallState>();
  /** Base model.message events by id (deltas are merged in place). */
  private readonly messages = new Map<string, TrueForge.ModelMessageEvent>();
  private readonly timelineIndex = new Map<string, number>();
  /** toolCallId → source model.message id. */
  private readonly callSource = new Map<string, string>();
  /** Timeline ids changed since the last drainDirty(): the host copies and posts only these. */
  private readonly dirty = new Set<string>();

  /** Ids of timeline entries added or changed since the last call. */
  drainDirty(): string[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }

  eventById(id: string): AgentEvent | undefined {
    const i = this.timelineIndex.get(id);
    return i === undefined ? undefined : this.timeline[i];
  }

  /** Returns true when something user-visible changed. */
  apply(ev: Ev): boolean {
    if (ev.id) this.lastEventId = ev.id;
    if (isEventDelta(ev)) {
      const base = this.messages.get(ev.id);
      if (!base) return false;
      mergeEventDelta(base, ev);
      this.syncMessage(base, true);
      return true;
    }
    switch (ev.type) {
      case 'turn.created':
        this.turnId = ev.turnId;
        this.status = 'running';
        return true;
      case 'turn.update':
        this.status = ev.state.status === 'paused' ? 'paused' : 'running';
        return true;
      case 'model.message':
        this.messages.set(ev.id, { ...ev, toolCalls: ev.toolCalls ? ev.toolCalls.map((c) => ({ ...c, function: { ...c.function } })) : [] });
        this.syncMessage(this.messages.get(ev.id)!, ev.finishReason == null && !ev.toolCalls?.length && !textOf(ev.content));
        return true;
      case 'tool.approval_required':
        for (const ref of ev.toolCalls) {
          this.callSource.set(ref.id, ref.sourceEventId);
          this.setPhase(ref.id, 'awaiting_approval');
        }
        return true;
      case 'user.tool_approval':
        this.setPhase(ev.toolCallId, ev.approval.status === 'allow' ? 'running' : 'denied');
        return true;
      case 'tool.response': {
        const call = this.toolCalls.get(ev.toolCallId);
        if (call) {
          this.dirty.add(`tool:${call.toolCallId}`);
          call.resultPreview = scrubSecrets(ev.content.slice(0, 2000));
          if (call.phase !== 'denied') call.phase = FAILURE_PREFIX.test(ev.content) ? 'failed' : 'succeeded';
          call.finishedAt = ev.createdAt;
        }
        return true;
      }
      case 'thread.created':
        this.push({ kind: 'subagent', id: ev.id, threadId: ev.threadId, title: ev.title, status: 'running', at: ev.createdAt });
        return true;
      case 'thread.done': {
        const i = this.timeline.findIndex((e) => e.kind === 'subagent' && e.threadId === ev.threadId);
        if (i >= 0) {
          this.timeline[i] = { ...(this.timeline[i] as Extract<AgentEvent, { kind: 'subagent' }>), status: 'done' };
          this.dirty.add(this.timeline[i]!.id);
        }
        return true;
      }
      case 'thread.context_compaction_started':
      case 'thread.context_compaction_finished':
        this.push({ kind: 'compaction', id: ev.id, threadId: ev.threadId, status: ev.type.endsWith('started') ? 'started' : 'finished', at: ev.createdAt });
        return true;
      case 'turn.done': {
        const st = ev.state;
        this.status = st.status;
        if (st.status === 'error') this.error = scrubSecrets(st.message);
        if (st.status === 'cancelled') this.cancelReason = st.reason;
        for (const c of this.toolCalls.values()) {
          if (c.phase === 'awaiting_approval' || c.phase === 'requested' || c.phase === 'running') {
            c.phase = st.status === 'done' ? c.phase : 'failed';
            this.dirty.add(`tool:${c.toolCallId}`);
          }
        }
        for (const e of this.timeline) {
          if (e.kind === 'assistant_text' && e.streaming) {
            e.streaming = false;
            this.dirty.add(e.id);
          }
        }
        this.push({ kind: 'turn_end', id: ev.id, status: st.status, ...(st.status === 'error' ? { message: this.error } : {}), at: ev.createdAt ?? new Date().toISOString() });
        return true;
      }
      default:
        return false; // mcp.initialize, sandbox.created, user.* echoes we don't render, auth events
    }
  }

  /** Arguments of a pending tool call, resolved through its source model.message. */
  lookup(toolCallId: string): ToolCallLookup | undefined {
    const src = this.callSource.get(toolCallId);
    const msg = src ? this.messages.get(src) : [...this.messages.values()].find((m) => m.toolCalls?.some((c) => c.id === toolCallId));
    const call = msg?.toolCalls?.find((c) => c.id === toolCallId);
    if (!msg || !call) return undefined;
    const id = toolIdentity(call);
    const { name, server, args } = unwrapDeferred(id.name, id.server, parseArgs(call.function.arguments));
    return { toolCallId, toolName: name, server, args: args ?? {}, rawArgs: call.function.arguments, threadId: msg.threadId };
  }

  pendingApprovals(): string[] {
    return [...this.toolCalls.values()].filter((c) => c.phase === 'awaiting_approval').map((c) => c.toolCallId);
  }

  private setPhase(id: string, phase: ToolCallState['phase']) {
    const c = this.toolCalls.get(id);
    if (c) {
      c.phase = phase;
      this.dirty.add(`tool:${id}`);
    }
  }

  private push(e: AgentEvent) {
    this.timelineIndex.set(e.id, this.timeline.length);
    this.timeline.push(e);
    this.dirty.add(e.id);
  }

  private syncMessage(msg: TrueForge.ModelMessageEvent, streaming: boolean) {
    const text = textOf(msg.content);
    if (text) {
      const key = `text:${msg.id}`;
      const at = this.timelineIndex.get(key);
      const ev: AgentEvent = { kind: 'assistant_text', id: key, threadId: msg.threadId, text, streaming: streaming && msg.finishReason == null, at: msg.createdAt };
      if (at === undefined) this.push(ev);
      else {
        this.timeline[at] = ev;
        this.dirty.add(key);
      }
    }
    for (const call of msg.toolCalls ?? []) {
      if (!call.id) continue;
      const raw = call.function.arguments;
      const existing = this.toolCalls.get(call.id);
      // While arguments stream in, the JSON is incomplete: only attempt a parse when it could be
      // complete (ends with "}"), so a 40 KB argument isn't re-parsed (and thrown on) per delta.
      const ident = toolIdentity(call);
      const { name, server, args } = unwrapDeferred(ident.name, ident.server, !raw ? {} : raw.trimEnd().endsWith('}') ? parseArgs(raw) : null);
      if (existing) {
        if (existing.toolName !== name || existing.server !== server || args) this.dirty.add(`tool:${call.id}`);
        existing.toolName = name;
        existing.server = server;
        if (args) existing.args = scrubDeep(args);
        continue;
      }
      const state: ToolCallState = { toolCallId: call.id, server, toolName: name, args: scrubDeep(args ?? {}), phase: 'requested', startedAt: msg.createdAt };
      this.toolCalls.set(call.id, state);
      this.callSource.set(call.id, msg.id);
      this.push({ kind: 'tool_call', id: `tool:${call.id}`, threadId: msg.threadId, call: state });
    }
  }
}
