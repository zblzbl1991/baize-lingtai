# 未读共享与最近活动排序

Status: ready-for-agent
Assignee: unassigned
Blocked by: 02
Spec: [Workbench small enhancements](../spec.md)
Decision: [工作目标卡片如何沿用原生运行与未读提示](../../workbench-small-enhancements/issues/01-activity-signals.md#answer), [工作目标如何按名称查找并表达最近活动](../../workbench-small-enhancements/issues/02-find-and-sort.md#answer)

## What to build

Pass Sidebar's existing unread set read-only through AppShell; aggregate nonzero member counts in cards without moving ownership or changing semantics. Add optional derived activity sorting in the existing filtered Project list, preserving current default and resetting view preferences on exit/reload.

## Acceptance

- [ ] Native unread generation, localStorage key, notification suppression, subagent exclusions and selected/re-run clearing unchanged; no extra poll/store.
- [ ] Cards aggregate current Associations; expanding does not clear; opening a session uses native clearing; move/detach updates counts without clearing the underlying marker.
- [ ] Activity compares valid instants from item update and available member metadata, with correct empty/invalid/unavailable fallbacks and stable ties; no persisted metadata writes.
- [ ] Optional sort preserves Project grouping, sorts matching members/groups correctly, leaves original default/API ordering intact, and resets on Workbench remount/reload.
- [ ] Preserve search/status behavior, draft/view/session navigation and file context; demo and all languages synchronized without copying unrelated shell code.
- [ ] TDD at agreed helper/component/propagation seams; tests, typechecks and lint pass. Add meaningful E2E coverage of integrated behavior as needed.
- [ ] Own worker commit based on latest integration; root performs full regression and Standards/Spec review before closure.

## Comments
