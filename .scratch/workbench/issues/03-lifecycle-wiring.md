# 03: Lifecycle wiring

**What to build:** Carry a draft's Work Item intent through server-side session creation, inherit Association on fork/clone while retaining the source, and remove all Associations for actually deleted sessions. Full creation/fork success means Association has been persisted; partial failures expose the generated id for Association-only recovery. Confirmed deletion is distinguished from live transient or temporarily unreadable sessions.

**Blocked by:** 02 (Session association)

**Status:** ready-for-agent

Reference: `.scratch/workbench/spec.md` section "Navigation and session lifecycle"; `docs/agents/sessions.md`, `docs/agents/tools.md`, and `docs/agents/files-and-access.md`. Integration points: `app/api/agent/new/route.ts`, command handling in `lib/rpc-manager.ts`, `hooks/useAgentSession.ts`, `components/AppShell.tsx`, and `app/api/sessions/[id]/route.ts`.

- [ ] New session from an item defaults to `projectRoot` and binds pending `workItemId` to that draft identity; parking/switching drafts does not transfer or lose intent, and ordinary new-session drafts stay unassociated
- [ ] The draft passes its intent whenever `/api/agent/new` initializes a real session, including System/Tools `ensure_session`. Server validates item and actual Project, persists Association before full success, and dispatches no first prompt until Association succeeds
- [ ] Client real-id promotion and fork callbacks only select/refresh; Association succeeds even without those callbacks or after the browser disconnects
- [ ] Server `fork`, `fork_branch`, and `clone` add the new session to the captured source Work Item and retain the source. Revalidation catches a concurrent source move/delete; unassociated sources remain unassociated, and in-session navigation keeps its existing Association
- [ ] Association-write failure after native creation returns `association_pending` with real `sessionId`, intended `workItemId`, and the spec's cause/status; UI exposes retry/explicit attach, with a new target choice if the old item was deleted. Recovery operates on that id, rechecks conflicts, and never automatically creates/forks again or resends a prompt
- [ ] A server crash between native creation and store write may leave a persisted unassociated session; it stays discoverable. No claim of atomicity across the two files or of recovering an unpersisted empty runtime after restart
- [ ] Lazy filtering includes persisted sessions and live wrappers with transient sessions. Stale/partial catalogues, inaccessible files, and failed discovery retain Associations as unavailable; only authoritative confirmed absence filters an id, without rewriting the store on reads
- [ ] In-app delete cleanup covers the complete set actually deleted, including cascaded subagents; Work Items survive, and a cleanup failure is visible with lazy-filter recovery. Subagents inherit no Association automatically
- [ ] Completed status is unchanged by session initialization, prompts, fork/clone, or cleanup; existing session tool presets and permission policy stay authoritative
- [ ] Behavior tests cover draft intent isolation, transient-live sessions, initialization without client callbacks, first-prompt gating, recoverable write failure without duplicate native operations, source-move races, all fork variants, unreadability versus absence, and cascaded deletion
