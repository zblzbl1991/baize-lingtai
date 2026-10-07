# 工作台小幅增强：复用 pi-web 与 pi 的既有能力

Labels: wayfinder:map
Status: complete

## Destination

确定卡片运行/未读提示、最近活动与名称搜索、产出来源展示这三项增强的行为边界、最小接入方案和推进顺序，形成可以交给实现的增量方案。

本地图只解决决策；实现另开增量 spec 和实施 ticket。原工作台 spec 和已完成 ticket 继续作为当前行为的基线。

## Notes

- 2026-10-07，用户选择「三项都纳入，分小步推进」，并明确要求避免大改动，围绕 pi-web / pi 生态建设。
- 术语沿用 [CONTEXT.md](../../CONTEXT.md)；方向沿用 [采用工作台领域、冻结 BaizeBuddy 为参考](../../docs/adr/0007-adopt-workbench-domain-freeze-baize-buddy.md)。Work Item 仍是组织工作的目标，session 仍由 pi 管理。
- 参考 [Octop 对 Pi Web 工作台的借鉴价值](../../docs/research/octop-workbench-reference.md)。Octop 仅用于提出问题；实现优先沿用当前组件、数据和接口。
- 每次决策会话使用 `grilling` 与 `domain-modeling`；先认领一个未阻塞的决策票，再与用户解决它。本地认领、依赖和答案格式见 [Issue tracker](../../docs/agents/issue-tracker.md#wayfinding-operations)。
- 以“小改动”作为选型约束：优先消费已有字段、纯显示计算和既有导航回调；增加未读只读回调的方案优先于提取全局 store。目标 schema、pi session 文件、AgentSession、工具权限和产出证据合同保持现有范围。
- 第一轮候选是相互独立的决策，不强行串成开发流水线。文件编号只用于本地依赖；沟通时用票的标题。
- `Decisions so far` 只索引已解决的票。开放票从 `issues/` 查询，不在地图里重复保存问题或答案。
- 2026-10-07，用户要求每项提供 HTML 预览。各票改为 `prototype` 类型并附 [四页交互原型](../../components/prototypes/workbench-small-enhancements.prototype.html)；原型仅展示候选与示例，不记录决策答案。运行说明见 [原型说明](../../components/prototypes/README.md)。
- 2026-10-07，用户要求与 agent 一起完成全部决策票。本次按用户指示连续逐票进行 live 确认；每票仍先认领、待用户回答后才记录答案并关闭，最后才解决交付顺序。不将页面预填或 agent 推荐当成用户确认。
- 原型与决策记录已归档到本地分支 `codex/prototype-workbench-small-enhancements`，快照提交 `e75811f6b26f1d1ecfed765048e8a7fe17c2fc39`。快照包含讨论时的候选 HTML、研究与最终答案；没有生产实现更改，未切换当前 main、未向远端推送。

## Decisions so far

- [工作目标卡片如何沿用原生运行与未读提示](issues/01-activity-signals.md#answer)：分别显示数量，完全沿用侧栏语义；工作台只读聚合，不改目标完成状态。
- [工作目标如何按名称查找并表达最近活动](issues/02-find-and-sort.md#answer)：名称搜索与状态过滤组合；最近活动含目标及成员更新，保留原默认排序，偏好仅当前视图。
- [产出如何展示路径与最近写入来源会话](issues/03-output-sources.md#answer)：常显文件名、路径、工作树与写入时间，提供来源会话入口，保留既有文件与证据边界。
- [三项增强如何分成可独立验证的小步](issues/04-small-rollout.md#answer)：按接入成本分三批，先搜索/运行、再来源、最后未读/排序；每批独立验证并同步 demo 与三语言。

## Not yet specified

无。本轮四张决策票已通过用户 live 确认解决；推进范围、行为边界与交付门槛见相应 Answer。实现与测试中发现的具体缺陷由后续增量 spec / 实施票处理，不预先扩大本地图。

## Out of scope

- Office 新格式预览、缩略图、定时任务、团队编排、多用户/IM、知识库、ACP 或更换 agent runtime：超出本轮三项增强。
- 新权限体系、统一审批入口、等待用户状态和跨重启执行恢复：需要独立的运行时契约，不纳入小幅显示增强。
- 目标自动完成/自动重开、第三种组织状态、置顶/收藏、搜索会话正文：本轮不扩展目标领域和偏好模型。
- 产出历史版本、唯一作者或完整贡献者声明、精确跳到工具写入消息、Shell/MCP 写入识别扩展、实时产出权威索引：超出既有数据与证据边界。
- 本轮直接实现、向主分支提交或推送代码。临时 HTML 原型按 prototype 技能只归档到独立本地分支，供复现决策。
