/**
 * AXIOM Forge shared contracts.
 *
 * These are the ONLY shapes that cross module boundaries
 * (trueforge ↔ safety ↔ mcp ↔ context ↔ verification ↔ webview).
 * Change them only via a PR reviewed by Manthan; every member codes against this file.
 *
 * TrueForge wire types are NOT redeclared here — import them from
 * `@truefoundry/trueforge-sdk` (TrueForge.TurnStreamingEvent etc.). These types are
 * our own UI/domain state derived from those events.
 */

// ───────────────────────── Connection / session ─────────────────────────

export type ConnectionStatus =
  | { kind: 'disconnected'; reason: string }
  | { kind: 'connecting' }
  | { kind: 'connected'; baseUrl: string; serverVersion?: string };

export type McpStatus =
  | { kind: 'stopped' }
  | { kind: 'listening'; url: string }
  | { kind: 'error'; message: string };

export type TurnStatus = 'idle' | 'running' | 'paused' | 'done' | 'cancelled' | 'error';

export interface SessionState {
  sessionId: string | null;
  turnId: string | null;
  /** TrueForge model FQN actually used by this session, e.g. "google-gemini/gemini-2.5-flash". */
  model: string | null;
  /** 'primary' or 'backup' — which ModelShield slot the session runs on. */
  modelSlot: 'primary' | 'backup' | null;
  status: TurnStatus;
  /** Error text from turn.done{state.status:"error"}, verbatim (secrets scrubbed). */
  error?: string;
  /** Last SSE event id seen, for subscribeToTurn resume. */
  lastEventId?: string;
}

// ───────────────────────── Timeline (derived from TrueForge events) ─────────────────────────

export type AgentEvent =
  | { kind: 'user_message'; id: string; text: string; at: string }
  | { kind: 'assistant_text'; id: string; threadId: string; text: string; streaming: boolean; at: string }
  | { kind: 'tool_call'; id: string; threadId: string; call: ToolCallState }
  | { kind: 'subagent'; id: string; threadId: string; title: string; status: 'running' | 'done'; at: string }
  | { kind: 'compaction'; id: string; threadId: string; status: 'started' | 'finished'; at: string }
  | { kind: 'context_receipt'; id: string; receiptId: string; at: string }
  | { kind: 'recovery'; id: string; state: ModelRecoveryState; at: string }
  | { kind: 'verification'; id: string; resultId: string; at: string }
  | { kind: 'turn_end'; id: string; status: Exclude<TurnStatus, 'idle' | 'running' | 'paused'>; message?: string; at: string };

export type ToolCallPhase =
  | 'requested' // model.message carried the call
  | 'awaiting_approval' // tool.approval_required
  | 'approved'
  | 'denied'
  | 'running'
  | 'succeeded' // tool.response arrived, not an error
  | 'failed';

export interface ToolCallState {
  /** TrueForge tool call id (toolCallId). */
  toolCallId: string;
  /** MCP server name as registered in TrueForge, null for built-ins like create_sub_agent. */
  server: string | null;
  toolName: string;
  /** Arguments as sent by the model. Secret-looking values must be scrubbed before reaching the webview. */
  args: Record<string, unknown>;
  phase: ToolCallPhase;
  /** Short preview of tool.response content (≤ 2 KB). */
  resultPreview?: string;
  startedAt: string;
  finishedAt?: string;
  /** Present when this call is a propose_edit: links to the SafeChange proposal. */
  proposalId?: string;
}

// ───────────────────────── Context engine ─────────────────────────

export type RelevanceCategory =
  | 'explicit_mention' // @file / @symbol
  | 'selection' // active editor selection
  | 'implementation' // likely place to change
  | 'definition' // defines a referenced symbol
  | 'dependency' // imported by / imports a selected file
  | 'test'
  | 'documentation'
  | 'configuration';

export interface ContextSignal {
  /** e.g. 'keyword', 'path', 'symbol_def', 'import', 'test_pair', 'doc_pair', 'mention', 'selection' */
  signal: string;
  weight: number;
  /** Human-readable evidence, e.g. 'defines `get_debug_flag` (L27)'. */
  detail: string;
}

export interface ContextItem {
  path: string; // workspace-relative, POSIX separators
  category: RelevanceCategory;
  score: number;
  /** One-sentence reason shown in the Context Receipt. */
  reason: string;
  signals: ContextSignal[];
  symbols: string[];
  /** What was actually sent: whole file, outline only, or specific line windows. */
  inclusion: { mode: 'full' } | { mode: 'outline' } | { mode: 'ranges'; ranges: Array<[number, number]> };
  estTokens: number;
}

export type ExclusionReason = 'low_relevance' | 'duplicate' | 'over_budget' | 'too_large' | 'ignored' | 'secret' | 'binary';

export interface ExcludedItem {
  path: string;
  reason: ExclusionReason;
  detail: string;
  score?: number;
}

export interface ContextBudget {
  /** Configured total budget in estimated tokens. */
  limitTokens: number;
  usedTokens: number;
  perFileCapTokens: number;
  /** Estimation method, stated honestly in the UI and write-up. */
  estimator: 'chars_div_4';
  truncated: boolean;
}

