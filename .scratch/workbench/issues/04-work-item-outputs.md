# 04: Work Item Outputs

**What to build:** Detail lazily lists files with supported successful local-write evidence in currently associated sessions. Resolve paths against each source session's cwd, preserving checkout identity for file viewing and current Git diffs. Expose incomplete extraction and unavailable files honestly. This is a path/current-file projection, not a retained artifact history or a Work Item-exclusive change ledger.

**Blocked by:** 02 (Session association) — does not depend on 03

**Status:** done

Reference: `.scratch/workbench/spec.md` section "Outputs"; `docs/agents/sessions.md` and `docs/agents/files-and-access.md`. Existing seams: `lib/turn-written-files.ts`, `lib/normalize.ts`, `lib/session-file-references-core.ts`, SDK structured `nestedCalls`, and file/Git viewers. This ticket depends on 02's store/Association contract, not 03's lifecycle wiring.

- [x] `GET /api/work-items/[id]/outputs` returns the spec's rows plus `incomplete`/`reasons`; reads are lazy and bounded by explicit session/byte/line/time/response limits
- [x] Scan raw messages across branches and compacted history; include supported writes before attach, require paired successful top-level results, and preserve local `apply_patch` applied-file/partial-failure behavior
- [x] Structured nested pi `write`/`edit` with `status: "ok"` and full arguments count even after parent Code mode failure; omitted/unfinished nested records make coverage incomplete. Display strings or scripts do not substitute for structured evidence
- [x] Unsupported nested patches, shell-created files, and MCP name variants without nested local coding-write evidence are excluded and their coverage is documented; an MCP-looking name or coincident local file alone never creates an Output
- [x] Relative paths use each source cwd; rows retain source session/cwd and checkout root, deduplicate with Windows-aware server path rules, select latest evidence with deterministic ties, sort known last-write times descending then path ascending (unknown times last), and preserve identical relative names in different worktrees as different files
- [x] Include only authorized files in this Project's actual checkouts; link escapes/outside-Project files are omitted with a reason. Removed worktrees retain original paths instead of falling back to similarly named main-checkout files
- [x] Current state distinguishes changed, clean tracked, non-Git, missing/deleted, and unknown/unavailable files. Git status uses the actual checkout root, including writes to siblings of a session subdirectory; changed files link to a supported diff there, missing files have no open/diff action, and unsupported diffs have a visible state
- [x] Opening a row uses its path, sourceSessionId, and checkout root (source cwd for non-Git files) even if the selected chat is in another Project. Diff copy says current working-tree changes, which may include contributions from elsewhere
- [x] Extraction cache freshness includes membership plus source fingerprints/live revisions; detail entry, completed runs, and Association edits refresh the projection. Current file/Git states are reread on Outputs refresh even without transcript changes. Detaching/deleting a source removes only its evidence contribution
- [x] Partial scans/unreadable sources/omitted nested arguments return incompleteness reasons and visible partial-results copy, including an empty partial list
- [x] Fixture behavior tests cover successful/failed/partial writes, nested writes and parent errors, negative MCP variants, branches/compaction/fork dedup, subdirectory/sibling/two-worktree/Windows paths, access filtering, cache freshness, truncation, and current file-state/diff changes after external edit/commit/deletion without new transcript entries
- [x] Existing e2e runner covers create → associate fixture write session → Outputs → complete → refresh/reopen, plus correct file/diff routing across worktrees and when another chat Project is selected

## Comments

### Final verification (2026-10-07)

Bounded raw Outputs and current file/diff projection are complete. Server-validated checkout metadata preserves removed-checkout sibling paths without granting access; Git failures and partial results are explicit. See [verification](../verification.md) for requirement-to-evidence mapping and current counts; this supersedes earlier intermediate test totals. Full suite: 2333 passed, 0 failed, 17 existing skips; typecheck, lint, desktop/mobile E2E and demo browser smoke pass.
