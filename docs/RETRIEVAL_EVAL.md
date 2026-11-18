# Retrieval Evaluation (Flask 3.1.3)

Run: `npx tsx scripts/eval-retrieval.ts` (table), `--ablate` (signal ablation), `--json` (raw). Debug a task's ranking with `npx tsx scripts/debug-retrieval.ts E8 H12`. Raw outputs are in `docs/evidence/retrieval-*.txt`.

## Phase 3 result: target NOT met on the honest measure

The target was "≥ 80% of ≥ 18 tasks with every needed file in the top 5, without task-specific tuning".

| Split | n | How it was used | Tasks fully in top 5 (before → after) | Mean R@5 | Mean R@10 | In-context recall |
|---|---|---|---|---|---|---|
| dev (A, B, E1–E11) | 13 | tuned on in Phase 2 and Phase 3 | 5 → **10** (77%) | 0.74 → 0.90 | 0.90 → 1.00 | 0.90 → 1.00 |
| held-out (H1–H12) | 12 | committed before Phase 3 changes (`548bb47`), but I **inspected H6/H8/H10/H12 rankings** while designing the changes, so it is partly contaminated | 8 → **10** (83%) | 0.83 → 0.92 | 0.92 → 0.96 | 0.92 → 0.96 |
| **fresh (F1–F8)** | 8 | written after the changes, committed, scored once, **never tuned on** | 5 → **5** (63%) | 0.69 → **0.63** | 0.81 → 0.81 | 0.88 → **0.81** |
| all | 33 | | 18 → **25** (76%) | 0.76 → 0.84 | 0.88 → 0.94 | 0.90 → 0.94 |

Only the fresh split measures generalisation. On it, the Phase 3 ranking is **no better** than Phase 2: one task improved (F3), one regressed (F1 lost both files from the context), F4 moved inside the context but not into the top 5. The aggregate gain mostly comes from tasks I could see. I kept the new ranking because Tasks A and B are both fully in the top 5 and the 33-task aggregate is higher, but **the 80% target is not met**: 76% overall, 63% on unseen tasks. I did not change the ranking after scoring F1–F8.

Other measurements (all 33 tasks, after):
- **Latency**: p50 21 ms, max 42 ms per `assemble` on a warm index; indexing the repo 30–50 ms.
- **Context size**: mean 23.2k of the 24k budget (the packer fills the budget); repo ≈ 285k tokens.
- **Precision@5**: 0.34 → 0.38. Share of context tokens spent on ground-truth files: 22% → 24%. The rest is neighbours (often useful: imported modules, sibling tests) but this is real budget pressure.
- **Duplicates**: 0 in every task (one entry per file by construction; line windows inside a file are merged).

## Ablation (which signals matter), all 33 tasks

```
signal switched off → tasks fully in top 5 · mean R@5 · in-context
  none     25/33 · 0.84 · 0.94
  keyword  17/33 · 0.73 · 0.84      BM25 keyword relevance
  path     20/33 · 0.75 · 0.85      file/folder-name matches
  symbol   24/33 · 0.81 · 0.92      definitions of named identifiers
  imports  24/33 · 0.81 · 0.92      one-hop import neighbours
  pairing  18/33 · 0.78 · 0.91      test/doc ↔ implementation pairing
```
Keyword relevance, file names and test/doc pairing carry most of the ranking. Symbol definitions and imports help one task each on this benchmark.

## What changed in Phase 3 (all generic; no file names, no task words, no Flask special cases)
1. **BM25 keyword scoring** (IDF + term-frequency saturation + file-length normalisation) replaced capped TF-IDF. Before, most candidates hit the same 35-point cap, so keyword evidence couldn't separate a focused module from a big file that mentions everything.
2. **File-name matches count distinct name parts**, so "config" + "configuration" score `config.py` once, not twice. Parent folder names add a weaker match (`json/tag.py` for "json").
3. **Code-shaped identifiers** (snake_case, CamelCase, dotted, backticked) that are *defined* in a file are a strong signal (45). Plain English words that happen to equal a function name ("get", "error") are weak, scaled by 1/√(number of definitions with that name). Definitions inside test files count a third.
4. **Pairing scaled by evidence and in both directions**: implementation → tests/docs scaled by how strong that implementation is (weak inferred pairs count half); a test or doc page that strongly matches the task boosts the implementation it's named after (naming-convention pairs only).
5. **Stemming**: doubled consonants and short plurals ("tagging", "tags" → "tag"; "class" kept).
6. Task B golden test is back to **top 5** (it was relaxed to top 6 in Phase 2). A new regression test fails if the 33-task benchmark drops below 25/33 fully-in-top-5 or 0.93 in-context recall.

## Failure analysis (after)

| Task | Expected rank | Why it misses |
|---|---|---|
| E1 session samesite | `test_basic.py` 6 | session cookie tests live in the catch-all `test_basic.py`; no naming link to `sessions.py` |
| E5 flash categories | `test_basic.py` 6 | same catch-all module |
| E6 template filter | `sansio/app.py` 6 | default Jinja filters are registered inside the 1000-line app module; BM25 length normalisation penalises it |
| H3 copy ctx async | `test_reqctx.py` 7 | test module named after "request context", task says "request context" only through the identifier |
| H10 async install hint | `app.py` not in context | the relevant code (`async_to_sync`) isn't named; "async" + "install" also match docs pages strongly |
| F1 build error params | both missing | "building a URL fails" ≈ `handle_url_build_error` in `sansio/app.py`; a lexical engine doesn't decompose identifiers into words, and both target files are very large |
| F4 accepts json | `wrappers.py` 6, `test_request.py` out | "request property" spreads across many request-related modules |
| F8 response tuple headers | `app.py` 6, `test_basic.py` 9 | big catch-all files again |

Two systematic causes: **(1)** large catch-all files (`app.py`, `sansio/app.py`, `test_basic.py`) are penalised by length normalisation, and **(2)** the engine matches words to words but not words to the parts of identifiers (`build` + `url` → `handle_url_build_error`).

## Next steps (owner: Kunjal; must be validated on a *new* fresh split)
- Identifier decomposition: index the word parts of every definition name and score task words against them (fixes F1-type misses).
- Try a lower BM25 `b` for code than for prose, or a per-language average length.
- Write ≥ 10 more fresh tasks *before* trying either, commit them, and report the before/after on those only.

## 18 Nov: two generic fixes found during the product demo
- A file- or folder-name match now only counts for words that appear in fewer than half the repo's files. Before, "flask" (in almost every file) made `templating.py`, `testing.py`, `__init__.py`, `typing.py` look relevant to any question mentioning Flask. Question words ("where", "whether", "why", …) joined the stop list.
- The bundle header line for each file is now charged to the budget, so the whole bundle stays within 24k (it overran by ~120 tokens).
- 33-task benchmark: **unchanged** (25/33 fully in top 5, R@5 0.84, in-context 0.94; fresh 5/8).

## History
- Phase 1 engine, 13 tasks: mean R@5 0.74, in-context 0.81 (with task-specific stop words, removed in Phase 2).
- Phase 2, 13 tasks: R@5 0.74, in-context 0.90, 5/13 fully in top 5.
- Phase 3, 33 tasks: above.