export interface ContextReceipt {
  id: string;
  task: string;
  createdAt: string;
  strategy: string; // short statement of the retrieval strategy used
  selected: ContextItem[];
  excluded: ExcludedItem[];
  budget: ContextBudget;
  /** Index stats so judges can see the repo is bigger than the context. */
  repo: { files: number; indexedLines: number; estTokensTotal: number };
}

// ───────────────────────── SafeChange ─────────────────────────

export type HunkDecision = 'pending' | 'accepted' | 'rejected';
export type HunkApplyState = 'not_applied' | 'applied' | 'reverted' | 'failed';

export interface DiffHunk {
  id: string; // `${proposalId}:${index}`
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Unified-diff lines, each prefixed with ' ', '+', or '-'. */
  lines: string[];
  decision: HunkDecision;
  applyState: HunkApplyState;
}

export type ProposalStatus =
  | 'staged' // waiting for the user
  | 'decided' // user decided every hunk, approval sent to TrueForge
  | 'applied' // ≥1 hunk written
  | 'rejected' // all hunks rejected → deny sent
  | 'conflict' // file changed since proposal (baseHash mismatch)
  | 'discarded' // turn cancelled / model failure before apply
  | 'undone'
  | 'failed';

export interface ProposedEdit {
  id: string;
  /** TrueForge tool call that carries this proposal; approval is answered against it. */
  toolCallId: string;
  sessionId: string;
  turnId: string;
  path: string; // workspace-relative
  isNewFile: boolean;
  rationale: string;
  /** sha256 of the document text the diff was computed against. */
  baseHash: string;
  hunks: DiffHunk[];
  status: ProposalStatus;
  createdAt: string;
}

export type ApprovalState =
  | { kind: 'none' }
  | { kind: 'pending'; toolCallId: string; proposalIds: string[] }
  | { kind: 'sent'; toolCallId: string; decision: 'allow' | 'deny'; reason?: string };

export interface UndoEntry {
  proposalId: string;
  path: string;
  preImage: string;
  postHash: string;
  appliedAt: string;
}

// ───────────────────────── Verification ─────────────────────────

export type VerificationStatus = 'not_run' | 'running' | 'passed' | 'failed' | 'skipped' | 'error' | 'timed_out';

export interface VerificationResult {
  id: string;
  command: string;
  cwd: string;
  status: VerificationStatus;
  exitCode: number | null;
  durationMs: number | null;
  /** Last ≤ 4 KB of combined output, secret-scrubbed. */
  outputTail: string;
  /** Files modified (by applied proposals) when the command ran. */
  filesAtRun: string[];
  /** True if any file changed after this result was produced. */
  stale: boolean;
  startedAt: string;
}

// ───────────────────────── ModelShield ─────────────────────────

export type FailureClass =
  | 'auth' // invalid / missing key
  | 'unreachable' // DNS / connect refused / blocked URL
  | 'rate_limit'
  | 'server' // 5xx from provider
  | 'timeout'
  | 'bad_config' // unknown model name etc.
  | 'cancelled' // user cancellation — never a provider failure
  | 'tool_error'
  | 'unknown';

export type ModelRecoveryState =
  | { kind: 'healthy'; model: string }
  | { kind: 'failed'; model: string; failure: FailureClass; message: string }
  | { kind: 'retrying'; model: string; attempt: number; maxAttempts: number; delayMs: number }
  | { kind: 'switching'; from: string; to: string }
  | { kind: 'recovered'; model: string; slot: 'backup' }
  | { kind: 'exhausted'; tried: string[]; message: string };

// ───────────────────────── Whole UI state + messages ─────────────────────────

export interface AxiomState {
  connection: ConnectionStatus;
  mcp: McpStatus;
  session: SessionState;
  timeline: AgentEvent[];
  receipts: Record<string, ContextReceipt>;
  proposals: Record<string, ProposedEdit>;
  approval: ApprovalState;
  undoStack: UndoEntry[];
  verification: Record<string, VerificationResult>;
  recovery: ModelRecoveryState;
}

/** Extension → webview. The webview is a pure function of AxiomState. */
export type HostToWebview =
  | { type: 'state'; state: AxiomState }
  | { type: 'mentionResults'; query: string; items: Array<{ kind: 'file' | 'symbol'; label: string; detail: string }> };

/** Webview → extension. Every mutating intent goes through here; the webview never writes files. */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'send'; text: string; mentions: Array<{ kind: 'file' | 'symbol'; value: string }> }
  | { type: 'cancel' }
  | { type: 'hunkDecision'; proposalId: string; hunkId: string; decision: Exclude<HunkDecision, 'pending'> }
  | { type: 'acceptAll'; proposalIds: string[] }
  | { type: 'rejectAll'; proposalIds: string[] }
  | { type: 'submitReview' } // sends allow/deny for the pending approval
  | { type: 'openDiff'; proposalId: string }
  | { type: 'undo'; proposalId: string }
  | { type: 'runVerification'; command: string }
  | { type: 'mentionQuery'; query: string }
  | { type: 'openSessionInTrueForge' };
