# 02: Session association

**What to build:** Save an unassociated session as a new Work Item or attach/move it explicitly to one in the same Project. Detach changes only Association metadata. Detail lists member sessions with running/unavailable states and offers one-click resume of the latest available session. The server enforces one Work Item per session, same-Project checks, and conflict-safe moves.

**Blocked by:** 01 (Workbench view and Work Item CRUD)

**Status:** ready-for-agent

Reference: `.scratch/workbench/spec.md` sections "API and Association" and "Navigation and session lifecycle"; `CONTEXT.md`; ADR 0007. Existing code: `lib/project-groups.ts`, `lib/project-identity.ts`, session-list/running-registry merge, and AppShell selection paths.

- [ ] Save-as atomically creates and associates in the session's server-derived Project with its title prefilled; an already-associated source uses the move flow instead. Initial `sessionIds` creation validates every session before a single write
- [ ] The picker filters by Project, and server validation independently rejects cross-Project sessions while allowing worktrees of one repository and equivalent Windows paths
- [ ] `POST /api/work-items/[id]/sessions` implements `{ sessionId, expectedWorkItemId }`: null for unassociated attach, exact confirmed source id for move; the current target is an idempotent no-op
- [ ] A stale source expectation returns `409 association_conflict` and the current item id; UI refreshes and obtains a new move confirmation. Concurrent moves cannot silently replace the user's confirmed source
- [ ] Move removes/adds Associations in one locked store write; save-as or move failure leaves all previous items/Associations unchanged
- [ ] `DELETE /api/work-items/[id]/sessions/[sessionId]` affects only that target Association and is harmless after a prior detach/move; no session file changes
- [ ] A valid hand-edited duplicate uses the spec's deterministic smallest-item-id winner at read time; reads preserve disk bytes, and successful mutations normalize duplicates
- [ ] Detail sorts sessions by current `modified` descending then id ascending, retains unavailable state, and uses the existing running indicator; selected session opens chat in its actual cwd/worktree
- [ ] One-click resume opens the newest available session; empty/unavailable-only items offer a clear New session entry wired in 03
- [ ] Attaching/detaching/resuming does not implicitly reopen completed items or change native session permissions
- [ ] Temp-directory/route behavior tests cover save-as atomicity, cross-Project rejection, worktree equivalence, duplicates, idempotency, stale-confirmation races, move/detach, and activity ordering; UI tests cover confirmation, conflict refresh, latest-session resume, unavailable states, and completed status
