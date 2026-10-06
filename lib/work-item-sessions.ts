import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, listAllSessions, readSessionHeader, resolveSessionPath, attachSessionProjectInfo, mergeSessionLists } from "./session-reader";
import { getRpcSession, getRpcSessionInfos } from "./rpc-manager";
import { resolveWorkItemProject, readWorkItems, getWorkItemsStorePath } from "./work-items";
import type { SessionInfo } from "./types";

/** Metadata reads only: never construct an AgentSession to inspect Association. */
export async function resolveWorkItemSession(id: string): Promise<{ projectKey: string; checkoutRoot?: string } | null> {
  const live = getRpcSession(id);
  if (live?.isAlive()) {
    const cwd = live.inner.sessionManager.getHeader()?.cwd;
    return cwd ? resolveWorkItemProject(cwd) : null;
  }
  const filePath = await resolveSessionPath(id);
  if (!filePath) return null;
  const header = readSessionHeader(filePath);
  return header ? resolveWorkItemProject(header.cwd) : null;
}

export async function workItemSessionCatalogue(): Promise<SessionInfo[]> {
  return attachSessionProjectInfo(mergeSessionLists(await listAllSessions({ force: true }), getRpcSessionInfos({ includeTransient: true })));
}

/** A missing catalogue row alone is not evidence of deletion. */
export async function discoverWorkItemSessions() {
  const sessions = await workItemSessionCatalogue();
  const known = new Set(sessions.map((session) => session.id));
  let complete = true;
  const root = join(getAgentDir(), "sessions");
  try {
    for (const dir of await readdir(root, { withFileTypes: true })) {
      if (!dir.isDirectory() && !dir.isSymbolicLink()) continue;
      try {
        for (const file of await readdir(join(root, dir.name))) {
          if (!file.endsWith(".jsonl")) continue;
          try {
            const header = readSessionHeader(join(root, dir.name, file));
            if (header) known.add(header.id); else complete = false;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") complete = false; }
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") complete = false; }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") complete = false; }
  return { sessions, liveness: (id: string): "alive" | "absent" | "unknown" => known.has(id) || getRpcSession(id)?.isAlive() ? "alive" : complete ? "absent" : "unknown" };
}

export async function workItemsView() {
  const { sessions, liveness } = await discoverWorkItemSessions();
  const items = await readWorkItems(getWorkItemsStorePath(), { sessionLiveness: liveness });
  const byId = new Map(sessions.map((session) => [session.id, { ...session, isRunning: getRpcSession(session.id)?.isRunning() ?? false }]));
  return items.map((item) => ({ ...item, sessions: item.sessionIds.map((id) => byId.get(id) ?? { id, unavailable: true })
    .sort((a, b) => ("modified" in b ? b.modified : "").localeCompare("modified" in a ? a.modified : "") || a.id.localeCompare(b.id)) }));
}
