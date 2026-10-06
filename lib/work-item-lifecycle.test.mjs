import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";
const jiti = createJiti(import.meta.url);
const store = await jiti.import("./work-items.ts");
const lifecycle = await jiti.import("./work-item-lifecycle.ts");
const source = "10000000-0000-4000-8000-000000000001";
const fork = "10000000-0000-4000-8000-000000000002";
const options = { resolveSession: async () => ({ projectKey: "k" }) };
test("fork inherits while retaining the source and preserving completed status", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "work-item-lifecycle-")), "items.json");
  const item = await store.createWorkItem(path, { name: "A", projectRoot: "/repo", projectKey: "k", sessionIds: [source] }, options);
  await store.setWorkItemStatus(path, item.id, "completed");
  await lifecycle.forkWithWorkItemAssociation(source, "k", async () => ({ newSessionId: fork }), path);
  const [updated] = await store.readWorkItems(path);
  assert.deepEqual(updated.sessionIds, [source, fork]);
  assert.equal(updated.status, "completed");
});
test("a concurrent source move returns the generated id for recovery without repeating the native operation", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "work-item-conflict-")), "items.json");
  const a = await store.createWorkItem(path, { name: "A", projectRoot: "/repo", projectKey: "k", sessionIds: [source] }, options);
  const b = await store.createWorkItem(path, { name: "B", projectRoot: "/repo", projectKey: "k" });
  let calls = 0;
  await assert.rejects(() => lifecycle.forkWithWorkItemAssociation(source, "k", async () => {
    calls++;
    await store.attachWorkItemSession(path, b.id, source, a.id, options);
    return { newSessionId: fork };
  }, path), (e) => e.code === "association_pending" && e.sessionId === fork && e.causeCode === "association_conflict");
  assert.equal(calls, 1);
  assert.throws(() => lifecycle.assertWorkItemSessionReady(fork));
  await assert.rejects(() => lifecycle.retryPendingWorkItemAssociation(path, a.id, fork, options), (e) => e.code === "association_conflict");
  assert.equal(calls, 1);
  await store.attachWorkItemSession(path, b.id, fork, null, options);
  lifecycle.clearPendingWorkItemAssociation(fork);
  assert.doesNotThrow(() => lifecycle.assertWorkItemSessionReady(fork));
});
test("deleting all member ids preserves the Work Item", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "work-item-delete-")), "items.json");
  const item = await store.createWorkItem(path, { name: "A", projectRoot: "/repo", projectKey: "k", sessionIds: [source, fork] }, options);
  await store.removeWorkItemSessions(path, [source, fork]);
  const [updated] = await store.readWorkItems(path);
  assert.equal(updated.id, item.id);
  assert.deepEqual(updated.sessionIds, []);
});

for (const type of ["fork", "fork_branch", "clone"]) test(`${type} persists its Association through the real wrapper without a client callback`, async () => {
  const previous = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "work-item-native-fork-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let wrapper;
  try {
    const cwd = join(agentDir, "project"), sessionDir = join(agentDir, "sessions", "fixture");
    mkdirSync(cwd); mkdirSync(sessionDir, { recursive: true });
    const manager = SessionManager.create(cwd, sessionDir);
    manager.appendMessage({ role: "user", content: "Source", timestamp: Date.now() });
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Response" }], api: "test", provider: "test", model: "test", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
    const id = manager.getSessionId();
    const identity = await store.resolveWorkItemProject(cwd);
    const path = store.getWorkItemsStorePath();
    const item = await store.createWorkItem(path, { ...identity, name: type, sessionIds: [id] }, { resolveSession: async () => identity });
    await store.setWorkItemStatus(path, item.id, "completed");
    const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
    wrapper = new AgentSessionWrapper({ sessionId: id, sessionFile: manager.getSessionFile(), sessionManager: manager, isStreaming: false, isCompacting: false, isBashRunning: false, extensionRunner: {}, agent: { state: {} }, dispose() {} });
    const result = await wrapper.send({ type, entryId: manager.getLeafId(), leafId: manager.getLeafId() });
    assert.ok(result.newSessionId);
    const [updated] = await store.readWorkItems(path);
    assert.deepEqual(updated.sessionIds, [id, result.newSessionId]);
    assert.equal(updated.status, "completed");
    assert.ok(existsSync(manager.getSessionFile()), "source transcript survives native replacement");
  } finally {
    wrapper?.destroy();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  }
});
