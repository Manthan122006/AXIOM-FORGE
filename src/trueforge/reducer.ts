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
        if (i >= 0) this.timeline[i] = { ...(this.timeline[i] as Extract<AgentEvent, { kind: 'subagent' }>), status: 'done' };
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
          if (c.phase === 'awaiting_approval' || c.phase === 'requested' || c.phase === 'running') c.phase = st.status === 'done' ? c.phase : 'failed';
        }
        for (const e of this.timeline) if (e.kind === 'assistant_text') e.streaming = false;
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
    const { name, server } = toolIdentity(call);
    return { toolCallId, toolName: name, server, args: parseArgs(call.function.arguments) ?? {}, rawArgs: call.function.arguments, threadId: msg.threadId };
  }

  pendingApprovals(): string[] {
    return [...this.toolCalls.values()].filter((c) => c.phase === 'awaiting_approval').map((c) => c.toolCallId);
  }

  private setPhase(id: string, phase: ToolCallState['phase']) {
    const c = this.toolCalls.get(id);
    if (c) c.phase = phase;
  }

  private push(e: AgentEvent) {
    this.timelineIndex.set(e.id, this.timeline.length);
    this.timeline.push(e);
  }

  private syncMessage(msg: TrueForge.ModelMessageEvent, streaming: boolean) {
    const text = textOf(msg.content);
    if (text) {
      const key = `text:${msg.id}`;
      const at = this.timelineIndex.get(key);
      const ev: AgentEvent = { kind: 'assistant_text', id: key, threadId: msg.threadId, text, streaming: streaming && msg.finishReason == null, at: msg.createdAt };
      if (at === undefined) this.push(ev);
      else this.timeline[at] = ev;
    }
    for (const call of msg.toolCalls ?? []) {
      if (!call.id) continue;
      const { name, server } = toolIdentity(call);
      const args = parseArgs(call.function.arguments);
      const existing = this.toolCalls.get(call.id);
      if (existing) {
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
