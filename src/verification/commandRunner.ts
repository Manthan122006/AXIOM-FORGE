import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { scrubSecrets } from '../shared/secrets';

export class CommandPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandPolicyError';
  }
}

export interface ParsedCommand {
  env: Record<string, string>;
  program: string;
  args: string[];
}

export interface CommandResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
  /** Last `maxOutputBytes` of combined stdout+stderr, secrets scrubbed. */
  outputTail: string;
  truncated: boolean;
}

/** Programs the agent may run. Everything is spawned without a shell. */
const ALLOWED_PROGRAMS = new Set(['python', 'python3', 'pytest', 'flask', 'git', 'node', 'npm', 'npx']);
const ALLOWED_GIT_SUBCOMMANDS = new Set(['status', 'diff', 'log', 'show', 'ls-files']);
const ALLOWED_NPM_SUBCOMMANDS = new Set(['test', 'run']);
/** Only harmless variables may be set by the agent (no PATH, PYTHONPATH, DYLD_*, NODE_OPTIONS...). */
const ALLOWED_ENV = /^(FLASK_[A-Z0-9_]+|PYTHONDONTWRITEBYTECODE|PYTHONUNBUFFERED|NO_COLOR|FORCE_COLOR|CI)$/;
const SHELL_META = /[|;&<>`$(){}\n\r]/;

/** Split a command line into tokens, honouring single and double quotes. No shell expansion. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && (command[i + 1] === '"' || command[i + 1] === '\\')) current += command[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
    } else if (/\s/.test(ch)) {
      if (hasToken) tokens.push(current);
      current = '';
      hasToken = false;
    } else {
      current += ch;
      hasToken = true;
    }
  }
  if (quote) throw new CommandPolicyError('Unterminated quote in command.');
  if (hasToken) tokens.push(current);
  return tokens;
}

/** Parse and validate a command against the allowlist. Throws CommandPolicyError when refused. */
export function parseCommand(command: string): ParsedCommand {
  if (typeof command !== 'string' || !command.trim()) throw new CommandPolicyError('Command is empty.');
  if (command.length > 2000) throw new CommandPolicyError('Command is too long.');
  // Shell metacharacters are refused outside quotes only; tokenize first, then check raw unquoted segments.
  const unquoted = command.replace(/"(?:\\.|[^"\\])*"|'[^']*'/g, '');
  if (SHELL_META.test(unquoted)) {
    throw new CommandPolicyError('Shell operators (|, ;, &, >, <, $, backticks) are not allowed; run one program at a time.');
  }
  const tokens = tokenize(command);
  const env: Record<string, string> = {};
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]!)) {
    const tok = tokens.shift()!;
    const eq = tok.indexOf('=');
    const name = tok.slice(0, eq);
    if (!ALLOWED_ENV.test(name)) throw new CommandPolicyError(`Setting environment variable ${name} is not allowed.`);
    env[name] = tok.slice(eq + 1);
  }
  const program = tokens.shift();
  if (!program) throw new CommandPolicyError('No program given.');
  if (program.includes('/')) throw new CommandPolicyError('Run programs by name (e.g. "pytest"), not by path.');
  if (!ALLOWED_PROGRAMS.has(program)) {
    throw new CommandPolicyError(`"${program}" is not an allowed program. Allowed: ${[...ALLOWED_PROGRAMS].join(', ')}.`);
  }
  if (program === 'git' && !ALLOWED_GIT_SUBCOMMANDS.has(tokens[0] ?? '')) {
    throw new CommandPolicyError(`Only read-only git subcommands are allowed: ${[...ALLOWED_GIT_SUBCOMMANDS].join(', ')}.`);
  }
  if (program === 'npm' && !ALLOWED_NPM_SUBCOMMANDS.has(tokens[0] ?? '')) {
    throw new CommandPolicyError('Only "npm test" and "npm run <script>" are allowed.');
  }
  if (program === 'npx' && !['vitest', 'tsc', 'eslint'].includes(tokens[0] ?? '')) {
    throw new CommandPolicyError('Only "npx vitest", "npx tsc" and "npx eslint" are allowed.');
  }
  return { env, program, args: tokens };
}

/** Prefer the workspace's virtualenv for Python tools so tests run against the checked-out code. */
export function resolveProgram(program: string, workspaceRoot: string): string {
  if (['python', 'python3', 'pytest', 'flask'].includes(program)) {
    for (const venv of ['.venv', 'venv']) {
      const candidate = path.join(workspaceRoot, venv, 'bin', program === 'python3' ? 'python' : program);
      if (existsSync(candidate)) return candidate;
    }
  }
  return program;
}

export interface RunOptions {
  workspaceRoot: string;
  /** Absolute cwd, already validated to be inside the workspace. */
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
}

/** Run an already-approved command. Never uses a shell. */
export function runCommand(command: string, opts: RunOptions): Promise<CommandResult> {
  const parsed = parseCommand(command);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxOutputBytes = opts.maxOutputBytes ?? 8_192;
  const cwd = opts.cwd ?? opts.workspaceRoot;
  const started = Date.now();

  return new Promise((resolve) => {
    let output = '';
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    const append = (buf: Buffer) => {
      const text = buf.toString('utf8');
      opts.onOutput?.(scrubSecrets(text));
      output += text;
      if (output.length > maxOutputBytes * 4) {
        output = output.slice(-maxOutputBytes * 2);
        truncated = true;
      }
    };

    const child = spawn(resolveProgram(parsed.program, opts.workspaceRoot), parsed.args, {
      cwd,
      shell: false,
      env: { ...process.env, ...parsed.env, PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    const kill = () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 2000).unref();
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    const onAbort = () => {
      cancelled = true;
      kill();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null, spawnError?: Error) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (spawnError) output += `\n[spawn error] ${spawnError.message}`;
      if (output.length > maxOutputBytes) {
        output = output.slice(-maxOutputBytes);
        truncated = true;
      }
      resolve({
        command,
        cwd,
        exitCode,
        signal,
        timedOut,
        cancelled,
        durationMs: Date.now() - started,
        outputTail: scrubSecrets(output),
        truncated,
      });
    };
    child.on('error', (err) => finish(null, null, err));
    child.on('close', (code, sig) => finish(code, sig));
  });
}
