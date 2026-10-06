import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

test("new-session route settles Association before the first prompt and exposes failures without dispatch", async () => {
  const previous = process.env.PI_CODING_AGENT_DIR;
  const dir = mkdtempSync(join(tmpdir(), "work-item-new-route-"));
  process.env.PI_CODING_AGENT_DIR = dir;
  const cwd = join(dir, "project"); mkdirSync(cwd);
  const stub = join(dir, "runtime.cjs");
  writeFileSync(stub, "module.exports={startRpcSession:async(...args)=>globalThis.__workItemNewFixture(...args)};");
  const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd(), "@/lib/rpc-manager": stub } });
  const store = await jiti.import("@/lib/work-items");
  const { POST } = await jiti.import("./route.ts");
  const storePath = store.getWorkItemsStorePath();
  const identity = await store.resolveWorkItemProject(cwd);
  const id = "10000000-0000-4000-8000-000000000051";
  let created = 0; let dispatched = 0;
  try {
    const item = await store.createWorkItem(storePath, { ...identity, name: "A" });
    globalThis.__workItemNewFixture = async () => {
      created++;
      return { realSessionId: id, session: { send: async (command) => {
        if (command.type === "prompt") {
          dispatched++;
          assert.ok((await store.readWorkItems(storePath)).find((row) => row.id === item.id).sessionIds.includes(id));
        }
        return {};
      } } };
    };
    const request = (workItemId, type = "prompt") => new Request("http://localhost/api/agent/new", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cwd, type, workItemId, message: "Start", toolNames: [] }) });
    assert.equal((await POST(request(item.id))).status, 200);
    assert.equal(created, 1); assert.equal(dispatched, 1);
    const b = await store.createWorkItem(storePath, { ...identity, name: "B" });
    globalThis.__workItemNewFixture = async () => {
      created++;
      await store.deleteWorkItem(storePath, b.id);
      return { realSessionId: "10000000-0000-4000-8000-000000000052", session: { send: async () => { dispatched++; return {}; } } };
    };
    const failed = await POST(request(b.id));
    assert.equal(failed.status, 404);
    const body = await failed.json(); assert.equal(body.code, "association_pending"); assert.ok(body.sessionId);
    assert.equal(dispatched, 1);
    const missing = await POST(request("00000000-0000-4000-8000-000000000000", "ensure_session"));
    assert.equal(missing.status, 404); assert.equal(created, 2);
  } finally {
    delete globalThis.__workItemNewFixture;
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  }
});
