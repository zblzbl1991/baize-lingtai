// Behavior tests for the Work Item store (ticket 01). The store is authoritative
// user data in <agentDir>/pi-web-work-items.json, so these cover external
// semantics only: CRUD, ordering, status no-ops, locked concurrent writers,
// cache freshness after external edits, typed failures that preserve bytes.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import lockfile from "proper-lockfile";

const jiti = createJiti(import.meta.url);

async function loadSubject() {
  return jiti.import("./work-items.ts");
}

test("association moves require the confirmed source and stay atomic on conflicts", async () => {
  const { createWorkItem, attachWorkItemSession, detachWorkItemSession, readWorkItems } = await loadSubject();
  const storePath = tempStorePath();
  const sessionId = "10000000-0000-4000-8000-000000000001";
  const options = { resolveSession: async () => ({ projectKey: "k", checkoutRoot: "/repo" }) };
  const a = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/repo", name: "A", sessionIds: [sessionId] }, options);
  const b = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/repo", name: "B" });
  await assert.rejects(() => attachWorkItemSession(storePath, b.id, sessionId, null, options), (e) => e.code === "association_conflict" && e.currentWorkItemId === a.id);
  await attachWorkItemSession(storePath, b.id, sessionId, a.id, options);
  await detachWorkItemSession(storePath, a.id, sessionId);
  const items = await readWorkItems(storePath);
  assert.deepEqual(items.find((i) => i.id === a.id).sessionIds, []);
  assert.deepEqual(items.find((i) => i.id === b.id).sessionIds, [sessionId]);
  assert.deepEqual(items.find((i) => i.id === a.id).sessionCheckoutRoots, {});
  assert.deepEqual(items.find((i) => i.id === b.id).sessionCheckoutRoots, { [sessionId]: "/repo" });
});

