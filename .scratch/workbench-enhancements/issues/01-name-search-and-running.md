# 名称搜索与运行计数

Status: ready-for-agent
Assignee: unassigned
Blocked by: none
Spec: [Workbench small enhancements](../spec.md)
Decision: [工作目标如何按名称查找并表达最近活动](../../workbench-small-enhancements/issues/02-find-and-sort.md#answer), [工作目标卡片如何沿用原生运行与未读提示](../../workbench-small-enhancements/issues/01-activity-signals.md#answer)

## What to build

Add Work Item name substring search combined with current status filters, actionable no-match state, and nonzero card running counts from existing member data. Preserve grouping, default order, manual completion and native refresh. Search is mounted-view memory only.

## Acceptance

- [ ] Trimmed, case-insensitive name search combines with status and keeps current grouping/order; empty input resets; no matches and truly empty store have distinct localized copy.
- [ ] Running counts use current associated sessions and hide zero; completed goals stay completed during running transitions.
- [ ] Native tokens/controls, keyboard access and 44px mobile targets retained; all new strings mirrored in three locales and demo.
- [ ] Red-before-green tests at existing helper/component seams; relevant tests and root/demo typechecks pass; lint has no new issues.
- [ ] Commit on own worker branch; merge latest integration before reporting. Record tests and changed files under Comments; root closes after merge/review.

## Comments
