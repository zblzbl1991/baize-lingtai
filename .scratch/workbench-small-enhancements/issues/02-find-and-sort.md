# 工作目标如何按名称查找并表达最近活动

Type: prototype
Labels: wayfinder:prototype
Status: resolved
Assignee: codex
Parent: [工作台小幅增强：复用 pi-web 与 pi 的既有能力](../map.md)
Blocked by: none

## Question

在保留现有 Project 分组与状态过滤的前提下，如何增加名称搜索和最近活动，使用户更容易找回目标，又不改写组织数据或引入新的搜索系统？

需要确定：

- 名称搜索是否限定为当前目标名称的大小写不敏感子串匹配？搜索与“全部/进行中/已完成”如何组合？
- “最近活动”包含目标重命名、完成/重开、Association 变化，还是主要指成员 session 的进展？空目标和未知成员时间如何显示？
- 最近活动只作为显示信息，作为可选排序，还是成为默认排序？原有按目标 `updatedAt` 排序是否保留？
- Project 分组是否保持？若按最近活动排序，组内与组间次序分别如何确定？
- 搜索与排序偏好本轮是否只保留在当前工作台视图中，避免增加 URL 参数或持久化设置？

## Existing evidence

- `components/workbench-view-helpers.ts`：已有状态过滤与按 Project 分组。
- `lib/work-items.ts`：目标 `updatedAt` 表示组织数据的变更，已有稳定排序；普通 session 活动不修改它。
- `lib/work-item-sessions.ts`：成员按现有 pi metadata 的 `modified` 排序，无需读取正文。
- [当前工作台 spec](../../workbench/spec.md) 已定义更新时间、分组和排序；增量不得悄悄覆盖原合同。

## Candidate to discuss

搜索仅匹配目标名称，在现有已加载列表上进行；继续保留 Project 分组和状态过滤。最近活动独立计算，不写回 store。优先保留原默认排序，增加显式的最近活动排序选择；具体时间定义由本票确定。

以上是候选方案，尚未作为本票答案。

## Comments

### HTML 预览 — 2026-10-07

用户要求每项以 HTML 帮助确认。已提供 [独立交互原型](../../../components/prototypes/workbench-small-enhancements.prototype.html) 与 [本项预览](http://127.0.0.1:30143/?tab=find)。运行说明见 [原型说明](../../../components/prototypes/README.md)。

本项依旧待确认；页面内选择只是用户反馈草稿，不会自动解决决策票。小步交付预览是等待其前置决策校正的候选顺序。

## Answer

Resolved: 2026-10-07，用户回复“都按推荐”，确认本轮最近活动定义、排序方式、搜索与偏好的三项推荐。

- 名称搜索只对工作目标名称进行大小写不敏感的子串匹配，并与现有“全部/进行中/已完成”过滤取交集。空查询恢复当前状态下的全部目标；没有匹配时显示空态。不搜索 session 名称或正文，不新增搜索 API。
- 最近活动包括目标信息变更与成员会话更新，取有效的 `item.updatedAt` 和可用成员 `modified` 中的最大值。空目标或没有有效成员时间时回退目标 `updatedAt`；不可用成员不凭空产生新时间。
- 活动时间是查看/排序用的派生信息，不代表进展成功或目标完成，不写回 Work Item store，也不改变现有 `updatedAt` 语义。
- 默认继续按目标更新时间排序，另提供“最近活动”选项。现有 Project 分组保持；选择最近活动时组内按目标活动时间倒序，组间按该组中最新的匹配目标排序。相同时间沿用稳定 id 次序，不让刷新造成随机跳动。
- 搜索和排序只属于当前工作台视图：离开后重新进入或刷新恢复默认。不增加 URL 参数、localStorage 偏好或设置项。
- 最小实现限制在 WorkbenchView 与纯过滤/排序 helper，消费现有目标及成员元数据，不扫描正文、不创建 AgentSession、不修改服务器 store 排序。
- 验收覆盖名称匹配、状态交集、无匹配空态、重命名与会话活动比较、空/不可用成员时间回退、跨 Project 分组及稳定次序、离开和刷新恢复默认。

上述均是增量规划决策；现有生产行为尚未修改。

## Prototype snapshot

已验证决策及候选原型的主来源保存在独立本地分支 `codex/prototype-workbench-small-enhancements`，提交 `e75811f6b26f1d1ecfed765048e8a7fe17c2fc39`。原型路径为 `components/prototypes/workbench-small-enhancements.prototype.html`；对应页签见本票的 HTML 预览链接。复现时可从该提交提取单个 HTML，直接打开；候选对比仍保留，最终选择以本票 Answer 为准。当前 main HEAD、生产代码及普通暂存区未改变，未推送此分支。