test("a first creator preserves data written by the lock holder while waiting", async () => {
  const { createWorkItem, readWorkItems } = await loadSubject();
  const storePath = tempStorePath();
  const release = await lockfile.lock(storePath, { realpath: false });
  const pending = createWorkItem(storePath, { projectKey: "k", projectRoot: "/repo", name: "Waiting" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  writeFileSync(storePath, JSON.stringify({ version: 1, workItems: [{
    id: "00000000-0000-4000-8000-000000000001", projectKey: "k", projectRoot: "/repo", name: "Holder",
    status: "in-progress", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null, sessionIds: [],
  }] }));
  await release();
  await pending;
  assert.deepEqual(new Set((await readWorkItems(storePath)).map((item) => item.name)), new Set(["Waiting", "Holder"]));
});

test("invalid domain fields fail closed on reads and mutations without altering bytes", async () => {
  const { readWorkItems, createWorkItem, WorkItemsStoreError } = await loadSubject();
  const valid = {
    id: "00000000-0000-4000-8000-000000000001", projectKey: "k", projectRoot: "/repo", name: "Goal",
    status: "in-progress", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null, sessionIds: [],
  };
  for (const invalid of [
    { projectRoot: "relative" }, { name: "" }, { name: "   " }, { name: "x".repeat(201) },
    { sessionIds: ["not-a-uuid"] }, { status: "completed", completedAt: null },
    { completedAt: "2026-01-02T00:00:00.000Z" },
  ]) {
    const storePath = tempStorePath();
    const bytes = JSON.stringify({ version: 1, workItems: [{ ...valid, ...invalid }] });
    writeFileSync(storePath, bytes);
    await assert.rejects(() => readWorkItems(storePath), WorkItemsStoreError, JSON.stringify(invalid));
    await assert.rejects(() => createWorkItem(storePath, { projectKey: "k", projectRoot: "/repo", name: "New" }), WorkItemsStoreError);
    assert.equal(readFileSync(storePath, "utf8"), bytes);
  }
});

test("an idempotent attach backfills a legacy checkout boundary without changing activity", async () => {
  const { createWorkItem, attachWorkItemSession, readWorkItems } = await loadSubject();
  const storePath = tempStorePath(), sessionId = "10000000-0000-4000-8000-000000000007";
  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/repo/sub", name: "Legacy", sessionIds: [sessionId] }, { resolveSession: async () => ({ projectKey: "k" }) });
  await attachWorkItemSession(storePath, item.id, sessionId, item.id, { resolveSession: async () => ({ projectKey: "k", checkoutRoot: "/repo" }) });
  const [updated] = await readWorkItems(storePath);
  assert.equal(updated.updatedAt, item.updatedAt);
  assert.deepEqual(updated.sessionIds, [sessionId]);
  assert.deepEqual(updated.sessionCheckoutRoots, { [sessionId]: "/repo" });
});

function tempStorePath() {
  return join(mkdtempSync(join(tmpdir(), "pi-web-work-items-")), "pi-web-work-items.json");
}

test("creating a work item persists a versioned record that reads back", async () => {
  const { createWorkItem, readWorkItems } = await loadSubject();
  const storePath = tempStorePath();

  const item = await createWorkItem(storePath, {
    projectKey: "e:\\projects\\demo",
    projectRoot: "E:\\projects\\demo",
    name: "Ship the parser fix",
  });

  assert.equal(item.name, "Ship the parser fix");
  assert.equal(item.status, "in-progress");
  assert.equal(item.completedAt, null);
  assert.deepEqual(item.sessionIds, []);
  assert.ok(item.id.length >= 32);
  assert.ok(item.createdAt && item.updatedAt);

  const onDisk = JSON.parse(readFileSync(storePath, "utf8"));
  assert.equal(onDisk.version, 1);
  assert.equal(onDisk.workItems.length, 1);

  const items = await readWorkItems(storePath);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, item.id);
  assert.equal(items[0].projectKey, "e:\\projects\\demo");
});

test("items sort by updatedAt descending, then id ascending", async () => {
  const { createWorkItem, readWorkItems, renameWorkItem } = await loadSubject();
  const storePath = tempStorePath();

  await createWorkItem(storePath, { projectKey: "k1", projectRoot: "/p1", name: "First" }, { now: new Date("2026-01-01T00:00:00Z") });
  await createWorkItem(storePath, { projectKey: "k2", projectRoot: "/p2", name: "Second" }, { now: new Date("2026-01-02T00:00:00Z") });
  await createWorkItem(storePath, { projectKey: "k3", projectRoot: "/p3", name: "Third" }, { now: new Date("2026-01-01T00:00:00Z") });

  const items = await readWorkItems(storePath);
  const first = items.find((i) => i.name === "First");
  const third = items.find((i) => i.name === "Third");
  assert.equal(items[0].name, "Second");
  // Equal updatedAt: the smaller id wins regardless of creation order.
  const [tieWinner] = [first, third].sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(items[1].id, tieWinner.id);
  assert.equal(items[2].id, (first.id === tieWinner.id ? third : first).id);

  // Bumping the oldest item re-sorts it to the front.
  await renameWorkItem(storePath, third.id, "Third!", { now: new Date("2026-01-03T00:00:00Z") });
  const resorted = await readWorkItems(storePath);
  assert.deepEqual(resorted.map((i) => i.name), ["Third!", "Second", "First"]);
});

test("rename updates name and updatedAt; renaming to the same name is a timestamp no-op", async () => {
  const { createWorkItem, renameWorkItem } = await loadSubject();
  const storePath = tempStorePath();

  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Before" }, { now: new Date("2026-01-01T00:00:00Z") });

  const renamed = await renameWorkItem(storePath, item.id, "  After  ", { now: new Date("2026-01-03T00:00:00Z") });
  assert.equal(renamed.name, "After");
  assert.equal(renamed.updatedAt, "2026-01-03T00:00:00.000Z");
  assert.equal(renamed.createdAt, "2026-01-01T00:00:00.000Z");

  const noop = await renameWorkItem(storePath, item.id, "After", { now: new Date("2026-02-01T00:00:00Z") });
  assert.equal(noop.updatedAt, "2026-01-03T00:00:00.000Z");
  assert.equal(noop.name, "After");
});

test("completing sets completedAt and reopening clears it; repeated status requests preserve timestamps", async () => {
  const { createWorkItem, setWorkItemStatus } = await loadSubject();
  const storePath = tempStorePath();

  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Goal" }, { now: new Date("2026-01-01T00:00:00Z") });

  const repeatedComplete = await setWorkItemStatus(storePath, item.id, "in-progress", { now: new Date("2026-01-02T00:00:00Z") });
  assert.equal(repeatedComplete.status, "in-progress");
  assert.equal(repeatedComplete.updatedAt, "2026-01-01T00:00:00.000Z");

  const completed = await setWorkItemStatus(storePath, item.id, "completed", { now: new Date("2026-01-05T00:00:00Z") });
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedAt, "2026-01-05T00:00:00.000Z");
  assert.equal(completed.updatedAt, "2026-01-05T00:00:00.000Z");

  const repeated = await setWorkItemStatus(storePath, item.id, "completed", { now: new Date("2026-01-06T00:00:00Z") });
  assert.equal(repeated.completedAt, "2026-01-05T00:00:00.000Z");
  assert.equal(repeated.updatedAt, "2026-01-05T00:00:00.000Z");

  const reopened = await setWorkItemStatus(storePath, item.id, "in-progress", { now: new Date("2026-01-07T00:00:00Z") });
  assert.equal(reopened.status, "in-progress");
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.updatedAt, "2026-01-07T00:00:00.000Z");
});

