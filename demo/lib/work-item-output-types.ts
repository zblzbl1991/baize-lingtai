export interface WorkItemOutput {
  filePath: string;
  sourceSessionId: string;
  sourceCwd: string;
  checkoutRoot: string | null;
  lastWrittenAt: string | null;
  state: "changed" | "clean" | "untracked" | "non-git" | "missing" | "unavailable";
  diffAvailable: boolean;
}
export interface WorkItemOutputsResponse {
  outputs: WorkItemOutput[];
  incomplete: boolean;
  reasons: string[];
}
