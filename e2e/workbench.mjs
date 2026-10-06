import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export const WORKBENCH_SESSION = "10000000-0000-4000-8000-000000000101";
export const WORKTREE_SESSION = "10000000-0000-4000-8000-000000000102";
export const OTHER_PROJECT_SESSION = "10000000-0000-4000-8000-000000000103";
export function seedWorkbench(agentDir, rawProject, sessionDir) {
  const project = realpathSync.native(rawProject);
  const git = (...args) => execFileSync("git", ["-C", project, ...args], { stdio: "pipe" });
  git("init"); git("config", "user.email", "fixture@example.test"); git("config", "user.name", "Fixture");
  writeFileSync(join(project, "workbench-output.txt"), "original\n"); git("add", "."); git("commit", "-m", "fixture");
  const worktree = join(realpathSync.native(agentDir), "output-worktree");
  git("worktree", "add", "-b", "workbench-fixture", worktree);
  for (const [id, cwd] of [[WORKBENCH_SESSION, project], [WORKTREE_SESSION, worktree]]) {
    writeFileSync(join(cwd, "workbench-output.txt"), `written in ${id}\n`);
    const timestamp = "2026-01-01T00:00:00.000Z";
    writeFileSync(join(sessionDir, `2026-01-01_${id}.jsonl`), [
      { type: "session", version: 3, id, timestamp, cwd },
      { type: "message", id: "u", parentId: null, timestamp, message: { role: "user", content: `Workbench fixture ${id}` } },
      { type: "message", id: "a", parentId: "u", timestamp, message: { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: "workbench-output.txt" } }] } },
      { type: "message", id: "r", parentId: "a", timestamp, message: { role: "toolResult", toolCallId: "w", toolName: "write", isError: false, content: [{ type: "text", text: "ok" }] } },
    ].map(JSON.stringify).join("\n") + "\n");
  }
  const otherProject = join(agentDir, "unrelated-project"); mkdirSync(otherProject);
  writeFileSync(join(sessionDir, `2026-01-01_${OTHER_PROJECT_SESSION}.jsonl`), [
    { type: "session", version: 3, id: OTHER_PROJECT_SESSION, timestamp: "2026-01-01T00:00:00.000Z", cwd: otherProject },
    { type: "message", id: "u", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "Unrelated Project" } },
  ].map(JSON.stringify).join("\n") + "\n");
  return { project, worktree };
}

export async function checkWorkbench(page, base, fixture) {
  // Exercise real UI creation; the association endpoint consumes native fixture sessions.
  await page.goto(`${base}/?session=${WORKBENCH_SESSION}&view=workbench`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Workbench", exact: true }).waitFor();
  await page.getByRole("button", { name: "New Work Item", exact: true }).click();
  await page.getByLabel("Project", { exact: true }).selectOption(fixture.project);
  await page.locator("form").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "New Work Item", exact: true }).click();
  assert.equal(await page.getByLabel("Project", { exact: true }).inputValue(), fixture.project);
  await page.getByLabel("Name", { exact: true }).fill("E2E work goal");
  await page.getByLabel("Project", { exact: true }).selectOption(fixture.project);
  await page.locator("form").getByRole("button", { name: "New Work Item", exact: true }).click();
  await page.getByRole("button", { name: "E2E work goal", exact: true }).waitFor();
  const { workItems } = await page.evaluate(async () => (await fetch("/api/work-items")).json());
  const item = workItems.find((item) => item.name === "E2E work goal");
  for (const sessionId of [WORKBENCH_SESSION, WORKTREE_SESSION]) {
    const status = await page.evaluate(async ({ id, sessionId }) => (await fetch(`/api/work-items/${id}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, expectedWorkItemId: null }) })).status, { id: item.id, sessionId });
    assert.equal(status, 200);
  }
  // The selected chat is in another Project: Outputs must still open their
  // own checkout and diff, independently of that chat's cwd.
  await page.goto(`${base}/?session=${OTHER_PROJECT_SESSION}&view=workbench`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "E2E work goal", exact: true }).click();
  await page.getByRole("heading", { name: "Outputs", exact: true }).waitFor();
  await page.getByRole("button", { name: join(fixture.worktree, "workbench-output.txt"), exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Current working-tree diff", exact: true }).count(), 2);
  const rows = page.locator(".workbench-output-row");
  await rows.filter({ has: page.getByRole("button", { name: join(fixture.worktree, "workbench-output.txt"), exact: true }) }).getByRole("button", { name: "Current working-tree diff", exact: true }).click();
  await page.locator("#file-panel").getByText(`written in ${WORKTREE_SESSION}`, { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  // Mobile viewer covers the Workbench; close through its normal toolbar.
  if ((page.viewportSize()?.width ?? 1280) < 640) {
    await page.locator("#file-panel button").filter({ has: page.locator("svg") }).first().click().catch(() => {});
    await page.goto(`${base}/?session=${WORKBENCH_SESSION}&view=workbench`, { waitUntil: "domcontentloaded" });
  }
  await page.getByRole("button", { name: "Mark completed", exact: true }).click();
  await page.getByRole("button", { name: "Reopen", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Reopen", exact: true }).waitFor();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await page.getByRole("button", { name: "Mark completed", exact: true }).waitFor();
  // Resume the selected source session without remounting it; reload must
  // follow the chat URL rather than return to the Workbench.
  await page.goto(`${base}/?session=${WORKBENCH_SESSION}&view=workbench`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "E2E work goal", exact: true }).click();
  await page.getByRole("button", { name: "Resume latest session", exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has("view"));
  await page.reload();
  assert.equal(await page.getByRole("heading", { name: "Workbench", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  // Starting from the goal and inspecting System initializes a transient
  // native session; server Association must already exist without a prompt.
  await page.getByRole("button", { name: "E2E work goal", exact: true }).click();
  await page.getByRole("button", { name: "New session", exact: true }).click();
  const composer = page.locator("textarea.chat-input-textarea").first();
  await composer.fill("Unsent Work Item draft must survive view switching");
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await page.getByRole("heading", { name: "Workbench", exact: true }).waitFor();
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  assert.equal(await composer.inputValue(), "Unsent Work Item draft must survive view switching");
  if ((page.viewportSize()?.width ?? 1280) >= 640) {
    const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/agent/new");
    await page.getByRole("button", { name: "System prompt", exact: true }).click();
    const initialized = await response;
    assert.equal(initialized.status(), 200);
    const { sessionId } = await initialized.json();
    const member = await page.evaluate(async (id) => (await (await fetch("/api/work-items")).json()).workItems.find((item) => item.id === id), item.id);
    assert.ok(member.sessionIds.includes(sessionId));
  }
  // Remove goal only: the associated session files must still be readable.
  await page.evaluate(async (id) => { await fetch(`/api/work-items/${id}`, { method: "DELETE" }); }, item.id);
  assert.equal(await page.evaluate(async (id) => (await fetch(`/api/sessions/${id}`)).status, WORKBENCH_SESSION), 200);
  console.log("PASS: Workbench create, associate, two-worktree Outputs/diff, complete, refresh, reopen, native initialization, draft preservation, and session-preserving delete");
}
