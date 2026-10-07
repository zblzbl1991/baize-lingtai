# 首个办公场景与成功标准

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: none

## Question

首个办公闭环应该先服务哪一个真实场景，以及用户怎样判断它完成？

需要在“CSV 数据分析并生成 Markdown 摘要”“会议材料整理成 Markdown/Word”“需求说明书草稿”“周报/日报生成”等候选中选择一个首发场景，并明确：

- 用户已经具备哪些材料和 Project；
- 输入文件数量、大小和格式的实际范围；
- 首个 Session 的最小输入和期望输出；
- 生成失败、部分成功、文件缺失和用户需要补充信息时的表现；
- “预览”和“继续修改”分别必须证明什么；
- 成功标准是文件存在、文件可读、满足验收条件，还是用户明确确认。

## Existing evidence

- 当前 Work Item 只组织 Session 和当前 Work Item Outputs，生命周期是用户驱动的 `in-progress/completed` 两状态。
- 当前 FileViewer 已能承载文本、Markdown、Diff 及部分文档预览；办公格式的优先级尚未由实际场景决定。
- 附件方案列出多个电网办公场景，但没有给出首发场景的输入规模、验收样例或失败标准。

## Constraints

场景选择不能要求先引入新的 Runtime、审批层、定时任务或完整 Office 解析平台。决定必须能在现有 Pi Session、工具配置和 Project 文件边界内验证。

## Completion criterion

得到一个首发场景、明确输入/输出示例和可检查的成功、部分成功、失败标准；这些标准能直接约束后续启动器、上下文、Outputs 和预览票。

