// Behavior + static coverage for the Work Items API (ticket 01): GET/POST on
// the collection, PATCH/DELETE on an item. The store is authoritative user
// data, so the routes must surface its typed failures instead of papering over
// them. The store's own semantics live in lib/work-items.test.mjs.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-work-items-route-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, POST } = await jiti.import("./route.ts");
const { PATCH, DELETE } = await jiti.import("./[id]/route.ts");
const { createWorkItem, getWorkItemsStorePath, resolveWorkItemProject } = await jiti.import("@/lib/work-items");
const storePath = getWorkItemsStorePath();

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Host: "localhost" },
    body: JSON.stringify(body),
  });
}

function post(body) {
  return jsonRequest("http://localhost/api/work-items", "POST", body);
}

function patch(id, body) {
  return jsonRequest(`http://localhost/api/work-items/${id}`, "PATCH", body);
}

function itemRoute(id) {
  return { params: Promise.resolve({ id }) };
}

test("GET lists the stored Work Items", async () => {
  await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Seeded" });

  const response = await GET();
  assert.equal(response.status, 200);
  const { workItems } = await response.json();
  assert.equal(workItems.length, 1);
  assert.equal(workItems[0].name, "Seeded");
  assert.equal(workItems[0].status, "in-progress");
});

test("POST derives canonical Project identity from the given projectRoot", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pi-web-work-item-project-"));
  const response = await POST(post({ projectRoot, name: "Fix the parser" }));
  assert.equal(response.status, 201);
  const { workItem } = await response.json();
  assert.equal(workItem.name, "Fix the parser");
  // A non-git directory resolves to itself as the Project root.
  const identity = await resolveWorkItemProject(projectRoot);
  assert.equal(workItem.projectRoot, identity.projectRoot);
  assert.equal(workItem.projectKey, identity.projectKey);

  const onDisk = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(onDisk.version, 1);
  assert.equal(onDisk.workItems.length, 2);
  await rm(projectRoot, { recursive: true, force: true });
});

test("POST rejects invalid input with structured codes", async () => {
  const relative = await POST(post({ projectRoot: "relative/path", name: "X" }));
  assert.equal(relative.status, 400);
  assert.equal((await relative.json()).code, "invalid-request");

  const emptyName = await POST(post({ projectRoot: "/tmp/whatever", name: "   " }));
  assert.equal(emptyName.status, 400);
  assert.equal((await emptyName.json()).code, "invalid-request");

  const missing = await POST(post({}));
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, "invalid-request");
});

test("PATCH renames and changes status; unknown ids are 404 not-found", async () => {
  const created = await POST(post({ projectRoot: "/tmp/patch-project", name: "Before" }));
  const { workItem } = await created.json();

  const renamed = await PATCH(patch(workItem.id, { name: "After" }), itemRoute(workItem.id));
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).workItem.name, "After");

  const completed = await PATCH(patch(workItem.id, { status: "completed" }), itemRoute(workItem.id));
  assert.equal(completed.status, 200);
  const updated = (await completed.json()).workItem;
  assert.equal(updated.status, "completed");
  assert.ok(updated.completedAt);

  const unknown = await PATCH(patch("00000000-0000-4000-8000-000000000000", { name: "Ghost" }), itemRoute("00000000-0000-4000-8000-000000000000"));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).code, "not-found");

  const invalidStatus = await PATCH(patch(workItem.id, { status: "archived" }), itemRoute(workItem.id));
  assert.equal(invalidStatus.status, 400);
  assert.equal((await invalidStatus.json()).code, "invalid-request");

  const emptyPatch = await PATCH(patch(workItem.id, {}), itemRoute(workItem.id));
  assert.equal(emptyPatch.status, 400);

  const badId = await PATCH(patch("not-a-uuid", { name: "X" }), itemRoute("not-a-uuid"));
  assert.equal(badId.status, 400);
  assert.equal((await badId.json()).code, "invalid-request");
});

test("DELETE removes only the item and reports missing ids", async () => {
  const created = await POST(post({ projectRoot: "/tmp/delete-project", name: "Doomed" }));
  const { workItem } = await created.json();

  const removed = await DELETE(new Request("http://localhost/api/work-items/x", { headers: { Host: "localhost" } }), itemRoute(workItem.id));
  assert.equal(removed.status, 200);

  const again = await DELETE(new Request("http://localhost/api/work-items/x", { headers: { Host: "localhost" } }), itemRoute(workItem.id));
  assert.equal(again.status, 404);
  assert.equal((await again.json()).code, "not-found");
});

test("an unreadable store fails closed with a store error, on reads and writes alike", async () => {
  await writeFile(storePath, "{ broken");

  const listed = await GET();
  assert.equal(listed.status, 500);
  assert.equal((await listed.json()).code, "store-error");

  const created = await POST(post({ projectRoot: "/tmp/broken", name: "X" }));
  assert.equal(created.status, 500);
  assert.equal((await created.json()).code, "store-error");

  // The broken bytes survive every failed request.
  assert.equal(await readFile(storePath, "utf8"), "{ broken");
});

test("mutation routes guard untrusted requests and non-JSON bodies", async () => {
  const crossSite = new Request("http://localhost/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "application/json", Host: "localhost", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    body: JSON.stringify({ projectRoot: "/tmp/x", name: "X" }),
  });
  assert.equal((await POST(crossSite)).status, 403);

  const noJson = new Request("http://localhost/api/work-items", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Host: "localhost" },
    body: "projectRoot=/tmp/x",
  });
  assert.equal((await POST(noJson)).status, 415);
});

// The response contract: structured `code` beside the diagnostic `error`, the
// repo's route convention. Behavior for each code is covered above.
const collectionSrc = await readFile(new URL("./route.ts", import.meta.url), "utf8");
const itemSrc = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");

test("routes validate and map store failures through the shared helpers", () => {
  assert.match(collectionSrc, /isApiRequestAllowed\(req\)/);
  assert.match(collectionSrc, /hasJsonContentType\(req\)/);
  assert.match(itemSrc, /isApiRequestAllowed\(req\)/);
  assert.match(itemSrc, /hasJsonContentType\(req\)/);
  assert.match(collectionSrc, /getWorkItemsStorePath\(\)/);
  assert.match(itemSrc, /getWorkItemsStorePath\(\)/);
  // Invalid requests are bounded before they reach the store.
  assert.match(collectionSrc, /isAbsolute/);
  assert.match(collectionSrc, /WORK_ITEM_NAME_MAX_LENGTH/);
  assert.match(itemSrc, /WORK_ITEM_NAME_MAX_LENGTH/);
});