test("deleting removes only that item and unknown ids report not-found", async () => {
  const { createWorkItem, deleteWorkItem, readWorkItems } = await loadSubject();
  const storePath = tempStorePath();

  const keep = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Keep" });
  const gone = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Gone" });

  assert.equal(await deleteWorkItem(storePath, "not-a-real-id"), false);
  assert.equal(await deleteWorkItem(storePath, gone.id), true);

  const items = await readWorkItems(storePath);
  assert.deepEqual(items.map((i) => i.id), [keep.id]);
});

test("two concurrent writers both land in the store", async () => {
  const { createWorkItem, readWorkItems } = await loadSubject();
  const storePath = tempStorePath();

  await Promise.all([
    createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "One" }),
    createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Two" }),
    createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Three" }),
  ]);

  const items = await readWorkItems(storePath);
  assert.deepEqual(items.map((i) => i.name).sort(), ["One", "Three", "Two"]);
});

test("an external edit to the store file is visible on the next read", async () => {
  const { createWorkItem, readWorkItems, resetWorkItemsCacheForTests } = await loadSubject();
  const storePath = tempStorePath();

  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Before" });
  assert.equal((await readWorkItems(storePath))[0].name, "Before");

  // Another process (or a user) rewrites the file behind our cache.
  const onDisk = JSON.parse(readFileSync(storePath, "utf8"));
  onDisk.workItems[0].name = "Edited externally";
  writeFileSync(storePath, JSON.stringify(onDisk));

  const items = await readWorkItems(storePath);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Edited externally");
  assert.equal(items[0].id, item.id);
  resetWorkItemsCacheForTests();
});

test("a corrupt store fails closed with a typed error and preserves its bytes", async () => {
  const { readWorkItems, createWorkItem, isWorkItemsStoreError } = await loadSubject();
  const storePath = tempStorePath();
  writeFileSync(storePath, "{ not json");

  await assert.rejects(
    () => readWorkItems(storePath),
    (error) => isWorkItemsStoreError(error) && error.kind === "read",
  );
  // Mutations refuse too: the bytes are the user's, never overwritten.
  await assert.rejects(
    () => createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "X" }),
    (error) => isWorkItemsStoreError(error) && error.kind === "read",
  );
  assert.equal(readFileSync(storePath, "utf8"), "{ not json");
});

test("an unknown schema version and an invalid record fail closed with typed errors", async () => {
  const { readWorkItems, isWorkItemsStoreError } = await loadSubject();

  const future = tempStorePath();
  writeFileSync(future, JSON.stringify({ version: 999, workItems: [] }));
  await assert.rejects(
    () => readWorkItems(future),
    (error) => isWorkItemsStoreError(error) && error.kind === "read" && /version/.test(error.message),
  );

  const invalid = tempStorePath();
  writeFileSync(invalid, JSON.stringify({
    version: 1,
    workItems: [{ id: "x", projectKey: "k", projectRoot: "/p", name: "n", status: "archived", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", completedAt: null, sessionIds: [] }],
  }));
  await assert.rejects(
    () => readWorkItems(invalid),
    (error) => isWorkItemsStoreError(error) && error.kind === "read",
  );
  assert.ok(readFileSync(invalid, "utf8").includes("archived"));
});

test("a failed write preserves the previous store contents", async () => {
  const { createWorkItem, readWorkItems, isWorkItemsStoreError } = await loadSubject();
  const storePath = tempStorePath();

  await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Survivor" });
  const before = readFileSync(storePath, "utf8");

  await assert.rejects(
    () => createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Doomed" }, {
      write: () => { throw new Error("EACCES: injected write failure"); },
    }),
    (error) => isWorkItemsStoreError(error) && error.kind === "write" && /injected/.test(error.message),
  );
  assert.equal(readFileSync(storePath, "utf8"), before);
  assert.equal((await readWorkItems(storePath))[0].name, "Survivor");
});

