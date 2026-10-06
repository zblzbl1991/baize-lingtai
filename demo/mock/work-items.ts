import { json, error, type MockRequest } from "./http";
import { allSessions, sessionInfo } from "./sessions/store";
import { PROJECT_ROOT, WORKTREE_ROOT } from "./paths";
import type { WorkItemDto } from "@/components/workbench-view-helpers";
const items: WorkItemDto[] = [];
let seeded = false;
export async function workItemsRoute(request: MockRequest) {
  if (!seeded) {
    seeded = true;
    const session = allSessions().find((s) => s.cwd === PROJECT_ROOT);
    if (session) items.push({ id: "00000000-0000-4000-8000-000000000001", projectKey: PROJECT_ROOT, projectRoot: PROJECT_ROOT, name: "Explore Pi Web", status: "in-progress", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, sessionIds: [session.id] });
  }
  const [, , id, sub, sessionId] = request.segments;
  if (!id) {
    if (request.method === "POST") {
      const body = await request.json<{ projectRoot: string; name: string; sessionIds?: string[] }>();
      const item: WorkItemDto = { id: crypto.randomUUID(), projectKey: body.projectRoot === WORKTREE_ROOT ? PROJECT_ROOT : body.projectRoot, projectRoot: body.projectRoot === WORKTREE_ROOT ? PROJECT_ROOT : body.projectRoot, name: body.name, status: "in-progress", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, sessionIds: body.sessionIds ?? [] };
      items.push(item); return json({ workItem: item }, 201);
    }
    return json({ workItems: items.map((item) => ({ ...item, sessions: item.sessionIds.map((id) => { const session = allSessions().find((s) => s.id === id); return session ? sessionInfo(session) : { id, unavailable: true }; }) })) });
  }
  const item = items.find((item) => item.id === id);
  if (!item) return error("Not found", 404);
  if (sub === "outputs") return json({ outputs: item.sessionIds.length ? [{ filePath: `${item.projectRoot}/README.md`, sourceSessionId: item.sessionIds[0], sourceCwd: item.projectRoot, checkoutRoot: item.projectRoot, lastWrittenAt: item.updatedAt, state: "clean", diffAvailable: false }] : [], incomplete: false, reasons: [] });
  if (sub === "sessions") {
    if (request.method === "DELETE") { item.sessionIds = item.sessionIds.filter((id) => id !== sessionId); return json({ ok: true }); }
    const body = await request.json<{ sessionId: string; expectedWorkItemId: string | null }>();
    const owner = items.find((item) => item.sessionIds.includes(body.sessionId));
    if (owner?.id !== id && (owner?.id ?? null) !== body.expectedWorkItemId) return error("Association conflict", 409, { code: "association_conflict", currentWorkItemId: owner?.id ?? null });
    for (const row of items) row.sessionIds = row.sessionIds.filter((id) => id !== body.sessionId);
    item.sessionIds.push(body.sessionId); item.updatedAt = new Date().toISOString();
    return json({ workItem: item });
  }
  if (request.method === "DELETE") { items.splice(items.indexOf(item), 1); return json({ ok: true }); }
  if (request.method === "PATCH") {
    const body = await request.json<{ name?: string; status?: WorkItemDto["status"] }>();
    if (body.name) item.name = body.name;
    if (body.status) { item.status = body.status; item.completedAt = body.status === "completed" ? new Date().toISOString() : null; }
    item.updatedAt = new Date().toISOString(); return json({ workItem: item });
  }
  return json({ workItem: item });
}
export function associateDemoSession(itemId: string | undefined, sessionId: string) {
  const item = items.find((item) => item.id === itemId);
  if (item && !item.sessionIds.includes(sessionId)) item.sessionIds.push(sessionId);
}
export function demoSessionOwner(sessionId: string) { return items.find((item) => item.sessionIds.includes(sessionId))?.id; }
