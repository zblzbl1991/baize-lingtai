# Adopt the Work Item / Workbench domain from BaizeBuddy; freeze BaizeBuddy as reference

BaizeBuddy Local (a separate, now-frozen project) already designed the "durable work object" layer Pi Web wanted: Work Items that group agent sessions and their outputs, browsed through a Workbench. Maintaining two products for one concept has no payoff, so Pi Web adopts the domain — Work Item (工作目标), Workbench (工作台), explicit single-Work-Item session association — and BaizeBuddy becomes a read-only reference: its glossary, Workbench HTML prototypes, and UX reviews are citation material, and its concepts may be cut freely to fit Pi Web.

Considered: keeping BaizeBuddy alive as a separate office-worker product line (rejected — duplicate cost with no separate payoff); porting its runtime layers alongside the concepts — Ask/Full Access permission language, Run/Execution Attempt, Task Skills, OfficeCLI (rejected — Pi Web keeps pi's native tool presets and stays a thin UI over pi).

Settled shape from the adoption interview: a Work Item belongs to exactly one Project (BaizeBuddy's Working Directory concept is absorbed by Project); Work Item state lives in a Pi Web-owned JSON store following the `pi-web-session-index.json` / `web-push.json` precedent, not in pi session files or a database; the lifecycle is two-state (in progress / completed, user-driven); the Workbench is a separate cross-Project view, with a fuller dashboard only a possible later step; BaizeBuddy's "no retroactive artifact claiming" rule is deferred until outputs attribution deepens.

## Clarifications after design review (2026-10-06)

- The JSON store is authoritative user data. Reuse the private atomic-write helper and add locked mutations; the session index's best-effort persistence and rebuild-on-corruption behavior do not apply.
- Project identity groups worktrees; it does not replace a session's working directory for resolving Outputs or selecting its checkout's Git diff.
- Association inheritance adds a fork to the same Work Item and retains the source. Creation and fork endpoints settle Association on the server before reporting full success; filesystem and store writes remain separate operations with explicit partial-failure recovery.
- Completion is an organizational status, not another agent permission policy. Only an explicit status action completes or reopens a Work Item; ordinary session operations remain available.
- Outputs are a bounded projection of supported writes in currently associated transcripts, including writes before an explicit attach. They do not retain historical file bytes or attribute the current working-tree diff exclusively to one Work Item. Shell writes and MCP names without local-write evidence are outside the initial extraction coverage.
- Association metadata records the checkout boundary validated at establishment. After a checkout disappears, cwd alone cannot distinguish a legal sibling write from an outside path; the saved boundary preserves missing-path rows without authorizing existing files or retaining file versions.

The detailed contracts and ticket acceptance criteria live in `.scratch/workbench/spec.md` and `.scratch/workbench/issues/`.
