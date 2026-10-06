# Workbench implementation verification

Verified: 2026-10-07. Scope: spec and tickets 01–05; implementation on the current branch, preserving native pi behavior.

| Ticket | Completion evidence |
| --- | --- |
| 01 — Store, CRUD, navigation | Work Items store/route tests cover private atomic locked writes, an external first-writer race, malformed/version/domain failures preserving bytes, order/no-op timestamps, CRUD and combined PATCH. AppShell behavior/URL tests and E2E cover restore, repeated Create, current-session Resume and unsent draft retention. |
| 02 — Association | Store/API tests cover save-as, same-Project validation, stale-confirmation conflicts, atomic moves and harmless detach. UI behavior tests cover title prefill, declined move, conflict refresh/fresh confirmation, latest available session, unavailable members and completed status. |
| 03 — Lifecycle | New-route tests verify Association before the first prompt and expose generated ids without dispatch on failure. Native wrapper tests execute fork, fork_branch and clone without a client callback. Recovery tests verify source revalidation and no duplicate native operation. Real transient/malformed-header discovery verifies conservative liveness without store rewrites; deletion retains the item and strips all supplied deleted ids. |
| 04 — Outputs | Raw/nested/patch/MCP-negative/limit fixtures exercise evidence extraction. Real Git integration covers sibling writes, external commits/deletions, removed checkout roots and subdirectories, outside-path exclusion and unavailable Git. E2E verifies two checkouts with equal relative filenames and their actual diffs while the selected chat belongs to another Project. File tabs retain their source context. |
| 05 — UI/demo/docs | Desktop 1280px and mobile 390px E2E pass. Demo browser smoke covers list/detail/status/Outputs/resume/README viewer and narrow layout without page errors. Both app/demo locale sets contain 59 identical workbench keys across en/zh-CN/zh-TW. AGENTS file map, topic note and ADR are updated. |

## Final gates

- npm test: 2350 tests, 2333 passed, 0 failed, 17 existing environment/platform skips. Full runner completed normally.
- npm run lint: passed, no warnings/errors.
- Root and demo tsc --noEmit: passed.
- E2E_BROWSER_CHANNEL=msedge node e2e/run.mjs: passed at both widths, including the additional cross-Project Outputs scenario.
- Both code-review axes: no remaining confirmed blockers after repairs.
- No next build was run. Temporary dev servers were stopped; generated Next agent-rules suffix is excluded.

The full suite initially exposed Windows test-fixture issues (8.3 paths, distinct Jiti module instances, CRLF assertions, native teardown/startup). The runner and tests were repaired without weakening functional assertions. One earlier E2E run hit the existing reading-offset timing assertion during concurrent checks; the subsequent standalone full runner passed without a product change to scrolling.

Authoritative logs from this checkout: test-results/workbench-final-full-tests.log, workbench-final-lint.log and workbench-final-e2e.log. These generated files are ignored; the durable evidence mapping above is committed.
