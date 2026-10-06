/** Client-safe domain records; persistence and SDK adapters live separately. */
export type WorkItemStatus = "in-progress" | "completed";
export interface WorkItem {
  id: string;
  projectKey: string;
  projectRoot: string;
  name: string;
  status: WorkItemStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sessionIds: string[];
  /** Checkout boundaries validated when the Association was established. */
  sessionCheckoutRoots?: Record<string, string>;
}
