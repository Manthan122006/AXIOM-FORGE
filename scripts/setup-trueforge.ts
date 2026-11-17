/**
 * CLI: register the AXIOM Forge MCP server and agent definition in a local TrueForge.
 *   npx tsx scripts/setup-trueforge.ts --model <trueforge-model-name> [--mcp-url http://127.0.0.1:7811/mcp] [--base http://localhost:8790]
 * The model name is what TrueForge lists under Settings → Models (GET /api/v1/models).
 */
import path from 'node:path';
import { setupTrueForge } from '../src/trueforge/setup';
export { loadAgentDefinition, registerMcp, setupTrueForge } from '../src/trueforge/setup';

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
