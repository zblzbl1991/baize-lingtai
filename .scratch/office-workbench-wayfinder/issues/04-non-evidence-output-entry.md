# 非证据文件如何进入 Work Item Outputs

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: unassigned
Parent: [首个办公闭环：从工作目标到可继续修改的产出](../map.md)
Blocked by: 01, 02

## Question

当 Shell、Python 或远程 MCP 生成了文件，但当前 transcript 没有受支持的本地写入证据时，首个办公闭环是否允许用户把它纳入 Work Item Outputs？

需要在以下方向中作出选择：

- 继续只展示有证据的 Outputs，把非证据文件作为普通 Project 文件；
- 允许用户从当前文件面板显式登记一个路径；
- 让启动器声明预期输出并在完成后匹配文件；
- 另建一个可重建的登记记录，但不把它当成历史文件快照。

每个候选都要明确：来源、Project/cwd、权限复核、文件删除/移动、Association detach/delete、同名 worktree、重复登记、过期文件和“这是成功产出吗”的文案。

## Existing evidence

- 当前 Outputs 是 transcript 写入证据的有界投影，明确排除没有本地写入证据的 Shell/MCP 名称和脚本文本。
- 当前 WorkItemDetail 已能展示缺失、不可用、部分扫描和当前 Git diff；文件面板可以打开已有路径，但打开能力不等于产出登记。
- ADR-0007 暂不保存历史文件字节，也不把当前 diff 归属于单个 Work Item。

## Constraints

不能悄悄放宽现有 evidence contract，也不能把手动登记做成新的文件访问授权或唯一作者声明。若选择登记，必须先定义其数据权威、限制和撤销语义。

## Completion criterion

明确首发场景采用的产出入口及其完整语义；如果需要登记存储，定义最小记录和与现有证据投影的关系；如果不需要，明确用户如何从普通文件回到 Session 继续修改。

