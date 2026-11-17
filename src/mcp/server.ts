import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { ContextEngine } from '../context/engine';
import type { ContextReceipt } from '../shared/contracts';
import type { ApprovalRegistry } from '../safety/approvals';
import { proposeEditShape } from '../safety/proposeEditArgs';
import type { ApplyOutcome, SafeChange } from '../safety/safeChange';
import { runCommand, type CommandResult } from '../verification/commandRunner';
import type { WorkspaceHost } from '../workspace/host';
import { PathPolicyError, resolveWorkspacePath } from './pathJail';

export const MCP_SERVER_NAME = 'axiom-forge';
export const TOOL = {
  readFile: 'read_file',
  search: 'search_workspace',
  findSymbol: 'find_symbol',
  related: 'related_files',
  assemble: 'assemble_context',
  proposeEdit: 'propose_edit',
  runCommand: 'run_command',
} as const;
/** Tools that must pause for human approval in TrueForge AND hold a grant in AXIOM Forge. */
export const GATED_TOOLS = [TOOL.proposeEdit, TOOL.runCommand] as const;

export interface McpDeps {
  host: WorkspaceHost;
  engine: ContextEngine;
  approvals: ApprovalRegistry;
  safeChange: SafeChange;
  budgetTokens?: () => number;
  onReceipt?: (r: ContextReceipt) => void;
  onApplied?: (o: ApplyOutcome) => void;
  onCommandStart?: (command: string) => void;
  onCommandResult?: (r: CommandResult) => void;
  commandTimeoutMs?: number;
  /** Abort signal of the active run; a cancelled run kills its running command. */
  runSignal?: () => AbortSignal | undefined;
}

const runCommandShape = {
  command: z.string().min(1).describe('One program with arguments, e.g. "pytest tests/test_cli.py -q". No shell operators.'),
  cwd: z.string().optional().describe('Workspace-relative working directory (default: workspace root).'),
};

/**
 * Normalise gated-tool arguments exactly as the MCP server will see them (zod strips unknown keys),
 * so the approval fingerprint made from the model's tool call matches the invocation TrueForge sends.
 */
export function normalizeGatedArgs(tool: string, args: unknown): Record<string, unknown> | null {
  const schema = tool === TOOL.proposeEdit ? z.object(proposeEditShape) : tool === TOOL.runCommand ? z.object(runCommandShape) : null;
  if (!schema) return null;
  const r = schema.safeParse(args);
  return r.success ? (r.data as Record<string, unknown>) : null;
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) });

function guard<A>(fn: (a: A) => Promise<ReturnType<typeof text>>) {
  return async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      const msg = e instanceof PathPolicyError ? `Refused: ${e.message}` : `Error: ${(e as Error).message}`;
      return text(msg, true);
    }
  };
}

