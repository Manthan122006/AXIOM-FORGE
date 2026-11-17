import { realpathSync, existsSync } from 'node:fs';
import path from 'node:path';

export class PathPolicyError extends Error {
  constructor(
    message: string,
    readonly code: 'empty' | 'invalid' | 'outside_workspace' | 'denied' | 'symlink_escape',
  ) {
    super(message);
    this.name = 'PathPolicyError';
  }
}

export type AccessMode = 'read' | 'write';

/** Paths the agent may never read or write (secrets, VCS internals, environments). */
const DENY_ALWAYS: Array<{ test: (rel: string) => boolean; why: string }> = [
  { test: (r) => r === '.git' || r.startsWith('.git/'), why: 'git internals' },
  { test: (r) => /(^|\/)\.env(\..*)?$/.test(r) && !r.endsWith('.env.example'), why: 'environment/secret file' },
  { test: (r) => /\.(pem|key|p12|pfx|keystore|jks)$/i.test(r), why: 'key material' },
  { test: (r) => /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(r), why: 'SSH key' },
  { test: (r) => /(^|\/)(\.npmrc|\.pypirc|\.netrc|credentials(\.json)?)$/.test(r), why: 'credentials file' },
  { test: (r) => r === 'config/models.local.json', why: 'local model configuration' },
];

/** Additional paths that may be read but never written. */
const DENY_WRITE: Array<{ test: (rel: string) => boolean; why: string }> = [
  { test: (r) => /(^|\/)(node_modules|\.venv|venv|__pycache__|\.tox|dist|build)(\/|$)/.test(r), why: 'generated or vendored directory' },
  { test: (r) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock)$/.test(r), why: 'lockfile' },
];

/** Realpath of the deepest existing ancestor of `abs` (so new files can be checked too). */
function realpathOfExistingAncestor(abs: string): string {
  let current = abs;
  const rest: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(realpathSync(current), ...rest);
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve an agent-supplied path against the workspace root and enforce policy.
 * Accepts workspace-relative paths (preferred) or absolute paths inside the root.
 * Returns the absolute path and the normalised workspace-relative POSIX path.
 */
export function resolveWorkspacePath(
  rootInput: string,
  input: string,
  mode: AccessMode,
): { abs: string; rel: string } {
  if (typeof input !== 'string' || input.trim() === '') throw new PathPolicyError('Path is empty.', 'empty');
  if (input.includes('\0')) throw new PathPolicyError('Path contains a NUL byte.', 'invalid');

  let decoded = input.trim();
  // Agents sometimes send URL-encoded paths; decode once and re-check.
  if (/%[0-9a-f]{2}/i.test(decoded)) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      throw new PathPolicyError('Path has invalid percent-encoding.', 'invalid');
    }
  }
  if (decoded.startsWith('file://')) decoded = decoded.slice('file://'.length);
  if (decoded.startsWith('~')) throw new PathPolicyError('Home-relative paths are not allowed.', 'outside_workspace');

  const root = realpathSync(rootInput);
  const abs = path.resolve(root, decoded.replace(/\\/g, '/'));
  if (!isInside(root, abs)) {
    throw new PathPolicyError(`Path "${input}" is outside the workspace.`, 'outside_workspace');
  }
  const real = realpathOfExistingAncestor(abs);
  if (!isInside(root, real)) {
    throw new PathPolicyError(`Path "${input}" resolves through a symlink to outside the workspace.`, 'symlink_escape');
  }

  const rel = path.relative(root, abs).split(path.sep).join('/');
  if (rel === '') throw new PathPolicyError('Path refers to the workspace root, not a file.', 'invalid');
  const rules = mode === 'write' ? [...DENY_ALWAYS, ...DENY_WRITE] : DENY_ALWAYS;
  for (const rule of rules) {
    if (rule.test(rel)) throw new PathPolicyError(`Access to "${rel}" is not allowed (${rule.why}).`, 'denied');
  }
  return { abs, rel };
}

/** True for paths the context engine and search must skip entirely. */
export function isSecretPath(rel: string): boolean {
  return DENY_ALWAYS.some((r) => r.test(rel));
}
