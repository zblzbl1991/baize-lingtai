# 01: Workbench view and Work Item CRUD

**What to build:** The user opens the Workbench (工作台) from the top bar, creates named Work Items (工作目标) grouped by Project, renames/completes/reopens/deletes them, and filters by status. View switching preserves chat drafts, native runs, sidebar, and right file/terminal tabs. The versioned JSON store is authoritative user data, with private atomic writes, locked mutations, and explicit failures.

**Blocked by:** None (can start immediately)

**Status:** done

Reference: `.scratch/workbench/spec.md` sections "Work Item state and persistence", "API and Association", and "Navigation and session lifecycle"; `CONTEXT.md`; ADR 0007. Follow `docs/agents/files-and-access.md` for Project identity/access. Session Association UI and initial `sessionIds` creation support are delivered in 02; this ticket establishes the store and empty-item CRUD.

- [x] Top-bar toggle and `?view=workbench` survive refresh and remembered-session/cwd restoration; session/new-session selection returns to chat, with the existing write-before-replace guard and no conflicting URL rewrite
- [x] View switching preserves unsent drafts, selected chat/cwd, right-panel tabs, and running agents; returning to chat uses existing reconciliation
- [x] Create picks a recent Project and localized name; the server derives canonical Project identity, including Windows path equivalence and shared worktree grouping, without using a Work Item as a file-access grant
- [x] Rename, complete, and reopen update the list immediately; status no-ops preserve timestamps, complete sets `completedAt`, reopen clears it, and item order is `updatedAt` descending then id ascending
- [x] Completion changes only through explicit status actions; deleting an item preserves all native session files
- [x] `pi-web-work-items.json` uses `getAgentDir()`, a versioned validated schema, atomic 0600 writes, and lockfile-guarded read-modify-write with in-process serialization; each mutation rereads disk under the lock
- [x] Cache is keyed by store path and refreshed by disk fingerprint; only an absent store initializes empty. Corrupt/invalid/unknown-version/unreadable files and failed writes preserve existing bytes and surface typed errors to the UI
- [x] The store accepts injected session-discovery/liveness checks for 03; incomplete discovery cannot destructively erase stored Associations
- [x] API list/create/rename/status/delete follows the spec contract with bounded input validation and structured error responses; failed writes never render as successful edits
- [x] Temp-directory behavior tests cover CRUD, ordering/no-ops, two concurrent writers, cache refresh after external edits, agent-dir override, corrupt/unknown versions, and injected write failures preserving prior contents; route and navigation tests cover response/restore behavior
- [x] Every new UI string exists in en, zh-CN, and zh-TW under a shared `workbench` namespace

## Comments

- Store: `lib/work-items.ts` — versioned (`version: 1`) `pi-web-work-items.json` under `getAgentDir()`, UUID ids enforced on parse, strict per-record validation, locked read-modify-write (proper-lockfile + in-process `serializeByKey` chains), atomic 0600 writes via `writePrivateFileAtomicSync`, snapshot cache keyed by store path and refreshed by `(size, mtimeMs)` fingerprint. Corrupt stores, unknown versions, invalid records, and failed writes raise typed `WorkItemsStoreError` ("read"/"write") and preserve the bytes on disk. The absent destination is locked with realpath:false before initialization; rereading under that lock preserves another process’s first write.
- Ordering: every read path returns items sorted `updatedAt` desc, then id asc; cache snapshots are stored sorted.
- Discovery seam for 03: `readWorkItems(storePath, { sessionLiveness })` — `"absent"` sessions are filtered from the returned view only; the cache and disk are never rewritten by a read, and interrupted/failed discovery cannot erase stored Associations. `updateWorkItem` applies name+status in one locked write.
- API: `GET/POST /api/work-items`, `PATCH/DELETE /api/work-items/[id]` (UUID-checked ids, bounded name, absolute-path validation, cross-site/JSON content guards); shared helpers in `lib/work-items-api.ts` so route export validation in Next stays happy. `resolveWorkItemProject()` derives canonical Project identity (worktree-shared root + identity key); a Work Item never grants file access.
- View: `AppShell` `activeView` from `?view=workbench`; toggle in the top bar (`aria-pressed`); restore-time URL writes (remembered session, cwd validate) go through `hrefPreservingView()` so the Workbench survives reload/tab-restore; explicit session/new-session/project selections call `returnToChat()` (guarded `!isRestore` for session restore). The chat remains mounted while hidden; Work Item draft intent and parked text are isolated by goal.
- `WorkbenchView` fetches the list, groups by Project (recency order), filters by status (labels reuse `workbench.status.*`), and CRUD-failures re-fetch and surface a banner — a failed write never renders as a successful edit. All strings exist in en / zh-CN / zh-TW under `workbench.*`.
- Tests: 29 store/route/helper behavior tests on temp dirs + static navigation assertions (`AppShell.workbench-view.test.mjs`, `initial-navigation.test.mjs`) — 71 touched-area tests green; `tsc --noEmit` and `npm run lint` clean.
- Deferred to ticket 05 by its own checklist: AGENTS.md file map/topic-note updates.

### Final verification (2026-10-07)

Authoritative locking/schema/CRUD/navigation are complete, including first-writer preservation, strict persisted domain fields, mounted drafts and same-session Resume URL handling. See [verification](../verification.md) for requirement-to-evidence mapping and current counts; this supersedes earlier intermediate test totals. Full suite: 2333 passed, 0 failed, 17 existing skips; typecheck, lint, desktop/mobile E2E and demo browser smoke pass.