export function buildMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: '0.1.0' },
    {
      instructions:
        'Editor tools for the open VS Code workspace. Start with assemble_context for any non-trivial task; it returns ranked, ' +
        'budgeted context and explains why each file was chosen. All paths are workspace-relative. propose_edit and run_command ' +
        'are reviewed by the user before they run; a denial includes the reason.',
    },
  );

  server.registerTool(
    TOOL.assemble,
    {
      title: 'Assemble task context',
      description:
        'Rank the repository for a task and return the most relevant code, tests and docs within a token budget, with the reason each file was chosen. Call this first.',
      inputSchema: {
        task: z.string().min(3).describe('The user request, verbatim.'),
        mentions: z.array(z.object({ kind: z.enum(['file', 'symbol']), value: z.string() })).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ task, mentions }) => {
      const { receipt, bundle } = await deps.engine.assemble({ task, mentions: mentions ?? [], budgetTokens: deps.budgetTokens?.() ?? 24_000 });
      deps.onReceipt?.(receipt);
      return text(bundle);
    }),
  );

  server.registerTool(
    TOOL.readFile,
    {
      title: 'Read file',
      description: 'Read a workspace file with line numbers. Use start_line/end_line for large files.',
      inputSchema: {
        path: z.string().describe('Workspace-relative path.'),
        start_line: z.number().int().min(1).optional(),
        end_line: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ path, start_line, end_line }) => {
      const { rel } = resolveWorkspacePath(deps.host.root, path, 'read');
      if (!(await deps.host.exists(rel))) return text(`File not found: ${rel}`, true);
      const lines = (await deps.host.readText(rel)).split('\n');
      const start = start_line ?? 1;
      const end = Math.min(end_line ?? Math.min(lines.length, start + 799), lines.length);
      if (end < start) return text(`Empty range: ${start}-${end} (file has ${lines.length} lines).`, true);
      const body = lines
        .slice(start - 1, end)
        .map((l, i) => `${String(start + i).padStart(5)}| ${l}`)
        .join('\n');
      const more = end < lines.length ? `\n[showing lines ${start}-${end} of ${lines.length}; request more with start_line=${end + 1}]` : '';
      return text(`${rel}\n${body}${more}`);
    }),
  );

  server.registerTool(
    TOOL.search,
    {
      title: 'Search workspace',
      description: 'Case-insensitive literal (or regex) search across workspace text files. Returns file:line matches.',
      inputSchema: {
        query: z.string().min(1),
        glob: z.string().optional().describe('Optional path filter, e.g. "src/**/*.py".'),
        regex: z.boolean().optional(),
        max_results: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ query, glob, regex, max_results }) => {
      const r = await deps.engine.search(query, { ...(glob ? { glob } : {}), isRegex: regex ?? false, maxResults: max_results ?? 50 });
      if (!r.matches.length) return text(`No matches for "${query}".`);
      const lines = r.matches.map((m) => `${m.rel}:${m.line}: ${m.text}`).join('\n');
      return text(`${r.matches.length} match(es) in ${r.filesMatched} file(s)${r.truncated ? ' (truncated)' : ''}\n${lines}`);
    }),
  );

  server.registerTool(
    TOOL.findSymbol,
    {
      title: 'Find symbol',
      description: 'Find where a function, class, method or CLI command is defined and where it is referenced.',
      inputSchema: { name: z.string().min(1).describe('Symbol name, e.g. "get_debug_flag" or "FlaskGroup.get_command".') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ name }) => {
      const r = await deps.engine.symbol(name);
      if (!r.definitions.length && !r.references.length) return text(`No symbol named "${name}".`);
      const defs = r.definitions.map((d) => `def  ${d.rel}:${d.line}  ${d.signature}`).join('\n');
      const refs = r.references.map((x) => `ref  ${x.rel}:${x.line}  ${x.text}`).join('\n');
      return text([defs, refs].filter(Boolean).join('\n'));
    }),
  );

  server.registerTool(
    TOOL.related,
    {
      title: 'Related files',
      description: 'Files related to a file: modules it imports, modules importing it, its tests, and its documentation.',
      inputSchema: { path: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guard(async ({ path }) => {
      const { rel } = resolveWorkspacePath(deps.host.root, path, 'read');
      const edges = await deps.engine.related(rel);
      if (!edges.length) return text(`No known relations for ${rel}.`);
      return text(edges.map((e) => `${e.kind.padEnd(9)} ${e.from === rel ? e.to : e.from}  (${e.reason})`).join('\n'));
    }),
  );

  server.registerTool(
    TOOL.proposeEdit,
    {
      title: 'Propose edit',
      description:
        'Propose a change to one file. The user reviews it hunk by hunk in the editor before anything is written; only accepted hunks are applied. ' +
        'Prefer `edits` with exact old_text copied from read_file output (without the line-number prefix). Call once per file.',
      inputSchema: proposeEditShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    guard(async (args) => {
      const grant = deps.approvals.consume<{ proposalId: string }>(TOOL.proposeEdit, args);
      if (!grant) {
        return text(
          'Not applied: this exact edit was not approved by the user in AXIOM Forge, so no file was changed. ' +
            'Edits are only written after review in the editor.',
          true,
        );
      }
      const outcome = await deps.safeChange.apply(grant.payload.proposalId);
      deps.onApplied?.(outcome);
      if (outcome.status === 'applied') {
        const p = deps.safeChange.get(outcome.proposalId);
        if (p) deps.engine.noteFileChanged(p.path, await deps.host.readText(p.path));
      }
      const note =
        outcome.rejectedHunks > 0
          ? ` The user rejected ${outcome.rejectedHunks} hunk(s); do not re-propose them unless asked. Re-read the file before further edits.`
          : '';
      return text(`${outcome.message}${note}`, outcome.status !== 'applied');
    }),
  );

  server.registerTool(
    TOOL.runCommand,
    {
      title: 'Run command',
      description:
        'Run one verification command in the workspace after user approval (allowed: python, pytest, flask, read-only git, npm test). ' +
        'Returns exit code and the tail of the output.',
      inputSchema: runCommandShape,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    guard(async (args) => {
      const grant = deps.approvals.consume(TOOL.runCommand, args);
      if (!grant) return text('Not run: this command was not approved by the user in AXIOM Forge.', true);
      const cwd = args.cwd ? resolveWorkspacePath(deps.host.root, args.cwd, 'read').abs : deps.host.root;
      deps.onCommandStart?.(args.command);
      const signal = deps.runSignal?.();
      const r = await runCommand(args.command, { workspaceRoot: deps.host.root, cwd, timeoutMs: deps.commandTimeoutMs ?? 120_000, ...(signal ? { signal } : {}) });
      deps.onCommandResult?.(r);
      const status = r.timedOut ? 'TIMED OUT' : r.exitCode === 0 ? 'PASSED' : 'FAILED';
      return text(`$ ${r.command}\nexit code: ${r.exitCode ?? 'none'} (${status}, ${r.durationMs} ms)\n${r.outputTail}`, r.exitCode !== 0);
    }),
  );

  return server;
}

export interface RunningMcpServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

/**
 * Serve the MCP server over Streamable HTTP on 127.0.0.1 only. Stateless: a fresh server+transport
 * per request. Rejects browser-originated requests (Origin header) and foreign Host headers
 * (DNS-rebinding protection).
 */
export function startMcpHttpServer(deps: McpDeps, port = 0): Promise<RunningMcpServer> {
  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(async (req, res) => {
      const actualPort = (httpServer.address() as AddressInfo).port;
      const host = (req.headers.host ?? '').toLowerCase();
      if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) {
        res.writeHead(403).end('forbidden host');
        return;
      }
      if (req.headers.origin && req.headers.origin !== 'null') {
        res.writeHead(403).end('browser origins are not allowed');
        return;
      }
      if (!req.url?.startsWith('/mcp')) {
        res.writeHead(404).end();
        return;
      }
      try {
        let body: unknown;
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const c of req) {
            size += (c as Buffer).length;
            if (size > 2_000_000) {
              res.writeHead(413).end();
              return;
            }
            chunks.push(c as Buffer);
          }
          body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
        }
        const server = buildMcpServer(deps);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: (e as Error).message }, id: null }));
      }
    });
    httpServer.on('error', reject);
    httpServer.listen(port, '127.0.0.1', () => {
      const p = (httpServer.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${p}/mcp`,
        port: p,
        close: () =>
          new Promise((r) => {
            httpServer.close(() => r());
            // TrueForge's MCP client keeps connections alive; drop them so shutdown is immediate.
            httpServer.closeAllConnections();
          }),
      });
    });
  });
}
