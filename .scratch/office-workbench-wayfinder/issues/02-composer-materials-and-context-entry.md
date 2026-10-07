# 工作目标启动器与材料进入首个 Session

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: 01

## Question

首发场景需要哪些启动字段和材料引用，以及它们如何一次性、可追溯地进入首个 Pi Session？

需要决定：

- “一句话目标”、受众、约束、完成标准、输出偏好中哪些是必填，哪些留给聊天补充；
- 输入文件、图片和已有 Work Item Outputs 是复制、上传、路径引用，还是当前 Session 的显式附件；
- 文件引用如何绑定 Project、Session cwd 和现有 `/api/files` 授权，而不是成为新的文件访问授权；
- 启动器创建 Work Item、Association 和首条 Prompt 的顺序，以及失败时是否保留草稿；
- 启动内容以首条 user message、结构化上下文条目还是两者组合进入 Session；
- 如何避免重复发送首条 Prompt、重复创建 Session 或把浏览器草稿误归到另一个 Work Item。

## Existing evidence

- `/api/agent/new` 已接受 `workItemId`，在首条 Prompt 前完成 Project 校验和 Association；失败时有 `association_pending` 恢复语义。
- `lib/work-item-draft.ts` 和 `lib/work-item-composer.ts` 已为不同 Work Item 隔离草稿意图；`draft-store` 已保存文本和图片草稿。
- 当前 Workbench 创建表单仍只有名称和 Project，尚无独立的办公启动器。

## Constraints

复用现有 Session 创建和草稿 seam，不新建 `start` Runtime 或第二套 Association 写入者。材料引用必须经过现有文件访问规则，不能把 Work Item JSON 当作访问授权。

## Completion criterion

得到启动字段表、材料引用合同、首条 Prompt/上下文注入方式和创建失败恢复语义；能够画出从提交到 ChatWindow 的单一路径，并列出需要保持不变的现有接口。