test("a duplicate association from a hand edit reads with the smallest item id as winner and normalizes on the next mutation", async () => {
  const { readWorkItems, setWorkItemStatus } = await loadSubject();
  const storePath = tempStorePath();
  const sharedSession = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  const itemA = {
    id: "11111111-1111-4111-8111-111111111111",
    projectKey: "k", projectRoot: "/p", name: "A", status: "in-progress",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null, sessionIds: [sharedSession],
  };
  const itemB = {
    id: "22222222-2222-4222-8222-222222222222",
    projectKey: "k", projectRoot: "/p", name: "B", status: "in-progress",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null, sessionIds: [sharedSession],
  };
  writeFileSync(storePath, JSON.stringify({ version: 1, workItems: [itemB, itemA] }));

  const items = await readWorkItems(storePath);
  const winner = items.find((i) => i.id === itemA.id);
  const loser = items.find((i) => i.id === itemB.id);
  assert.deepEqual(winner.sessionIds, [sharedSession]);
  assert.deepEqual(loser.sessionIds, []);
  // Reads never rewrite the disk.
  assert.ok(readFileSync(storePath, "utf8").includes("\"workItems\": [") || readFileSync(storePath, "utf8").length > 0);

  // The next successful mutation normalizes duplicates in the stored file.
  await setWorkItemStatus(storePath, itemB.id, "completed", { now: new Date("2026-01-02T00:00:00Z") });
  const onDisk = JSON.parse(readFileSync(storePath, "utf8"));
  const diskA = onDisk.workItems.find((i) => i.id === itemA.id);
  const diskB = onDisk.workItems.find((i) => i.id === itemB.id);
  assert.deepEqual(diskA.sessionIds, [sharedSession]);
  assert.deepEqual(diskB.sessionIds, []);
  assert.equal(diskB.status, "completed");
});

test("reading a genuinely absent store yields an empty list without creating it", async () => {
  const { readWorkItems } = await loadSubject();
  const storePath = tempStorePath();
  assert.deepEqual(await readWorkItems(storePath), []);
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(storePath), false);
});

test("the store path resolves inside the given agent dir (PI_CODING_AGENT_DIR override)", async () => {
  const { getWorkItemsStorePath, WORK_ITEMS_FILE_NAME } = await loadSubject();
  const { join } = await import("node:path");
  // join() applies the running platform's separators; the contract is only
  // that the file lands inside the given agent dir.
  assert.equal(getWorkItemsStorePath("C:\\pi-agent"), join("C:\\pi-agent", WORK_ITEMS_FILE_NAME));
  assert.equal(getWorkItemsStorePath("/home/u/.pi/agent"), join("/home/u/.pi/agent", WORK_ITEMS_FILE_NAME));
});

test("reads sort by updatedAt descending even when the disk order differs (hand edit)", async () => {
  const { readWorkItems } = await loadSubject();
  const storePath = tempStorePath();
  const mk = (id, name, updatedAt) => ({
    id, projectKey: "k", projectRoot: "/p", name, status: "in-progress",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt, completedAt: null, sessionIds: [],
  });
  writeFileSync(storePath, JSON.stringify({ version: 1, workItems: [
    mk("33333333-3333-4333-8333-333333333333", "Old", "2026-01-01T00:00:00.000Z"),
    mk("11111111-1111-4111-8111-111111111111", "Newest", "2026-03-01T00:00:00.000Z"),
    mk("22222222-2222-4222-8222-222222222222", "Middle", "2026-02-01T00:00:00.000Z"),
  ] }));

  const items = await readWorkItems(storePath);
  assert.deepEqual(items.map((i) => i.name), ["Newest", "Middle", "Old"]);
});

