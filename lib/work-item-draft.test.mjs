import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const draft = await jiti.import("./work-item-draft.ts");
const { rekeyDraft } = await jiti.import("./draft-store.ts");
test("parking and restoring a draft carries only its own Work Item intent", () => {
  draft.setWorkItemDraftIntent("new:a:/repo", "goal-a");
  draft.setWorkItemDraftIntent("new:b:/other", "goal-b");
  rekeyDraft("new:a:/repo", "parked:/repo");
  rekeyDraft("parked:/repo", "new:c:/repo");
  assert.equal(draft.getWorkItemDraftIntent("new:c:/repo"), "goal-a");
  assert.equal(draft.getWorkItemDraftIntent("new:b:/other"), "goal-b");
  assert.equal(draft.getWorkItemDraftIntent("new:a:/repo"), undefined);
});
test("different goals in one Project retain independent parked drafts", async () => {
  const { parkComposerDraft, restoreComposerDraft } = await jiti.import("./work-item-composer.ts");
  const { setDraft, getDraft } = await jiti.import("./draft-store.ts");
  setDraft("new:a", { value: "A's unsent text", images: [] });
  draft.setWorkItemDraftIntent("new:a", "goal-a");
  parkComposerDraft("new:a", "/shared");
  restoreComposerDraft("new:b", "/shared", "goal-b");
  assert.equal(getDraft("new:b"), null);
  assert.equal(draft.getWorkItemDraftIntent("new:b"), "goal-b");
  restoreComposerDraft("new:a-resumed", "/shared", "goal-a");
  assert.equal(getDraft("new:a-resumed").value, "A's unsent text");
  assert.equal(draft.getWorkItemDraftIntent("new:a-resumed"), "goal-a");
});
