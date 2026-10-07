# 预览与继续让 Agent 修改的最低交付

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: 01, 02, 03, 04

## Question

首发场景的用户在看到 Work Item Outputs 后，怎样预览、判断结果是否可用，并安全地要求原有 Session 继续修改？

需要决定：

- 首发场景需要哪一种只读预览，是否已有 FileViewer 能力足够；
- 文件、Preview、Source、Diff 的 Tab identity 如何保留 source session、cwd/worktree 和显示模式；
- 用户编辑文件时是否属于本轮范围；若属于，哪些文本格式支持编辑；
- dirty、文件 mtime 变化、Agent 同时写入、关闭和冲突分别如何呈现；
- “继续修改”是回到来源 Session、创建新 Session，还是两者都支持；
- 继续修改时怎样携带目标、验收标准和当前文件，而不重复注入上下文；
- 什么时候用户可以手动标记 Work Item completed，失败或部分成功是否仍可继续。

## Existing evidence

- `WorkItemDetail` 已通过现有回调打开 Session、打开 Output 和当前 Git diff；`FileViewer`/`TabBar` 已保留文件路径、cwd、source session 和查看模式。
- 当前 FileViewer 主要是只读；文本编辑、保存、mtime/If-Match 和脏状态尚未形成完整合同。
- Work Item completed 是组织状态，继续 Session 或 Association 变化不会自动重开。

## Constraints

首发闭环优先只读预览和回到原生 Session。若引入编辑，必须单独定义安全写入接口、并发保护和截断内容规则；不能用 UI 状态代替服务端 file-access 校验。

## Completion criterion

得到首发场景的预览格式、文件 Tab/来源语义、继续修改路径和失败/冲突/完成行为；明确文本编辑是否留在后续专题，并形成可直接写入增量 spec 的验收边界。