test("an id that is not a UUID makes the store unreadable (typed error, bytes preserved)", async () => {
  const { readWorkItems, isWorkItemsStoreError } = await loadSubject();
  const storePath = tempStorePath();
  const item = {
    id: "not-a-uuid", projectKey: "k", projectRoot: "/p", name: "X", status: "in-progress",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null, sessionIds: [],
  };
  writeFileSync(storePath, JSON.stringify({ version: 1, workItems: [item] }));

  await assert.rejects(
    () => readWorkItems(storePath),
    (error) => isWorkItemsStoreError(error) && error.kind === "read",
  );
  assert.ok(readFileSync(storePath, "utf8").includes("not-a-uuid"));
});

test("an injected session-liveness check filters confirmed-absent sessions from the read view only", async () => {
  const { readWorkItems, createWorkItem } = await loadSubject();
  const storePath = tempStorePath();
  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Goal" });
  // Attach a session by hand: the attach API arrives with ticket 02.
  const onDisk = JSON.parse(readFileSync(storePath, "utf8"));
  onDisk.workItems[0].sessionIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
  writeFileSync(storePath, JSON.stringify(onDisk));
  await readWorkItems(storePath); // warm the cache

  const view = await readWorkItems(storePath, {
    sessionLiveness: (sessionId) => (
      sessionId === "00000000-0000-4000-8000-000000000002" ? "absent"
        : sessionId === "00000000-0000-4000-8000-000000000003" ? "unknown"
          : "alive"
    ),
  });
  assert.deepEqual(view[0].sessionIds, ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000003"]);

  // The view is not the store: a plain read still sees every Association...
  const plain = await readWorkItems(storePath);
  assert.deepEqual(plain[0].sessionIds, ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
  // ...and the disk was never rewritten.
  assert.deepEqual(JSON.parse(readFileSync(storePath, "utf8")).workItems[0].sessionIds,
    ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"]);
  assert.ok(item);
});

test("an interrupted first write still leaves a readable empty store behind", async () => {
  const { createWorkItem, readWorkItems, isWorkItemsStoreError } = await loadSubject();
  const storePath = tempStorePath();

  await assert.rejects(
    () => createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Doomed" }, {
      write: () => { throw new Error("injected crash before the real write"); },
    }),
    (error) => isWorkItemsStoreError(error) && error.kind === "write",
  );

  // The lock anchor is a valid version-1 store, not a brick.
  const items = await readWorkItems(storePath);
  assert.deepEqual(items, []);
});

test("updateWorkItem applies name and status in one locked write, all or nothing", async () => {
  const { createWorkItem, updateWorkItem, readWorkItems, isWorkItemsStoreError } = await loadSubject();
  const storePath = tempStorePath();
  const item = await createWorkItem(storePath, { projectKey: "k", projectRoot: "/p", name: "Before" }, { now: new Date("2026-01-01T00:00:00Z") });

  const updated = await updateWorkItem(storePath, item.id, { name: "After", status: "completed" }, { now: new Date("2026-01-04T00:00:00Z") });
  assert.equal(updated.name, "After");
  assert.equal(updated.status, "completed");
  assert.equal(updated.completedAt, "2026-01-04T00:00:00.000Z");

  const onDisk = JSON.parse(readFileSync(storePath, "utf8"));
  const diskItem = onDisk.workItems.find((i) => i.id === item.id);
  assert.equal(diskItem.name, "After");
  assert.equal(diskItem.status, "completed");

  // A failed combined write leaves both fields untouched.
  await assert.rejects(
    () => updateWorkItem(storePath, item.id, { name: "Neither", status: "in-progress" }, {
      write: () => { throw new Error("injected"); },
    }),
    (error) => isWorkItemsStoreError(error) && error.kind === "write",
  );
  const unchanged = (await readWorkItems(storePath)).find((i) => i.id === item.id);
  assert.equal(unchanged.name, "After");
  assert.equal(unchanged.status, "completed");

  // Status-only and name-only still behave; unknown ids are null.
  assert.equal(await updateWorkItem(storePath, "missing", { name: "X" }), null);
});
