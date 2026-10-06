# 05: Polish and docs

**What to build:** The Workbench is comfortable everywhere and the repo documents it. A narrow-viewport pass over the Workbench view keeps it usable on mobile. The static demo tree gets a work-items mock so the GitHub Pages demo keeps rendering with the real AppShell. The repo's development notes describe the new area. Locale files are complete, and the whole suite is green.

**Blocked by:** 03 (Lifecycle wiring), 04 (Work Item Outputs)

**Status:** done

Reference: `.scratch/workbench/spec.md`; `CONTEXT.md`; ADR 0007. Read `docs/agents/client-platform.md` for mobile behavior and retain Pi Web's theme tokens instead of copying BaizeBuddy's design contract.

- [x] Mobile Workbench/detail/Association flows remain usable with the existing sidebar drawer and file-panel behavior, long names/paths, empty/unavailable members, conflicts, recovery, and partial Outputs; controls have accessible names and keyboard focus
- [x] The static demo renders list/detail/status/Association/Outputs states with minimal mocks; unrelated demo behavior stays unchanged
- [x] AGENTS.md lists the actual implemented files and links a `docs/agents/workbench.md` note describing the store's authority/error handling, draft intent/server Association recovery, Project versus session cwd, completed-status semantics, and output evidence/access/coverage limits
- [x] The topic note explicitly documents shell/unsupported MCP/nested-patch exclusions, bounded incomplete scans, evidence removal after detach/delete, no retained file versions, and current diffs potentially containing other work's changes
- [x] en, zh-CN, and zh-TW key sets align, including unavailable states, store failures, Association conflicts/retry, explicit reopen, and partial-results reasons
- [x] Typecheck, lint, relevant behavior tests, and the e2e runner pass; no `next build` during development. Verify refresh/URL navigation, draft preservation while switching views, latest-session resume, completed status, and cross-worktree file/diff routing

## Comments

### Final verification (2026-10-07)

Mobile, demo, locale parity and agent documentation are complete. Windows test portability was repaired; all final gates pass. See [verification](../verification.md) for requirement-to-evidence mapping and current counts; this supersedes earlier intermediate test totals. Full suite: 2333 passed, 0 failed, 17 existing skips; typecheck, lint, desktop/mobile E2E and demo browser smoke pass.
