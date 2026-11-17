import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAgentDefinition } from '../../src/trueforge/setup';

const load = (f: string) => loadAgentDefinition(path.resolve('agents', f), 'provider/model').manifest as {
  instructions: string;
  model: { name: string };
  mcp_servers: Array<{ name: string; enable_tools?: string[]; require_approval_for_tools?: string[]; preload?: boolean }>;
  config: { dynamic_sub_agents: { enabled: boolean }; iteration_limit: number };
};

describe('committed agent definitions', () => {
  it('full agent: every write/command tool is approval-gated', () => {
    const m = load('axiom-agent.json');
    expect(m.model.name).toBe('provider/model');
    expect(m.mcp_servers[0]!.require_approval_for_tools).toEqual(expect.arrayContaining(['propose_edit', 'run_command']));
  });
  it('inline agent: only read_file + propose_edit, edit approval-gated, no commands, no subagents, short', () => {
    const m = load('axiom-agent-inline.json');
    const srv = m.mcp_servers[0]!;
    expect(srv.name).toBe('axiom-forge');
    expect(srv.enable_tools).toEqual(['read_file', 'propose_edit']);
    expect(srv.require_approval_for_tools).toEqual(['propose_edit']);
    expect(srv.preload).toBe(true);
    expect(m.config.dynamic_sub_agents.enabled).toBe(false);
    expect(m.config.iteration_limit).toBeLessThanOrEqual(10);
    expect(m.instructions.length).toBeLessThan(1000);
  });
});
