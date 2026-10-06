import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
test("raw writes use session cwd and nested local writes survive a parent error", async () => {
  const { extractWorkItemSessionOutputs } = await jiti.import("./work-item-outputs.ts");
  const entries = [
    { type: "message", timestamp: "2026-01-01T00:00:00Z", message: { role: "assistant", content: [
      { type: "toolCall", id: "w", name: "write", arguments: { path: "src/a.ts" } },
      { type: "toolCall", id: "remote", name: "mcp__server_write", arguments: { path: "bad.ts" } },
    ] } },
    { type: "message", message: { role: "toolResult", toolCallId: "w", isError: false } },
    { type: "message", message: { role: "toolResult", toolCallId: "remote", isError: false } },
    { type: "message", timestamp: "2026-01-02T00:00:00Z", message: { role: "toolResult", toolCallId: "code", isError: true, nestedCalls: { complete: true, calls: [
      { name: "edit", status: "ok", arguments: { path: "../b.ts" } },
      { name: "write", status: "error", arguments: { path: "failed.ts" } },
    ] } } },
  ];
  const result = extractWorkItemSessionOutputs(entries, { id: "s", cwd: "/repo/tree" });
  assert.deepEqual(result.outputs.map((r) => r.filePath).sort(), ["/repo/b.ts", "/repo/tree/src/a.ts"]);
  assert.equal(result.incomplete, false);
});

test("failed writes, incomplete nested evidence, and duplicate branches are distinguished", async () => {
  const { extractWorkItemSessionOutputs } = await jiti.import("./work-item-outputs.ts");
  const call = (id, name, args) => ({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] } });
  const result = (id, extra = {}) => ({ type: "message", timestamp: "2026-01-01Z", message: { role: "toolResult", toolCallId: id, isError: false, ...extra } });
  const output = extractWorkItemSessionOutputs([
    call("failed", "write", { path: "bad.txt" }), result("failed", { isError: true }),
    call("a", "write", { path: "a.txt" }), result("a"),
    call("b", "edit", { path: "a.txt" }), result("b"),
    call("patch", "apply_patch", { patch: "*** Begin Patch\n*** Add File: b.txt\n+x\n*** End Patch" }),
    result("patch", { details: { result: { appliedFiles: ["b.txt"], failures: ["failed.txt"] } } }),
    result("code", { nestedCalls: { complete: false, calls: [{ name: "write", status: "ok" }] } }),
    call("shell", "bash", { command: "echo x > shell.txt" }), result("shell"),
  ], { id: "s", cwd: "/repo" });
  assert.deepEqual(output.outputs.map((row) => row.filePath), ["/repo/a.txt", "/repo/b.txt"]);
  assert.equal(output.incomplete, true);
  assert.deepEqual(output.reasons, ["nested"]);
});
test("response-sized evidence and expired scans return explicitly partial results", async () => {
  const { extractWorkItemSessionOutputs } = await jiti.import("./work-item-outputs.ts");
  const entries = [
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: "x".repeat(600000) } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: "w", isError: false, timestamp: 1e100 } },
  ];
  const result = extractWorkItemSessionOutputs(entries, { id: "s", cwd: "/repo" });
  assert.deepEqual(result.outputs, []); assert.equal(result.incomplete, true);
  assert.ok(result.reasons.includes("limit"));
  const expired = extractWorkItemSessionOutputs(entries, { id: "s", cwd: "/repo" }, Date.now() - 1);
  assert.equal(expired.incomplete, true); assert.deepEqual(expired.outputs, []);
});
