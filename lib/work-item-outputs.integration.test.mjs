import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, realpathSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createJiti } from "jiti";

test("Outputs refresh file states after commits and deletion without changing transcript evidence", async () => {
  const agentDir = mkdtempSync(join(realpathSync.native(tmpdir()), "work-item-output-integration-"));
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const project = join(agentDir, "project"); mkdirSync(project);
    const git = (...args) => execFileSync("git", ["-C", project, ...args], { stdio: "pipe" });
    git("init"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
    const file = join(project, "a.txt"); writeFileSync(file, "original\n"); git("add", "."); git("commit", "-m", "fixture"); writeFileSync(file, "changed\n");
    const cwd = join(project, "sub"); mkdirSync(cwd);
    const dir = join(agentDir, "sessions", "fixture"); mkdirSync(dir, { recursive: true });
    const sessionId = "10000000-0000-4000-8000-000000000011";
    writeFileSync(join(dir, `2026-01-01_${sessionId}.jsonl`), [
      { type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00Z", cwd },
      { type: "message", id: "user", parentId: null, message: { role: "user", content: "Write sibling output" } },
      { type: "message", id: "a", parentId: "user", message: { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: "../a.txt" } }] } },
      { type: "message", id: "b", parentId: "a", message: { role: "toolResult", toolCallId: "w", isError: false, content: [] } },
    ].map(JSON.stringify).join("\n") + "\n");
    const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
    const { createWorkItem, getWorkItemsStorePath, resolveWorkItemProject } = await jiti.import("./work-items.ts");
    const { resolveWorkItemSession } = await jiti.import("./work-item-sessions.ts");
    const { readWorkItemOutputs } = await jiti.import("./work-item-outputs.ts");
    const { allowFileRoot } = await jiti.import("./file-access.ts");
    allowFileRoot(project); // The user also browsed this checkout root.
    const identity = await resolveWorkItemProject(cwd);
    const item = await createWorkItem(getWorkItemsStorePath(), { ...identity, name: "Output", sessionIds: [sessionId] }, { resolveSession: resolveWorkItemSession });
    let result = await readWorkItemOutputs(item.id);
    assert.ok(result.outputs[0], JSON.stringify(result));
    assert.equal(result.outputs[0].filePath, file);
    assert.equal(result.outputs[0].state, "changed"); assert.equal(result.outputs[0].diffAvailable, true);
    assert.equal(result.outputs[0].checkoutRoot, project);
    git("add", "a.txt"); git("commit", "-m", "land output");
    result = await readWorkItemOutputs(item.id);
    assert.equal(result.outputs[0].state, "clean"); assert.equal(result.outputs[0].diffAvailable, false);
    unlinkSync(file);
    result = await readWorkItemOutputs(item.id);
    assert.equal(result.outputs[0].state, "missing"); assert.equal(result.outputs[0].diffAvailable, false);
  } finally { if (before === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = before; }
});

