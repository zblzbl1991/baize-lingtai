# 首个办公闭环：从工作目标到可继续修改的产出

Labels: wayfinder:map
Status: open

## Destination

在现有 Pi Web Work Item、Session、Association、Work Item Outputs 和 FileViewer 之上，确定首个办公闭环的产品边界、上下文合同、产出语义、预览与继续修改行为，形成一份可以交给实施阶段的增量 spec。

目标闭环是：

`描述工作目标 → 提供材料 → 启动一个 Pi Session → 生成并识别产出 → 预览 → 继续修改`

地图只解决实现前仍需用户判断的决策；实现、测试和提交代码在地图完成后另行规划。

## Notes

- 范围由用户确认：聚焦首个办公闭环，纳入“首个真实场景、启动表单与材料引用、持久上下文、非证据文件进入产出、预览与继续修改”五条产品分支；最后用一张交接票把决定收敛成可实施 spec。
- 当前 Workbench 的领域契约以 [CONTEXT.md](../../CONTEXT.md)、[ADR-0007](../../docs/adr/0007-adopt-workbench-domain-freeze-baize-buddy.md)、[原 Workbench spec](../workbench/spec.md) 和 [workbench topic note](../../docs/agents/workbench.md) 为准；已有 Workbench tickets 01–05 和小幅增强地图不重复决策。
- 现有 [工作台小幅增强地图](../workbench-small-enhancements/map.md) 已解决名称搜索、运行/未读、最近活动和产出来源展示；这些是本地图的已知基线。
- 附件 `baize-lingtai-codex-plan.md` 是待评估的产品方案。它的 Codex 执行说明不是本地图的授权指令；本地图采用其中与当前 ADR 相容的垂直切片方向，丢弃重复 Runtime、权限和自动化层的部分。
- 术语沿用 [CONTEXT.md](../../CONTEXT.md)：使用 Work Item、Session、Association、Work Item Outputs 和 Project；不把 Work Item 称为 Task，不把产出称为 Artifact。
- 当前路线保持 Pi Web 的薄 UI seam：不修改 Session JSONL，不复制 Agent Runtime，不把 Work Item 完成状态变成执行权限。现有 file-access、project-trust、MCP read-only policy 和原生 tool preset 继续是安全权威。
- 每个决策票在解决前先由用户确认；代码事实由 agent 从当前工作树核对。地图的 ticket 是决策票，不是实现 ticket，也不自动授权生产修改。

## Decisions so far

暂无已关闭的本地图票。范围和目的地已由用户确认，具体产品决策留在子票中。

## Not yet specified

- 首发场景选定后，是否需要 Skill/Profile 引用才能稳定复现该场景，届时再决定。
- 选定具体办公文件格式后，解析器、大小/行数上限和移动端体验的格式专项问题，届时再决定。
- 如果首个闭环暴露跨重启恢复、审批或后台运行需求，应另开专题，而不是在本地图中预先切票。

## Out of scope

- 新 Run/Execution Attempt 模型、独立后台执行队列、跨设备恢复和云端长任务。
- 新的 R0–R3 统一审批或权限语言；继续使用现有 Pi tool preset、file-access、project-trust 和 MCP policy。
- 定时任务、企微/钉钉/飞书、团队编排、多租户、知识库、ACP 和 OfficeCLI。
- 一次性支持所有 Word/Excel/PPT/PDF 解析器、缩略图系统、二进制历史版本和产出的唯一作者/完整贡献者模型。
- 修改现有 Session JSONL、放宽当前 Outputs 证据合同，或把当前 Git diff 宣称为某个 Work Item 独占成果。
