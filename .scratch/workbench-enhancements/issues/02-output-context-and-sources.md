# 产出来源展示

Status: ready-for-agent
Assignee: unassigned
Blocked by: 01
Spec: [Workbench small enhancements](../spec.md)
Decision: [产出如何展示路径与最近写入来源会话](../../workbench-small-enhancements/issues/03-output-sources.md#answer)

## What to build

Display filename, relative path, actual checkout/source directory, supported-write time, and a source-session action using existing DTO and native callbacks. Keep full path identifiable and sources/files independently available. Do not modify evidence extraction or authorization.

## Acceptance

- [ ] Two worktrees with equal filenames remain distinguishable; Windows/POSIX and non-Git contexts display correctly, including long paths and unknown timestamps.
- [ ] Source action opens the correct native session; unavailable source disables with visible explanation; missing file may still open its available source.
- [ ] File/diff actions and partial scans retain all existing restrictions/disclaimers; source is not represented as sole authorship or exact tool-entry navigation.
- [ ] Native UI, 44px/mobile wrapping, three languages and demo mirrored.
- [ ] Red-before-green behavior tests cover rendered metadata/actions, correct callback ids, missing/unavailable/partial states; targeted checks and typechecks pass.
- [ ] Own worker commit based on integration including previous batch; record checks under Comments.

## Comments
