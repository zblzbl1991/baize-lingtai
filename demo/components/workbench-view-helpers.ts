import type { WorkItem, WorkItemStatus } from "@/lib/work-item-types";
import type { SessionInfo } from "@/lib/types";

// Pure helpers behind the Workbench (工作台) view: filtering the list by
// status and grouping it by Project. Kept out of the component so the
// grouping stays unit-testable without React.

/** Client-side view of a Work Item record as `GET /api/work-items` returns it. */
export interface WorkItemDto extends WorkItem {
  sessions?: ((SessionInfo & { isRunning?: boolean }) | { id: string; unavailable: true })[];
}

export type WorkbenchFilter = "all" | "in-progress" | "completed";

export function filterWorkItems(
  items: readonly WorkItemDto[],
  filter: WorkbenchFilter,
): WorkItemDto[] {
  if (filter === "all") return [...items];
  const status: WorkItemStatus = filter === "completed" ? "completed" : "in-progress";
  return items.filter((item) => item.status === status);
}

export interface WorkItemProjectGroup {
  projectKey: string;
  /** One member's projectRoot, for the group header. */
  projectRoot: string;
  items: WorkItemDto[];
}

/**
 * Group items by Project (identity key), preserving the list's
 * most-recently-updated-first order both between and inside groups.
 */
export function groupWorkItemsByProject(
  items: readonly WorkItemDto[],
): WorkItemProjectGroup[] {
  const groups = new Map<string, WorkItemProjectGroup>();
  for (const item of items) {
    let group = groups.get(item.projectKey);
    if (!group) {
      group = { projectKey: item.projectKey, projectRoot: item.projectRoot, items: [] };
      groups.set(item.projectKey, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

/** Final path segment of a Project root, for group headers. */
export function projectDisplayName(projectRoot: string): string {
  const segments = projectRoot.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? projectRoot;
}
