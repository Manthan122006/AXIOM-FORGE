import type { ProposedEdit } from '../shared/contracts';
import { resolveWorkspacePath } from '../mcp/pathJail';
import type { WorkspaceHost } from '../workspace/host';
import { computeProposedText, proposeEditSchema, type ProposeEditArgs } from './proposeEditArgs';
import { perf } from '../shared/perf';
import { mergeFileVersions } from './merge';
import type { SafeChange } from './safeChange';

export type StageResult =
  | { ok: true; proposal: ProposedEdit; args: ProposeEditArgs }
  | { ok: false; error: string };

/**
 * Turn a `propose_edit` tool call seen on the TrueForge stream (before approval) into a staged
 * SafeChange proposal. Nothing is written. Validation errors are returned so the extension can
 * deny the call with an actionable reason the model can fix.
 */
export async function stageProposeEdit(
  rawArgs: unknown,
  meta: { toolCallId: string; sessionId: string; turnId: string },
  host: WorkspaceHost,
  safeChange: SafeChange,
): Promise<StageResult> {
  const parsed = proposeEditSchema.safeParse(rawArgs);
  if (!parsed.success) return { ok: false, error: `Invalid propose_edit arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  const args = parsed.data;
  let rel: string;
  try {
    rel = resolveWorkspacePath(host.root, args.path, 'write').rel;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const exists = await host.exists(rel);
  const current = exists ? await host.readText(rel) : null;
  let proposed: string;
  try {
    proposed = computeProposedText(current, args);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (current !== null && proposed === current) return { ok: false, error: `The proposed edit does not change ${rel}.` };
  const proposal = safeChange.stage({ ...meta, path: rel, rationale: args.rationale, baseText: current, proposedText: proposed });
  return { ok: true, proposal, args };
}

export interface PendingProposeEdit {
  toolCallId: string;
  rawArgs: unknown;
}

export type GroupStageResult =
  | { toolCallId: string; ok: true; proposal: ProposedEdit; args: ProposeEditArgs; mergedWith: string[] }
  | { toolCallId: string; ok: false; error: string };

/**
 * Stage every propose_edit call of one approval pause. Calls are grouped by resolved file path:
 * a single call is staged as before; several calls for the same file are each computed against the
 * same current text and merged (src/safety/merge.ts) into ONE proposal, so the user reviews one
 * combined diff and the second call can't hit a conflict after the first one is written.
 * A call that overlaps an earlier call for the same file, or that can't be computed, is refused
 * with a reason the model can act on; it is never partially applied.
 */
export async function stageProposeEdits(
  calls: PendingProposeEdit[],
  meta: { sessionId: string; turnId: string },
  host: WorkspaceHost,
  safeChange: SafeChange,
): Promise<GroupStageResult[]> {
  const results: GroupStageResult[] = [];
  const groups = new Map<string, Array<{ toolCallId: string; args: ProposeEditArgs }>>();
  for (const c of calls) {
    const parsed = proposeEditSchema.safeParse(c.rawArgs);
    if (!parsed.success) {
      results.push({ toolCallId: c.toolCallId, ok: false, error: `Invalid propose_edit arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` });
      continue;
    }
    let rel: string;
    try {
      rel = resolveWorkspacePath(host.root, parsed.data.path, 'write').rel;
    } catch (e) {
      results.push({ toolCallId: c.toolCallId, ok: false, error: (e as Error).message });
      continue;
    }
    (groups.get(rel) ?? groups.set(rel, []).get(rel)!).push({ toolCallId: c.toolCallId, args: parsed.data });
  }

  for (const [rel, members] of groups) {
    if (members.length === 1) {
      const m = members[0]!;
      const r = await stageProposeEdit(m.args, { ...meta, toolCallId: m.toolCallId }, host, safeChange);
      results.push(r.ok ? { toolCallId: m.toolCallId, ok: true, proposal: r.proposal, args: r.args, mergedWith: [] } : { toolCallId: m.toolCallId, ok: false, error: r.error });
      continue;
    }
    const exists = await host.exists(rel);
    const current = exists ? await host.readText(rel) : null;
    const versions: Array<{ id: string; text: string; args: ProposeEditArgs }> = [];
    for (const m of members) {
      try {
        versions.push({ id: m.toolCallId, text: computeProposedText(current, m.args), args: m.args });
      } catch (e) {
        results.push({ toolCallId: m.toolCallId, ok: false, error: (e as Error).message });
      }
    }
    // A new file can only come from one call: two whole-file contents for a missing file can't be merged.
    if (current === null && versions.length > 1) {
      for (const r of versions.splice(1)) {
        results.push({ toolCallId: r.id, ok: false, error: `${rel} does not exist yet and another propose_edit in this step already creates it; put the whole file in one call.` });
      }
    }
    if (versions.length === 0) continue;
    const m = perf.span('safechange.merge', () => mergeFileVersions(current ?? '', versions));
    for (const c of m.refused) {
      const other = c.with === c.source ? '' : ` (call ${c.with})`;
      results.push({ toolCallId: c.source, ok: false, error: `Not staged: this edit to ${rel} was not combined with the other edit${other} because ${c.reason} (around lines ${c.lines[0]}–${c.lines[1]}). Re-read the file after the other change and propose one edit for that region.` });
    }
    if (!m.ok) continue;
    const kept = versions.filter((v) => m.merged.includes(v.id));
    const lead = kept[0]!;
    const proposal = safeChange.stage({
      ...meta,
      toolCallId: lead.id,
      memberToolCallIds: kept.map((k) => k.id),
      path: rel,
      rationale: kept.length > 1 ? kept.map((k, i) => `(${i + 1}) ${k.args.rationale}`).join(' ') : lead.args.rationale,
      baseText: current,
      proposedText: m.text,
    });
    for (const k of kept) results.push({ toolCallId: k.id, ok: true, proposal, args: k.args, mergedWith: kept.filter((o) => o.id !== k.id).map((o) => o.id) });
  }
  // Report in the original call order.
  const order = new Map(calls.map((c, i) => [c.toolCallId, i]));
  return results.sort((a, b) => order.get(a.toolCallId)! - order.get(b.toolCallId)!);
}
