/**
 * Replays REAL TrueForge 0.185.1 streams recorded with scripts/proof.ts on 18 Nov 2026
 * (Gemini via TrueForge; tests/fixtures/trueforge-events/recorded/). Not synthetic.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { classifyFailure } from '../../src/trueforge/classify';
import { TurnTracker } from '../../src/trueforge/reducer';

type Ev = TrueForgeApi.TurnStreamingEvent;
const DIR = path.join(__dirname, '../fixtures/trueforge-events/recorded');
const replay = (name: string) => {
  const rec = JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8')) as { model: string; events: Ev[] };
  const t = new TurnTracker();
  const approvals: string[][] = [];
  for (const ev of rec.events) {
    t.apply(ev);
    if (ev.type === 'tool.approval_required') approvals.push(t.pendingApprovals().map((id) => t.lookup(id)!.toolName));
  }
  return { t, approvals, rec, calls: [...t.toolCalls.values()] };
};

describe('recorded real TrueForge streams', () => {
  it('allow: propose_edit pauses for approval, applies; approved pytest runs (exit 0)', () => {
    const { t, approvals, calls } = replay('gemini-allow-edit-and-pytest');
    expect(t.status).toBe('done');
    expect(approvals).toEqual([['propose_edit'], ['run_command']]);
    expect(calls.find((c) => c.toolName === 'propose_edit')).toMatchObject({ server: 'axiom-forge', phase: 'succeeded', resultPreview: expect.stringMatching(/^Applied 1 of 1 hunk/) });
    expect(calls.find((c) => c.toolName === 'run_command')).toMatchObject({ args: { command: 'pytest tests/test_cli.py -q' }, resultPreview: expect.stringMatching(/exit code: 0 \(PASSED/) });
  });

  it('regression: a deferred run_command arrives as TrueForge call_tool and is unwrapped to the real tool + input', () => {
    const { approvals, calls } = replay('gemini-allow-edit-deferred-run-command-before-fix');
    expect(approvals[1]).toEqual(['run_command']);
    const rc = calls.find((c) => c.toolName === 'run_command')!;
    expect(rc.server).toBe('axiom-forge');
    expect(rc.args).toEqual({ command: 'pytest tests/test_cli.py -q' });
    // recorded before the fix: our MCP tool correctly refused because no grant matched
    expect(rc.resultPreview).toMatch(/not approved by the user in AXIOM Forge/);
  });

  it('deny: the denial reaches the model, the tool is marked denied, the turn still completes', () => {
    const { t, calls } = replay('gemini-lite-deny');
    expect(t.status).toBe('done');
    expect(calls.find((c) => c.toolName === 'propose_edit')!.phase).toBe('denied');
  });

  it('cancel: sessions.cancel ends the turn as cancelled (client-cancelled)', () => {
    const { t } = replay('gemini-lite-cancel');
    expect(t.status).toBe('cancelled');
    expect(t.cancelReason).toBe('client-cancelled');
  });

  it('Task A: the model proposes the official change through propose_edit', () => {
    const { t, calls } = replay('gemini-lite-task-a');
    expect(t.status).toBe('done');
    const pe = calls.find((c) => c.toolName === 'propose_edit')!;
    const edits = pe.args.edits as Array<{ new_text: string }>;
    expect(edits[0]!.new_text).toContain('{"0", "false", "no", "off", "n"}');
  });

  it('provider failures are classified from the real messages', () => {
    const cls = (n: string) => classifyFailure(replay(n).t.error);
    expect(cls('gemini-headers-timeout')).toBe('timeout');
    expect(cls('gemini-503-high-demand')).toBe('server');
    expect(cls('gemini-429-daily-quota')).toBe('rate_limit');
    expect(cls('gemini-429-mid-turn')).toBe('rate_limit');
    expect(cls('groq-reasoning-content-400')).toBe('bad_config');
  });
});
