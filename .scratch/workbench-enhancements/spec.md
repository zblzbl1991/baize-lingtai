# Spec: Workbench small enhancements

Status: in-progress
Baseline: `8adee8722c1de9bb44e102a907e3b6ae156f4417`
Integration branch: `codex/workbench-enhancements`

## Contract and scope

Implement the user's confirmed [decision map](../workbench-small-enhancements/map.md), keeping Pi Web a thin UI over pi. The original [Workbench spec](../workbench/spec.md), `CONTEXT.md`, ADR 0007 and `docs/agents/workbench.md` remain authoritative for Association, native sessions, completion, Outputs evidence and access.

This increment adds name search, running/unread card counts, optional recent-activity sorting, and clearer Output context/source navigation. It adds no store schema, session format, runtime, permission policy, API, scheduler, artifact versioning or new evidence coverage. Three ordered delivery batches are implementation issues under `issues/`; their blocking reflects the user's delivery order, not an invented runtime dependency.

## Name search and running counts

- A labeled search field filters Work Item names by trimmed, case-insensitive substring. Combine it with existing all/in-progress/completed filtering. Empty input restores the selected status list. No name match has a localized, actionable empty state distinct from having no Work Items at all.
- Keep Project grouping and original order by default. Do not search session titles or bodies or change server collection ordering.
- Cards separately show nonzero running-session counts, using current associated member `isRunning` values and existing refresh. A completed goal may have running sessions. Never auto-complete/reopen an item.
- Search belongs to the mounted Workbench view; exit/reentry or reload restores defaults. No URL or storage preference.

## Outputs context and sources

- Show friendly filename plus relative path, its actual checkout/directory, and latest supported-write timestamp. Allow long paths to wrap. Distinguish equal relative filenames in different worktrees and retain the original full path/context. For non-Git rows use source cwd as directory context; unknown time is visibly labeled.
- Add a localized source-session action using existing `onOpenSession(sourceSessionId)`. It opens the native session with its own cwd/worktree, not an invented tool-message position.
- Use available projected member metadata to label and determine the source action. Unavailable source sessions have a disabled action with visible explanation. A missing/unavailable file can still have an available source action.
- Source means the most recent determinable supported-write source retained by the current projection, not sole authorship, all contributors, retained versions or changes exclusively owned by this goal.
- Preserve file state, diff availability, partial scans and reasons, unknown time, and the current working-tree diff disclaimer. Missing/unavailable files keep current open/diff restrictions. Metadata display never grants access.

## Unread and recent activity

- Keep Sidebar's unread set, localStorage key, ownership, background-completion detection, notification suppression, subagent exclusion, re-run clearing and selected-session clearing intact.
- Expose unread changes through a read-only callback from Sidebar through AppShell to Workbench. No duplicate unread store or polling. Aggregate against current Association; hide zero counts. If the selected session finishes while Workbench is visible, continue treating it as selected under current native semantics.
- Opening a goal does not clear its members. Opening a session uses the existing single-session clear. Detach/move changes goal counts without clearing a session's unread marker.
- Recent activity is the maximum valid instant among Work Item `updatedAt` and available member `modified`. Empty/no-valid-member goals fall back to `updatedAt`. Ignore invalid/unknown member times and unavailable member rows; do not invent a new date or rewrite persisted metadata.
- Default remains original Work Item update order. Provide an optional recent-activity sort; group items by Project, sort group members by descending activity and id as stable tie break, and order groups by their newest matching member. Search/status filters apply before grouping. Derived activity is not successful progress or completion.
- Sort is current-view state only; exit/reentry and reload restore original default. Keep the server's ordering, URL and persisted settings unchanged.

## Native UI and demo

- Reuse ConfigButton, existing field styles and theme tokens. Keep 44px mobile controls, wrapping paths, visible focus/disabled reasons, and pi-web's density. Preserve mounted chat drafts, tabs and native session navigation.
- Mirror relevant components/helpers/CSS/locales into demo, preserving its unrelated AppShell, base-path and preview behavior. All added product strings live in `workbench.*`, in en/zh-CN/zh-TW.

## Agreed validation boundaries

The user confirmed these external behavior boundaries in the decision tickets and per-batch verification gate. Use existing repo tests at public component/helper seams; do not test private implementation order.

- Existing Workbench filter/group helpers: worked-example inputs and literal expected names/order/counts; invalid dates, offset timestamps, stable ties, immutable store metadata.
- Rendered Workbench/detail controls and their callbacks: search/status empty states, hidden zero counts, completion remaining organizational, correct file/source actions and visible unavailable/partial states.
- Sidebar-to-AppShell-to-Workbench state propagation: existing unread changes reach cards; opening one native session clears only its marker; expanding a goal does not clear it; Association changes update counts without writing unread state.
- Existing E2E navigation and real fixture sessions/checkouts: verify name search, cross-worktree files/source navigation, optional activity order, view reset, drafts/file routing, desktop/mobile behavior.

Each worker uses TDD at these agreed seams. Run appropriate targeted checks per batch, root/demo typechecks and lint, and final full test/E2E gates on integration. Browser-check desktop/mobile light/dark using existing local app/demo. Never run `next build`. Review integration against the pinned baseline on Standards and Spec axes before completion.

## Completion

All three implementation tickets done; required checks pass; code review has no confirmed outstanding issues. Record verification and report the integration branch. No PR or remote push is requested by this invocation.
