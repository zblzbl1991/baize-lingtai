# Octop 对 Pi Web 工作台的借鉴价值

研究日期：2026-10-07。Octop 基线：[`4b17f1cfac6c8092d8554b94632af30ce7f51966`](https://github.com/TencentCloud/Octop/tree/4b17f1cfac6c8092d8554b94632af30ce7f51966)，提交时间 2026-10-06 17:14:32 +08:00。Pi Web 基线：`8adee8722c1de9bb44e102a907e3b6ae156f4417`。

方法：阅读官方 README、前后端源码及相关测试，并对照当前 `CONTEXT.md`、ADR 0007、工作台 spec 和 agent notes；只读 clone 到系统临时目录，未安装依赖或运行 Octop。下文“事实”指源码可核对的机制，不代表运行验证；“建议/推论”是对 Pi Web 的设计判断。这份研究不修改已完成的 spec 或 ticket。

## 判断

最值得借鉴的是**把会话中的活动、等待和文件结果，提到用户组织工作的那一层**。你的 Work Item 已经解决了“一个目标跨多次会话”的组织问题；下一步应改善“今天先看哪个目标”“哪个目标有新结果”“这个文件是谁在哪个工作树写的”。

Octop 不是已经做好的 Work Item 工作台替代品。README 把 Project（按共同目标组织 agents、files、conversations 的 project-scoped workspaces）列在 **Planned**；AgentTeams 仍标为 Beta / In progress。因此不能从 README 推断它已经实现了与你当前工作目标等价的模型。[官方路线图][o-roadmap]

建议顺序：先做卡片活动与未读、最近活动排序、产出来源；有办公文件需求再扩充预览。审批和定时执行适合作为后续独立课题。

## 1. 优先：让工作目标卡片告诉用户哪里需要注意

**Octop 事实。** 后端按 agent 聚合会话 `unread_count`，前端在 agent 导航显示未读 badge；打开 thread 有单独的 read 接口。历史 API 分别提供 `turn_active` 和 `hitl_pending`，前端将未回答的问询解释为 pause，而非仍在执行的工具。这里借鉴的是“未读、执行、等待”分别表达，不能把它们都归为 running。[未读聚合][o-unread]、[导航 badge][o-badge]、[历史状态与已读接口][o-history-state]、[暂停判断][o-pending]

**Pi Web 当前情况。** 已有侧栏未读集合、Project 级 running / unread 聚合、完成提示音与推送；不是缺少通知系统。Work Item 列表卡片目前主要显示名称、session 数量、组织状态和 `updatedAt`，运行标记在详情的 session 行。工作台需要复用这些现成信号，而不是另做一套通知。[侧栏][p-sidebar]、[Project 聚合][p-project]、[卡片][p-cards]、[详情][p-detail]、[完成提示音][p-sound]

**建议/推论。** 给每张卡片派生 `runningCount`、`unreadCount`，第一步只展示“2 个会话运行中”“有新结果”及对应入口；“有新结果”实际含义应为已有会话未读，不能声称模型成功交付。点击卡片打开目标概览不应把所有成员 session 统一标为已读，沿用打开具体 session 的已读语义。若未来引入“等待你处理”筛选，只聚合具有真实、仍可处理请求的会话，不能凭最后一条文字猜测。

**最小落地。** 将侧栏未读状态提为共享 hook/store，保持已有 localStorage key 和通知行为；按当前 Association 求交集得到目标级计数。运行继续复用现有 running registry 和工作台刷新。卡片运行/未读只做投影，不写入 Work Item JSON，不更改 `in-progress/completed`。

**验证重点。** 同一目标多个会话、完成目标仍有运行会话、detach 后不再计入、从详情打开一个会话不清空其他未读、刷新/重连后的运行变化。

## 2. 优先：把最近活动与组织修改时间分开

**Octop 事实。** Thread 的列表排序按 `pinned`，再按 `last_active`（无回合时回退 `created_at`）；前端匹配这一排序，并提供置顶入口。`is_active` 是 thread 是否绑定到当前 dashboard session，**不是正在执行**；运行需看 `turn_active` 等运行时信号。[数据库排序][o-sort]、[前端排序与绑定选择][o-session-sort]、[置顶入口][o-pin]、[绑定状态来源][o-thread-list]

**Pi Web 当前情况。** spec 明确普通 session 活动不重写 Work Item 的 `updatedAt`；成员 session 则按自身 `modified` 排序。卡片显示组织修改时间，所以昨天重命名的目标可能排在今天持续工作的目标前面。这是已定语义，不是存储 bug。[当前 spec](../../.scratch/workbench/spec.md)、[成员投影][p-sessions]、[卡片时间][p-cards]

**建议/推论。** 新增派生 `lastActivityAt`，定义为 `max(item.updatedAt, available member modified)`；字段名称、展示标签与组织时间区分开。先添加“最近活动”排序选项并保留原排序，避免悄悄改变已完成 spec 的承诺。列表还可增加名称搜索和“有新结果 / 运行中”筛选，复用第 1 项信号。置顶可稍后按需求加入，它需要真正的用户偏好持久化，不应靠更新时间模拟。

**最小落地。** 列表层投影活动时间与计数，无需扫描 transcript 或创建 AgentSession；卡片显示“最近活动”，组织修改时间保留在详情或说明里。明确不可用成员是否参与时间投影：只用已验证元数据，不能让未知时间变成最新。新增排序/筛选是 spec 的增量，需要补充新的验收标准。

## 3. 优先：产出要有容易理解的名称与明确来源

**Octop 事实。** `ThreadArtifact` 保留 `path + agent_id`，去重 key 包含生产者；工具中间件将成员 thread 的文件汇入 room thread，同时保留生产 agent，打开文件时仍能选择成员 workspace。聊天结束或产文件工具完成时刷新 artifacts。值得借鉴的是聚合后仍保留来源。[结构化文件引用][o-artifact-ref]、[聚合与生产者][o-artifact-collect]、[刷新时机][o-artifact-refresh]

**Pi Web 当前情况。** Outputs 已有 `sourceSessionId / sourceCwd / checkoutRoot / lastWrittenAt`，并且同名相对路径在不同 worktree 中保持不同文件。当前详情主要把完整路径当链接显示，来源数据还没有成为帮助用户辨认结果的主要信息。[类型][p-output-types]、[详情显示][p-detail]、[产出合同](../agents/workbench.md#outputs-and-file-access)

**建议/推论。** 第一行显示文件名和文件类型，第二行显示相对路径、实际工作树及最后写入时间；提供“最近写入来源会话”的链接。这里的 `sourceSessionId` 是去重后保留的最近可判定来源，不是唯一作者或全部贡献者。尤其是主 checkout 与 worktree 同时都有 `README.md` 时，用户不用猜打开的是哪一个。当前证据只支持会话级来源跳转；若要跳到具体写入消息，需要增加对应原始 entry id 的提取与去重规则，不能假装已有定位能力。

**最小落地。** 仅消费现有 Outputs 数据，通过现有 session 导航与 FileViewer 打开结果；保留缺失/不可用/不完整扫描提示和“当前 working-tree diff”的说明。显示来源不会把文件变成目标独占交付物，也不会保留历史版本。

**不宜照搬。** Octop 的工具索引是写入时 best-effort 追加，失败只记录 warning；文件提取还允许在 args 没有路径时解析工具结果文本。Pi Web 当前 Outputs 合同要求成功的本地写入证据，明确排除回复文字、脚本字符串及没有证据的 MCP 名称。若以后增加实时文件索引，只能作为可重建缓存，并且每次按当前 Association 过滤；不能用它代替 transcript 权威或放宽证据边界。[Octop 追加失败行为][o-artifact-collect]、[Octop 路径提取][o-artifact-extract]、[Pi Web 合同](../agents/workbench.md#outputs-and-file-access)

## 4. 条件性优先：办公产出的预览，而非只列文件路径

**Octop 事实。** `DocumentPreviewCore` 按需加载 DOCX、XLSX、PPTX 解析器，区分文件获取与解析阶段，卸载时 abort/revoke/destroy，提供 missing/error 与 retry。XLSX 投影有约 500 行、40 列上限并提示下载完整表；PPTX 用 zip limits、lazy media/slides 和 windowed list。PDF viewer 也用视口附近页面挂载避免同时渲染所有 canvas。[加载与清理][o-preview]、[表格限制与提示][o-preview-limit]、[PDF 窗口渲染][o-pdf]

**Pi Web 当前情况。** 已有 PDF / DOCX 类型与 FileViewer 文档预览，并已有加载、取消和重试机制；不需要因 Octop 重新建设这些能力。[已支持类型][p-filetypes]、[已有预览组件][p-fileviewer]

**建议/推论。** 如果工作目标的主要结果包含报告、表格、幻灯片，增量首先应是 XLSX 只读预览，再按需求加入 PPTX；如果主要是代码，则第 1–3 项收益更大。预览入口仍走已有 FileViewer tabs，不能给工作台另做文件读取授权。结果较多后才考虑缩略图，采用点击或可见时加载，避免工作台自动下载解析所有文件。

**最小落地。** 一个 XLSX 只读 preview adapter：展示工作表、有限行列、明确截断提示、失败可下载；设置文件/ZIP/解析耗时上限，并复用现有路径授权与错误处理。Octop 的表格上限约束了渲染投影，不能直接推论其全部文件解析内存都受同一上限约束。新 Office 依赖还需检查当前 iOS 16.2 的客户端语法兼容与 bundle 成本。

## 5. 后置：等待用户与恢复，是执行投影而非目标生命周期

**Octop 事实。** HITL resume 验证决定与待处理 actions 的数量/允许类型；恢复过程中若再次遇到审批会重新注册，历史 API 可以重新注入当前 pending 卡片。浏览器断连后恢复逻辑继续消费后端执行结果，并有相应测试。但 pending store 明确是 process-local、TTL 约 30 分钟；其“恢复”不等于持久审批队列或跨重启完整恢复。流重连也被前端明确称作 weak stream resume，可能漏中间 token。[恢复路径][o-resume]、[决定校验][o-decisions]、[断连测试][o-resume-test]、[进程内 TTL][o-pending-store]、[弱恢复提示][o-weak-resume]

**Pi Web 当前情况。** 原生 extension UI 有请求队列；工作台切换视图不停止运行，通过现有会话机制重连；Association 部分失败也已有专门 recovery，保证不重建 session、不重发首条 prompt。这些恢复含义不能混成一个“任务重试”。[扩展 UI 队列][p-ui-queue]、[当前恢复合同](../agents/workbench.md#creation-fork-and-recovery)

**建议/推论。** 若以后工作台要显示“等待你”，以现有活跃 extension 请求的 id、session 和可响应性为事实来源，点击返回原会话处理；不要在列表新建 approve-all 权限操作。空闲、运行、等待、离线未知可以属于会话运行投影，Work Item 保持用户驱动的两状态完成模型。刷新时没有可恢复请求，应显示已过期/未知，不要保留一个永远可点击的旧审批卡片。

**最小落地。** 先提升现有请求状态的可见性，不引入 Octop 的权限策略、Harness 或新的 Run/Attempt 模型；只有经过原生 SDK 能力核对后，再讨论跨重启持久恢复。这超出当前 spec，需独立设计与验收。

## 暂不建议扩展的部分

**Cron 可作为以后“持续检查这个目标”的参考，暂不作为下一步。** Octop 将 schedule 定义、执行 `last_status / last_error`、会话 thread 分开；支持纯文本投递与 agent 执行，显式选择 fresh thread，并在需要用户交互时将 cron run 判为失败。这个模型提示我们：如果新增工作目标定时跟进，必须先明确关联原 session 还是新建 session、运行重叠、失败通知和待用户处理，不能把定时执行的 success 自动映射为工作目标完成。[Cron 数据字段][o-cron-fields]、[投递及交互失败][o-cron-delivery]、[执行结果与审计][o-cron-job]

**不把 Pi Web 改成 Octop 的完整平台。** README 的多用户、IM、知识库、workspace 后端和双向 ACP 是其平台范围；当前 ADR 明确 Pi Web 保持 pi 的薄 UI、原生 tool presets，工作目标只负责组织，不另建权限语言、执行层和数据库。[Octop 范围][o-platform]、[当前 ADR](../adr/0007-adopt-workbench-domain-freeze-baize-buddy.md)

## 推荐下一张 ticket 的范围（设计推论）

先写“工作目标活动概览”：卡片运行/未读计数，独立最近活动排序，按名称搜索；复用当前共享会话目录与通知状态，保持手动完成语义。下一张再写“Outputs 来源展示”：文件名、工作树、来源会话跳转。它们能直接解决返回工作台时的判断成本，且都不需要换引擎、修改 session 文件或引入 scheduler。办公预览是否优先，取决于用户实际产出类型。

## 固定版本的一手来源

下列 Octop 链接全部固定到本次读取的 SHA；行号对应原始仓库文件，不随默认分支漂移。Pi Web 链接固定到本地研究基线，内部 spec/ADR 相对链接指向本仓库。

[o-roadmap]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/README.md#L155-L177
[o-platform]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/README.md#L108-L153
[o-unread]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/api/routers/agents.py#L81-L88
[o-badge]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/components/SessionList.tsx#L297-L312
[o-history-state]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/api/routers/chat/history.py#L371-L415
[o-pending]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/utils/pendingHitl.ts#L17-L40
[o-sort]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/db/repos/threads.py#L193-L218
[o-session-sort]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/hooks/useSessions.ts#L53-L111
[o-pin]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/components/SessionList.tsx#L95-L110
[o-thread-list]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/api/routers/chat/history.py#L104-L141
[o-artifact-ref]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/utils/thread_artifact.py#L16-L32
[o-artifact-collect]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/agents/middleware/thread_artifacts.py#L54-L141
[o-artifact-refresh]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/index.tsx#L312-L342
[o-artifact-extract]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/agents/threads/artifact.py#L100-L123
[o-preview]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/components/DocumentPreviewCore.tsx#L406-L537
[o-preview-limit]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/components/DocumentPreviewCore.tsx#L618-L647
[o-pdf]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/components/PdfDocumentPreview.tsx#L1-L63
[o-resume]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/api/routers/chat/routes.py#L107-L170
[o-decisions]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/gateway/hitl/coordinator.py#L77-L115
[o-resume-test]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/tests/unit/api/test_chat_hitl_resume.py#L132-L167
[o-pending-store]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/gateway/hitl/store.py#L1-L38
[o-weak-resume]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/pages/Chat/index.tsx#L312-L329
[o-cron-fields]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/dashboard/src/api/types/cronjob.ts#L68-L82
[o-cron-delivery]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/cron/delivery.py#L66-L176
[o-cron-job]: https://github.com/TencentCloud/Octop/blob/4b17f1cfac6c8092d8554b94632af30ce7f51966/src/octop/infra/cron/job.py#L84-L123
[p-sidebar]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/SessionSidebar.tsx#L436-L448
[p-project]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/SessionSidebar.tsx#L1105-L1109
[p-cards]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/WorkbenchView.tsx#L310-L348
[p-detail]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/WorkItemDetail.tsx#L34-L70
[p-sound]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/ChatWindow.tsx#L233-L249
[p-sessions]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/lib/work-item-sessions.ts#L46-L55
[p-output-types]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/lib/work-item-output-types.ts#L1-L14
[p-filetypes]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/lib/file-types.ts#L68-L72
[p-fileviewer]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/components/FileViewer.tsx#L900-L1051
[p-ui-queue]: https://github.com/zblzbl1991/baize-lingtai/blob/8adee8722c1de9bb44e102a907e3b6ae156f4417/lib/extension-ui-queue.ts#L1-L31
