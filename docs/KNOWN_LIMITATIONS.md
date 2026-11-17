# Known Limitations (honest list, kept current)

## Found in live runs (18 Nov)
- **Groq `gpt-oss-20b` can't finish a tool-using turn** (TrueForge echoes `reasoning_content`, Groq rejects it with HTTP 400; classified `bad_config`). **Groq `qwen-3-8-27b` works but is unreliable on the free tier**: 7,000 input tokens/minute (~2 agent requests per minute) and occasional malformed tool calls (`tool_use_failed`, now retried as `model_output`). With the compact inline profile (~1.1k tokens per request) Task C ran clean 3 of 3 times, 60 s apart; back-to-back runs within one minute can still hit the limit, and agent-mode (Task B) turns on this backup would exceed it.
- **Gemini free tier: 20 requests/day and 5/minute per model.** Long turns can hit the per-minute limit mid-run; daily quotas run out after a few runs. Plan rehearsals and recording around it, or use a paid key.
- Gemini occasionally returns no response headers before TrueForge's timeout (`Headers Timeout`, ~30–64 s); classified `timeout` and retried by ModelShield.

## Not yet verified
- Task B end to end on agent output; inline ⌘I UI and agent sidebar with a live model; same-file merging triggered by a real model. Tool calls, approval, deny, cancel, argument matching and fallback ARE verified live (`MODEL_KEY_CHECKLIST.md`, live results).
- **Extension-host responsiveness (A3).** Phase 3 profiled it (`PERFORMANCE.md`): the largest stalls in the VS Code test instance (1.5–2.4 s) are VS Code's own work (self time ≥ 85% VS Code). AXIOM's avoidable repeated work was fixed (MCP server pooling, patch-only webview posts, dirty-row timeline sync, lazy index rebuild). That test instance runs identical code 60–200× slower than plain Node, for reasons not established, so its absolute numbers are an upper bound. Not yet measured in a normal F5 session or during a real model stream: use `axiomForge.perfLog` + **Show Performance Report**.
- The negative SSRF case (TrueForge *without* `OUTBOUND_URL_ALLOWED_HOSTS` refusing our MCP server) was read in source but not re-run.

## SafeChange (Phase 3)
- **Same-file edits** in one approval pause are merged into one diff. Edits that overlap **or touch adjacent lines** are refused (conservative, like `git merge`) and the model is told to re-read and re-propose. Two calls that both create the same new file: the first wins.
- **Multi-file changes are applied as a change set** (everything approved in one review): every target is validated first; if a write fails, already-written files are restored and verified by read-back, and a restore that fails is reported by name. **This is not crash-atomic**: if VS Code or the machine dies between two writes, the files written so far stay written (the undo journal is only recorded on success). Neither the filesystem nor VS Code's per-file save offers a multi-file atomic commit.
- The **first approved `propose_edit` call of a set applies the whole set**; the others report the recorded result. If TrueForge never executes some approved calls (e.g. the run is cancelled between them), their edits are still written, because the user approved them in the same review. Undo is per file, not per set.
- `propose_edit` still can't delete or rename files.

## Retrieval (Phase 3)
- 33-task benchmark: 25/33 tasks have every needed file in the top 5 (76%), mean R@5 0.84, in-context recall 0.94. **On the 8 fresh tasks never used for tuning: 5/8 (63%), the same as before the Phase 3 changes.** The 80% target is not met. The systematic misses are big catch-all files (`app.py`, `sansio/app.py`, `test_basic.py`) and task words that match parts of identifiers (`handle_url_build_error`). See `RETRIEVAL_EVAL.md`.

## Design limits
- **Retrieval is lexical + structural** (with light stemming), not semantic: BM25 keyword scoring, file/folder-name matches, code-identifier definitions, regex symbol extraction, Python import graph, naming-convention test pairing, doc pairing. No embeddings. It's explainable and fast (~50 ms on Flask) but can miss conceptually related code with no shared vocabulary.
- **Symbol extraction is regex-based** (Python `def`/`class`, click `@command("name")`, basic TS/JS). No language server; nested functions and dynamic registration aren't modelled.
- **Token budget is estimated** as characters ÷ 4, not a real tokenizer; the budget is a guide, not a guarantee.
- **ModelShield runs in the extension**, because TrueForge 0.185 has no automatic model fallback ("planned" in its docs). Fallback starts a fresh TrueForge session on the backup with the original request; earlier-turn reasoning isn't carried over. It never replays after an approved write/command ran (`side_effects`), so the user decides.
- **Approval matching** relies on the model's tool arguments being passed unchanged by TrueForge to the MCP tool (we normalise both sides through the same zod schema). If TrueForge transformed arguments, the MCP tool would refuse safely (no write) and the run would need a retry. Unverified until runtime.
- `run_command` allows `python -c ...` after explicit approval, which is effectively arbitrary code in the workspace venv. It's gated by a modal approval, has a timeout and no shell, but it isn't sandboxed.
- New-file proposals are created via `WorkspaceEdit.createFile`; undo deletes the file.
- Single workspace folder only (the first folder).

## Fixture notes
- Flask 3.1.3 tests need `pytest==8.4.2` (from Flask's own `uv.lock`); newer pytest removed `_pytest.monkeypatch.notset`. `scripts/setup-flask-fixture.sh` pins it.
- On the pristine fixture, `tests/test_cli.py` passes 58/58. The full Flask suite has 1 pre-existing failure (`tests/test_reqctx.py::test_bad_environ_raises_bad_request`, from a newer Werkzeug) unrelated to AXIOM Forge.

## With another month
Language-server symbols (Pylance/pyright via VS Code's API), embedding re-ranking as an optional second stage, a real tokenizer per model, resuming a failed turn's context in the fallback session via TrueForge session history, an upstream TrueForge PR for model fallback and a documented loopback-MCP recipe.
