# Work Item 上下文的持久边界

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: 01, 02

## Question

为了让用户稍后继续工作，哪些信息应该持久化在 Work Item，哪些信息只保留在 Session、当前文件或浏览器草稿中？

候选持久字段包括：目标描述、输入引用、输出约束、受众、完成标准、下一步、Skill/Profile 引用和最近一次上下文摘要。需要逐项决定：

- 信息的权威来源和更新者是谁；
- 用户修改后如何影响已经存在的 Session；
- 引用文件被移动、删除、跨 worktree 或失去授权时如何显示；
- 是否需要 schema version/migration、字段大小上限和 CAS/版本冲突；
- 是否保存模型摘要、Token、耗时或错误；
- 完成/重开是否改变这些上下文，继续 Session 是否自动重开 Work Item。

## Existing evidence

- 当前 `pi-web-work-items.json` 是严格校验、版本化、锁定写入的用户数据；当前 Work Item 记录基础身份、状态、Session ids 和 checkout 边界。
- ADR-0007 明确 Work Item 是组织层，不是新的执行权限或 Runtime；完成状态是用户驱动的组织状态。
- 当前 Session JSONL、FileViewer 和 Outputs 各自有独立的权威边界，不能把它们的投影反写成 Work Item 的历史快照。

## Constraints

不能复制完整 Prompt、Skill 正文、凭据或二进制文件；不能让保存的路径绕过 Project/file-access 检查；不能用 Work Item 的 metadata 更新冒充 Session 活动或成功进度。

## Completion criterion

得到字段分类表：持久化、Session 级、浏览器草稿、派生只读投影四类；明确迁移、失效、冲突和重新加载语义，并指出是否需要新的 ADR。

