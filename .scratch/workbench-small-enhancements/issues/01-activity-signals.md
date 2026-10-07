# 工作目标卡片如何沿用原生运行与未读提示

Type: prototype
Labels: wayfinder:prototype
Status: resolved
Assignee: codex
Parent: [工作台小幅增强：复用 pi-web 与 pi 的既有能力](../map.md)
Blocked by: none

## Question

如何把已有 session 的运行与未读信息展示在工作目标卡片上，同时保留 pi-web 原有的通知和已读语义，并让改动范围最小？

需要确定：

- 卡片分别显示运行中会话数、未读会话数，还是只显示相应标记？措辞是否直接称“未读会话”，避免把后台结束误称为成功交付？
- 未读是否完全沿用侧栏的“后台运行结束、排除子代理及被抑制通知、重新运行/打开会话时清除”语义？
- 工作台与聊天保留同一个 selected session；在工作台停留时，该 session 应如何遵循原有未读规则？是否允许本轮仅传递状态，而不修改侧栏的选中/清除逻辑？
- 展开目标、打开某个成员会话、detach/move 时，哪些事件影响计数与已读？
- 是否只增加 Sidebar → AppShell → Workbench 的只读回调，不迁移未读存储所有权、不增加轮询？

## Existing evidence

- `components/SessionSidebar.tsx`：未读集合与持久化在约 442、652–656 行；运行状态通过现有回调在约 728–730 行对外提供；后台完成与未读清除在约 736–786 行。
- `components/AppShell.tsx`：现有 Sidebar 的运行/会话回调约 1293–1294 行；工作台入口约 2442 行。
- `lib/work-item-sessions.ts`：现有 DTO 已带成员 `isRunning`；`WorkbenchView` 已有可见时刷新。
- 读取 [Sessions 的运行状态与重连规则](../../../docs/agents/sessions.md#running-state-polling--reconciliation)，保留现有通知抑制和后台完成规则。

## Candidate to discuss

先复用 DTO 展示运行计数；未读优先经只读回调传递已有集合，按当前 Association 求交集。只描述未读事实，不持久化目标级运行状态，不将一次运行结束映射为工作目标完成。推荐不迁移 Sidebar 的状态所有权。

以上是候选方案，尚未作为本票答案。

## Comments

### HTML 预览 — 2026-10-07

用户要求每项以 HTML 帮助确认。已提供 [独立交互原型](../../../components/prototypes/workbench-small-enhancements.prototype.html) 与 [本项预览](http://127.0.0.1:30143/?tab=activity)。运行说明见 [原型说明](../../../components/prototypes/README.md)。

本项依旧待确认；页面内选择只是用户反馈草稿，不会自动解决决策票。小步交付预览是等待其前置决策校正的候选顺序。

### Live 确认 — 2026-10-07

- 用户已确认卡片分别显示运行中会话数与未读会话数；零值不显示，未读不表示成功交付。
- 用户已确认沿用现有侧栏未读规则，并按具体会话查看来清除。

## Answer

Resolved: 2026-10-07，依据用户在 live 问答中对卡片提示、原生规则和清除方式的三次确认。

- 卡片分别显示“n 个会话运行中”“n 个未读会话”，数量为零时不显示。未读只表示原生后台完成通知尚未查看，不声明运行成功或产出交付。
- 完全沿用 Sidebar 的生成、通知抑制、子代理排除、重新运行及选中会话清除规则。切到工作台后仍保留 selected session：它结束时继续不生成后台未读，本轮不调整视图可见性语义。
- 展开/收起工作目标不清除未读。打开具体会话只清除该会话的原生未读；detach/move 只改变对应目标的计数，不删除或清除会话标记。
- 工作目标的手动完成/重开语义保持不变，运行结束不自动完成或重开目标。
- 最小接入：运行使用现有成员 `isRunning` 与可见时刷新；未读用 Sidebar 的只读回调经 AppShell 传递，在 Workbench 按当前 Association 聚合。保留现有 localStorage key 和状态所有权，不新增 store、轮询、通知或持久化目标活动状态。
- 验收覆盖多成员计数、零值隐藏、展开不清除、仅打开单个成员清除、移出/移动后的计数、完成目标继续运行、选中会话在工作台结束，以及原生子代理/通知抑制行为。

本票仅解决行为决策；HTML 是已讨论的候选参考，生产实现与原型归档由后续实施处理。

## Prototype snapshot

已验证决策及候选原型的主来源保存在独立本地分支 `codex/prototype-workbench-small-enhancements`，提交 `e75811f6b26f1d1ecfed765048e8a7fe17c2fc39`。原型路径为 `components/prototypes/workbench-small-enhancements.prototype.html`；对应页签见本票的 HTML 预览链接。复现时可从该提交提取单个 HTML，直接打开；候选对比仍保留，最终选择以本票 Answer 为准。当前 main HEAD、生产代码及普通暂存区未改变，未推送此分支。
