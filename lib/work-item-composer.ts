import { getDraft, rekeyDraft } from "./draft-store";
import { getWorkItemDraftIntent, setWorkItemDraftIntent } from "./work-item-draft";
export function parkedComposerDraftKey(cwd: string, workItemId?: string) {
  return workItemId ? `parked-new:goal:${workItemId}:${cwd}` : `parked-new:${cwd}`;
}
export function parkComposerDraft(previous: string, cwd: string) {
  rekeyDraft(previous, parkedComposerDraftKey(cwd, getWorkItemDraftIntent(previous)));
}
export function restoreComposerDraft(next: string, cwd: string, workItemId?: string) {
  const parked = parkedComposerDraftKey(cwd, workItemId);
  const legacy = parkedComposerDraftKey(cwd);
  if (workItemId && !getDraft(parked) && getWorkItemDraftIntent(legacy) === workItemId) rekeyDraft(legacy, parked);
  rekeyDraft(parked, next);
  if (workItemId) setWorkItemDraftIntent(next, workItemId);
}