async function checkRemovedCheckout(subdirectory) {
  const agentDir = mkdtempSync(join(realpathSync.native(tmpdir()), "work-item-removed-output-"));
  const before = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const main = join(agentDir, "main"), checkout = join(agentDir, "checkout"); mkdirSync(main);
    const git = (...args) => execFileSync("git", ["-C", main, ...args], { stdio: "pipe" });
    git("init"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
    writeFileSync(join(main, "a.txt"), "original\n"); git("add", "."); git("commit", "-m", "fixture");
    git("worktree", "add", "-b", "fixture", checkout);
    const cwd = subdirectory ? join(checkout, "sub") : checkout;
    if (subdirectory) mkdirSync(cwd);
    const dir = join(agentDir, "sessions", "fixture"); mkdirSync(dir, { recursive: true });
    const sessionId = subdirectory ? "10000000-0000-4000-8000-000000000013" : "10000000-0000-4000-8000-000000000012";
    writeFileSync(join(dir, `2026-01-01_${sessionId}.jsonl`), [
      { type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00Z", cwd },
      { type: "message", id: "u", parentId: null, message: { role: "user", content: "write" } },
      { type: "message", id: "a", parentId: "u", message: { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: subdirectory ? "../a.txt" : "a.txt" } }, { type: "toolCall", id: "outside", name: "write", arguments: { path: subdirectory ? "../../outside.txt" : "../outside.txt" } }] } },
      { type: "message", id: "r", parentId: "a", message: { role: "toolResult", toolCallId: "w", isError: false, content: [] } },
      { type: "message", id: "s", parentId: "r", message: { role: "toolResult", toolCallId: "outside", isError: false, content: [] } },
    ].map(JSON.stringify).join("\n") + "\n");
    const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
    const { createWorkItem, getWorkItemsStorePath, resolveWorkItemProject } = await jiti.import("./work-items.ts");
    const { resolveWorkItemSession } = await jiti.import("./work-item-sessions.ts");
    const { readWorkItemOutputs } = await jiti.import("./work-item-outputs.ts");
    const { invalidateProjectCache } = await jiti.import("./worktree.ts");
    const { allowFileRoot } = await jiti.import("./file-access.ts");
    allowFileRoot(main); allowFileRoot(checkout); allowFileRoot(agentDir);
    const identity = await resolveWorkItemProject(cwd);
    const item = await createWorkItem(getWorkItemsStorePath(), { ...identity, name: "Removed", sessionIds: [sessionId] }, { resolveSession: resolveWorkItemSession });
    let result = await readWorkItemOutputs(item.id);
    assert.equal(result.outputs.length, 1); assert.equal(result.outputs[0].state, "clean");
    // Move only this test's resolved checkout to a sibling backup. The old
    // native path and Git registration disappear; transcript bytes survive.
    renameSync(checkout, join(agentDir, "backup")); git("worktree", "prune"); invalidateProjectCache();
    result = await readWorkItemOutputs(item.id);
    assert.equal(result.outputs.length, 1, JSON.stringify(result));
    assert.equal(result.outputs[0].filePath, join(checkout, "a.txt"));
    assert.equal(result.outputs[0].checkoutRoot, checkout);
    assert.equal(result.outputs[0].state, "missing"); assert.equal(result.outputs[0].diffAvailable, false);
    assert.ok(result.reasons.includes("access"), "outside-checkout evidence remains omitted");
  } finally { if (before === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = before; }
}

test("a removed checkout keeps missing Outputs at its original path without granting access", () => checkRemovedCheckout(false));
test("a removed checkout preserves sibling Outputs from a subdirectory session", () => checkRemovedCheckout(true));

test("Git lookup failure is unavailable rather than a misleading non-Git file", async () => {
  const agentDir = mkdtempSync(join(realpathSync.native(tmpdir()), "work-item-git-unavailable-"));
  const previousAgent = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
  const previousPath = process.env[pathKey];
  try {
    const cwd = join(agentDir, "project"), dir = join(agentDir, "sessions", "fixture");
    mkdirSync(cwd); mkdirSync(dir, { recursive: true });
    const git = (...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    git("init"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
    writeFileSync(join(cwd, "a.txt"), "original\n"); git("add", "."); git("commit", "-m", "fixture");
    const sessionId = "10000000-0000-4000-8000-000000000014";
    writeFileSync(join(dir, `2026-01-01_${sessionId}.jsonl`), [
      { type: "session", version: 3, id: sessionId, timestamp: "2026-01-01T00:00:00Z", cwd },
      { type: "message", id: "u", parentId: null, message: { role: "user", content: "write" } },
      { type: "message", id: "a", parentId: "u", message: { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: "a.txt" } }] } },
      { type: "message", id: "r", parentId: "a", message: { role: "toolResult", toolCallId: "w", isError: false, content: [] } },
    ].map(JSON.stringify).join("\n") + "\n");
    const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
    const store = await jiti.import("./work-items.ts");
    const { resolveWorkItemSession } = await jiti.import("./work-item-sessions.ts");
    const { readWorkItemOutputs } = await jiti.import("./work-item-outputs.ts");
    const { allowFileRoot } = await jiti.import("./file-access.ts");
    allowFileRoot(cwd);
    const item = await store.createWorkItem(store.getWorkItemsStorePath(), { ...await store.resolveWorkItemProject(cwd), name: "Unavailable Git", sessionIds: [sessionId] }, { resolveSession: resolveWorkItemSession });
    assert.equal((await readWorkItemOutputs(item.id)).outputs[0].state, "clean");
    process.env[pathKey] = ""; // Inject missing Git while retaining the actual checkout and transcript.
    const result = await readWorkItemOutputs(item.id);
    assert.equal(result.outputs[0].state, "unavailable");
    assert.equal(result.outputs[0].diffAvailable, false); assert.ok(result.reasons.includes("unavailable"));
  } finally {
    if (previousPath === undefined) delete process.env[pathKey]; else process.env[pathKey] = previousPath;
    if (previousAgent === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgent;
  }
});
