import type { ProposedEdit } from '../shared/contracts';
import { resolveWorkspacePath } from '../mcp/pathJail';
import type { WorkspaceHost } from '../workspace/host';
import { computeProposedText, proposeEditSchema, type ProposeEditArgs } from './proposeEditArgs';
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
