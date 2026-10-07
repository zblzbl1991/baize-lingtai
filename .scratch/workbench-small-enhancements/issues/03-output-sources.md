# 产出如何展示路径与最近写入来源会话

Type: prototype
Labels: wayfinder:prototype
Status: resolved
Assignee: codex
Parent: [工作台小幅增强：复用 pi-web 与 pi 的既有能力](../map.md)
Blocked by: none

## Question

如何只使用现有 Outputs 字段，让用户辨认产出所在的工作树、打开当前文件并返回来源会话，同时准确表达现有证据的含义？

需要确定：

- 文件名、相对路径、checkout 或非 Git 的 source cwd、最近写入时间中，哪些信息常显、哪些按需查看？必须能区分不同工作树的同名文件。
- 来源入口是否直接叫“来源会话”，并明确它是最近可判定的支持写入来源，而非唯一作者或完整历史？
- 返回来源是否仅通过现有 `onOpenSession(sourceSessionId)` 打开会话，继续保留选中 cwd/worktree 的原生导航行为？
- 文件缺失/不可用但来源会话仍存在时，是否保留来源入口？来源会话本身不可用时如何说明？
- 当前 working-tree diff、未知写入时间和不完整扫描提示怎样保留，避免更易读的展示掩盖现有边界？

## Existing evidence

- `lib/work-item-output-types.ts`：已有 `filePath / sourceSessionId / sourceCwd / checkoutRoot / lastWrittenAt / state / diffAvailable`。
- `components/WorkItemDetail.tsx`：已有 `onOpenSession`、`onOpenOutput`，可复用会话和文件导航。
- `lib/work-item-outputs.ts`：同一路径去重后保留最近可判定来源；不是全部贡献者列表。
- 阅读 [Outputs 与文件访问](../../../docs/agents/workbench.md#outputs-and-file-access) 和 [文件访问边界](../../../docs/agents/files-and-access.md)，展示字段不改变文件授权。

## Candidate to discuss

优先显示友好文件名，同时保留可区分的路径/工作树说明，添加来源会话入口。只消费当前 DTO 与既有导航；缺失文件继续禁止打开文件和 Diff，来源会话可用时仍可访问。暂不提取原始 entry id 或新增产出索引。

以上是候选方案，尚未作为本票答案。

## Comments

### HTML 预览 — 2026-10-07

用户要求每项以 HTML 帮助确认。已提供 [独立交互原型](../../../components/prototypes/workbench-small-enhancements.prototype.html) 与 [本项预览](http://127.0.0.1:30143/?tab=outputs)。运行说明见 [原型说明](../../../components/prototypes/README.md)。

本项依旧待确认；页面内选择只是用户反馈草稿，不会自动解决决策票。小步交付预览是等待其前置决策校正的候选顺序。

## Answer

Resolved: 2026-10-07，依据用户对“文件名 + 路径和工作树说明”及“提供来源会话入口”的两次 live 确认。

- 使用 HTML 中“文件名与工作树”方案：常显文件名、相对路径、所在 checkout/目录及最近写入时间；长路径可换行。主 checkout 与其他 worktree 的同名文件必须能够直接辨认，完整路径继续可查看。非 Git 文件用来源 cwd 作为目录上下文；未知写入时间明确显示“写入时间未知”。
- 提供“来源会话”按钮，使用已有 `onOpenSession(sourceSessionId)` 返回原会话，保留其实际 cwd/worktree 以及既有导航行为。
- 来源表示去重后保留的最近可判定支持写入来源，不声明唯一作者、全部贡献者或目标独占修改。不增加原始 entry id 提取或精确工具消息定位。
- 文件缺失/不可用时，打开文件与 Diff 继续遵循现有禁用规则；若来源会话可用，仍可打开来源。来源会话本身不可用时禁用入口并显示可见说明，不能仅依赖鼠标悬浮提示。
- 保留当前文件状态、Diff 可用性、不完整扫描原因和“当前 working-tree diff 可能包含其他工作修改”的说明。显示来源不扩大文件读取授权或证据覆盖。
- 最小实现消费现有 Outputs DTO 和已投影的成员会话元数据；改动集中在 WorkItemDetail 及必要的 client-safe 显示 helper，不新增 API、产出索引、文件版本或权限模型。
- 验收覆盖两工作树同名文件、文件与来源会话分别导航、缺失文件仍可回源、不可用来源的禁用说明、非 Git 上下文、长路径/未知时间以及部分扫描结果。

本票仅解决行为决策；生产实现尚未修改。

## Prototype snapshot

已验证决策及候选原型的主来源保存在独立本地分支 `codex/prototype-workbench-small-enhancements`，提交 `e75811f6b26f1d1ecfed765048e8a7fe17c2fc39`。原型路径为 `components/prototypes/workbench-small-enhancements.prototype.html`；对应页签见本票的 HTML 预览链接。复现时可从该提交提取单个 HTML，直接打开；候选对比仍保留，最终选择以本票 Answer 为准。当前 main HEAD、生产代码及普通暂存区未改变，未推送此分支。
