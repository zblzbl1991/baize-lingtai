// Behavior tests for the Workbench view's pure helpers.
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { filterWorkItems, groupWorkItemsByProject, projectDisplayName } =
  await jiti.import("./workbench-view-helpers.ts");

function item(overrides = {}) {
  return {
    id: overrides.id ?? "id-1",
    projectKey: overrides.projectKey ?? "e:\\projects\\demo",
    projectRoot: overrides.projectRoot ?? "E:\\projects\\demo",
    name: overrides.name ?? "Goal",
    status: overrides.status ?? "in-progress",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    completedAt: overrides.status === "completed" ? "2026-01-02T00:00:00.000Z" : null,
    sessionIds: [],
  };
}

test("the status filter keeps the list's order", () => {
  const items = [
    item({ id: "b", status: "completed", updatedAt: "2026-01-03T00:00:00.000Z" }),
    item({ id: "a", updatedAt: "2026-01-02T00:00:00.000Z" }),
    item({ id: "c", status: "completed", updatedAt: "2026-01-01T00:00:00.000Z" }),
  ];

  assert.equal(filterWorkItems(items, "all").length, 3);
  assert.deepEqual(filterWorkItems(items, "completed").map((i) => i.id), ["b", "c"]);
  assert.deepEqual(filterWorkItems(items, "in-progress").map((i) => i.id), ["a"]);
});

test("items group by Project key, preserving recency order between and inside groups", () => {
  const items = [
    item({ id: "late", projectKey: "p2", projectRoot: "/two", updatedAt: "2026-02-01T00:00:00.000Z" }),
    item({ id: "mid", projectKey: "p1", projectRoot: "/one", updatedAt: "2026-01-02T00:00:00.000Z" }),
    item({ id: "early", projectKey: "p1", projectRoot: "/one-alias", updatedAt: "2026-01-01T00:00:00.000Z" }),
  ];

  const groups = groupWorkItemsByProject(items);
  assert.deepEqual(groups.map((g) => g.projectKey), ["p2", "p1"]);
  assert.deepEqual(groups[1].items.map((i) => i.id), ["mid", "early"]);
  // The group header shows one member's original path form.
  assert.equal(groups[1].projectRoot, "/one");
});

test("the project display name is the final path segment, Windows or POSIX", () => {
  assert.equal(projectDisplayName("E:\\projects\\pi-web"), "pi-web");
  assert.equal(projectDisplayName("/home/u/pi-web/"), "pi-web");
  assert.equal(projectDisplayName("C:\\"), "C:");
});
