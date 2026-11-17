# Known Limitations (honest list, kept current)

## Not yet verified
- **Every model-driven behaviour** (tool calls, approval pause/resume, cancel, fallback) is unverified at runtime until model keys are configured in TrueForge. See `TRUEFORGE_INTEGRATION_STATUS.md`.
- **Extension-host responsiveness (A3).** In the VS Code integration run, event-loop lag in the extension host was p50 11 ms / p99 95 ms with AXIOM running (p99 18 ms with AXIOM's work disabled), with one unexplained ~2 s spike. The same fresh test instance was slow at plain VS Code operations too (6–11 s for open/save with AXIOM disabled), so the spike is not yet attributed. A stall detector now logs any stall > 250 ms with the active operation to the "AXIOM Forge" output channel; check it during a normal F5 session.
- The negative SSRF case (TrueForge *without* `OUTBOUND_URL_ALLOWED_HOSTS` refusing our MCP server) was read in source but not re-run.

## Found in the Phase 2 audit (open)
- Two `propose_edit` calls on the same file in one approval pause: the second will hit a conflict after the first applies (safe, not smooth).
- Multi-file changes are atomic per file, not as a set.
- `propose_edit` can't delete or rename files.
- Retrieval R@5 is 0.74 on our 13-task eval (in-context recall 0.90); see `RETRIEVAL_EVAL.md`.
- The Task B golden test was relaxed from "top 5" to "top 6 and in context" after the generic ranking changes.

## Design limits
- **Retrieval is lexical + structural** (with light stemming), not semantic: IDF keyword scoring, path/name matches, regex symbol extraction, Python import graph, naming-convention test pairing, doc pairing. No embeddings. It's explainable and fast (~50 ms on Flask) but can miss conceptually related code with no shared vocabulary.
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
