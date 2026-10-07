# 首个办公闭环的 spec 交接与垂直切片

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: 01, 02, 03, 04, 05

## Question

前五张决策票解决后，如何把它们收敛成一份可实施的增量 spec 和第一批垂直切片，确保实现阶段不会重新发明边界？

需要决定：

- 首个垂直切片的最小路径，是“启动器 → 首个 Session → 产出入口 → 只读预览 → 回到来源 Session”，还是包含文本编辑；
- 哪些行为必须在第一批交付，哪些明确留给后续增量；
- Work Item、Session、Outputs、FileViewer 和现有 `/api/agent/new` 之间的唯一写入者与接口 seam；
- 首条 Prompt、Association、上下文保存和产出登记的失败恢复顺序；
- 每个阶段的用户可观察状态、错误、部分成功和取消语义；
- 实施票如何按可独立验证的批次拆分，并保留现有 Workbench 小幅增强的基线；
- 最小单元测试、API/Session 集成测试、E2E 和移动端验证分别覆盖哪些外部行为；
- 何时认为首个办公闭环已经达到“可以继续让 Agent 修改”的验收标准。

## Existing evidence

- 当前 Workbench spec 已为 Association、Session 生命周期、Outputs 证据和文件访问建立了详细合同；新的 spec 应引用它们，而不是复制或覆盖它们。
- `/api/agent/new` 已承担新 Session 创建、Work Item Association 和首条 Prompt 的顺序控制；当前 Workbench 详情已能回到 Session、打开 Output 和查看 Diff。
- 当前项目已有本地 issue tracker、增量 spec 和实施票约定；wayfinder 的决策票完成后才进入 implementation/tdd/code-review 流程。

## Constraints

这张票只决定交接形态和切片边界，不实现代码、不创建新的 Runtime、不引入新的权限体系。任何需要改变 Session JSONL、Outputs evidence contract、file-access 或 Work Item 生命周期的结论，都必须显式标记为需要重新审查 ADR-0007 或另开专题。

## Completion criterion

形成一份增量 spec 的目录和内容边界，列出有序实施批次、每批的阻塞关系、外部验收标准和现有能力复用点；实现者可以据此创建实施 tickets，而无需重新决定产品语义。

