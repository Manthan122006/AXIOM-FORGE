/**
 * Registers the AXIOM Forge MCP server and agent definition in a local TrueForge.
 * Idempotent. Uses only TrueForge's HTTP API; never touches model-provider keys.
 *
 *   npx tsx scripts/setup-trueforge.ts --model <trueforge-model-name> [--mcp-url http://127.0.0.1:7811/mcp] [--base http://localhost:8790]
 *
 * The model name is what TrueForge lists under Settings → Models (GET /api/v1/models).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SetupOptions {
  base: string;
  mcpUrl: string;
  model: string;
  agentFile: string;
}

async function call(base: string, method: string, p: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, json };
}

export async function registerMcp(o: Pick<SetupOptions, 'base' | 'mcpUrl'>): Promise<string> {
  const health = await call(o.base, 'GET', '/api/v1/models').catch((e: Error) => ({ status: 0, json: e.message }));
  if (health.status !== 200) throw new Error(`TrueForge not reachable at ${o.base} (${JSON.stringify(health.json)})`);

  // 1. MCP connector
  const manifest = { type: 'remote', name: 'axiom-forge', description: 'AXIOM Forge VS Code editor tools (local, 127.0.0.1)', url: o.mcpUrl };
  const existing = await call(o.base, 'GET', '/api/v1/settings/mcp-servers/axiom-forge');
  const mcpRes = existing.status === 200
    ? await call(o.base, 'PUT', '/api/v1/settings/mcp-servers', { manifest })
    : await call(o.base, 'POST', '/api/v1/settings/mcp-servers', { manifest });
  if (mcpRes.status >= 300) throw new Error(`MCP registration failed (${mcpRes.status}): ${JSON.stringify(mcpRes.json)}`);
  return manifest.url;
}

/** Load the committed agent definition with the model placeholder filled in. */
export function loadAgentDefinition(agentFile: string, model: string) {
  return JSON.parse(readFileSync(agentFile, 'utf8').replace('${AXIOM_PRIMARY_MODEL}', model)) as {
    name: string;
    description: string;
    manifest: Record<string, unknown>;
  };
}

export async function setupTrueForge(o: SetupOptions): Promise<{ mcp: string; agent: string; agentId: string }> {
  const mcpUrl = await registerMcp(o);
  // 2. Agent definition (the exact file committed in agents/)
  const def = loadAgentDefinition(o.agentFile, o.model);
  const list = await call(o.base, 'GET', '/api/v1/agents');
  const found = ((list.json as { data?: Array<{ id: string; name: string }> }).data ?? []).find((a) => a.name === def.name);
  const agentRes = found
    ? await call(o.base, 'PUT', `/api/v1/agents/${found.id}`, { description: def.description, manifest: def.manifest })
    : await call(o.base, 'POST', '/api/v1/agents', def);
  if (agentRes.status >= 300) throw new Error(`Agent save failed (${agentRes.status}): ${JSON.stringify(agentRes.json)}`);
  const agentId = (agentRes.json as { data?: { id: string } }).data?.id ?? found?.id ?? '?';
  return { mcp: mcpUrl, agent: def.name, agentId };
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('setup-trueforge')) {
  const model = arg('model', process.env.AXIOM_PRIMARY_MODEL);
  if (!model) {
    console.error('Pass --model <name> (see TrueForge Settings → Models, or GET /api/v1/models).');
    process.exit(2);
  }
  setupTrueForge({
    base: arg('base', process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790')!,
    mcpUrl: arg('mcp-url', 'http://127.0.0.1:7811/mcp')!,
    model,
    agentFile: path.join(__dirname, '..', 'agents', 'axiom-agent.json'),
  })
    .then((r) => console.log(`registered MCP server ${r.mcp} and agent "${r.agent}" (${r.agentId}) with model ${model}`))
    .catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
}
