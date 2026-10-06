import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

test("real transient wrappers survive absence discovery; incomplete discovery retains unavailable Associations", async () => {
  const previous = process.env.PI_CODING_AGENT_DIR, previousRegistry = globalThis.__piSessions;
  const agentDir = mkdtempSync(join(tmpdir(), "work-item-liveness-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
  const store = await jiti.import("./work-items.ts");
  const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
  const { workItemsView } = await jiti.import("./work-item-sessions.ts");
  const cwd = join(agentDir, "project"); mkdirSync(cwd);
  const manager = SessionManager.inMemory(cwd), liveId = manager.getSessionId();
  const unavailableId = "10000000-0000-4000-8000-000000000099";
  const wrapper = new AgentSessionWrapper({ sessionId: liveId, sessionManager: manager, isStreaming: true, isCompacting: false, isBashRunning: false, extensionRunner: {}, agent: { state: {} }, dispose() {} });
  globalThis.__piSessions = new Map([[liveId, wrapper]]);
  try {
    const identity = await store.resolveWorkItemProject(cwd), path = store.getWorkItemsStorePath();
    await store.createWorkItem(path, { ...identity, name: "Liveness", sessionIds: [liveId, unavailableId] }, { resolveSession: async () => identity });
    const bytes = readFileSync(path, "utf8");
    let view = await workItemsView();
    assert.deepEqual(view[0].sessionIds, [liveId]);
    assert.equal(view[0].sessions[0].transient, true); assert.equal(view[0].sessions[0].isRunning, true);
    const dir = join(agentDir, "sessions", "unreadable"); mkdirSync(dir, { recursive: true });
    const broken = join(dir, "broken.jsonl"); writeFileSync(broken, "{bad header\n");
    view = await workItemsView();
    assert.deepEqual(view[0].sessionIds, [liveId, unavailableId]);
    assert.equal(view[0].sessions.find((session) => session.id === unavailableId).unavailable, true);
    assert.equal(readFileSync(path, "utf8"), bytes, "liveness views never rewrite Associations");
    unlinkSync(broken); wrapper.destroy(); globalThis.__piSessions = new Map();
    view = await workItemsView(); assert.deepEqual(view[0].sessionIds, []);
    assert.equal(readFileSync(path, "utf8"), bytes);
  } finally {
    wrapper.destroy(); globalThis.__piSessions = previousRegistry;
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  }
});
