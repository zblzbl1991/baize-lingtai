import { associationOwner, attachWorkItemSession, getWorkItemsStorePath, inheritWorkItemSession, readWorkItems, WorkItemRequestError, isWorkItemRequestError, type WorkItemsMutationOptions } from "./work-items";

export class WorkItemAssociationPending extends Error {
  readonly code = "association_pending";
  constructor(public readonly sessionId: string, public readonly workItemId: string, public readonly causeCode: string, public readonly status: number, public readonly sourceSessionId?: string) {
    super("Session created; its Work Item Association needs recovery");
    this.name = "WorkItemAssociationPending";
  }
}
export function isWorkItemAssociationPending(error: unknown): error is WorkItemAssociationPending {
  return error instanceof WorkItemAssociationPending || (error instanceof Error && error.name === "WorkItemAssociationPending" && "sessionId" in error && "workItemId" in error);
}
const PENDING = Symbol.for("pi-web:pending-work-item-associations");
const state = globalThis as typeof globalThis & { [PENDING]?: Map<string, WorkItemAssociationPending> };
function pendingSessions() { return state[PENDING] ??= new Map(); }
export function assertWorkItemSessionReady(id: string) { const error = pendingSessions().get(id); if (error) throw error; }
export function clearPendingWorkItemAssociation(id: string) { pendingSessions().delete(id); }
export async function retryPendingWorkItemAssociation(storePath: string, workItemId: string, sessionId: string, options: WorkItemsMutationOptions) {
  const intent = pendingSessions().get(sessionId);
  if (intent?.sourceSessionId && intent.workItemId === workItemId) await inheritWorkItemSession(storePath, intent.sourceSessionId, sessionId, intent.workItemId, options);
  else await attachWorkItemSession(storePath, workItemId, sessionId, null, options);
  clearPendingWorkItemAssociation(sessionId);
}
export async function validateNewWorkItemSession(workItemId: string, projectKey: string, storePath = getWorkItemsStorePath()) {
  const item = (await readWorkItems(storePath)).find((item) => item.id === workItemId);
  if (!item) throw new WorkItemRequestError("not-found", 404);
  if (item.projectKey !== projectKey) throw new WorkItemRequestError("different-project", 400);
}
export async function settleNewWorkItemSession(workItemId: string, sessionId: string, projectKey: string, storePath = getWorkItemsStorePath(), checkoutRoot?: string) {
  try { await attachWorkItemSession(storePath, workItemId, sessionId, null, { resolveSession: async () => ({ projectKey, checkoutRoot }) }); }
  catch (error) { throw pending(error, sessionId, workItemId); }
}
export function pending(error: unknown, sessionId: string, workItemId: string, sourceSessionId?: string) {
  const result = new WorkItemAssociationPending(sessionId, workItemId, isWorkItemRequestError(error) ? error.code : "store-error", isWorkItemRequestError(error) ? error.status : 500, sourceSessionId);
  pendingSessions().set(sessionId, result);
  return result;
}
export async function forkWithWorkItemAssociation<T extends { newSessionId?: string }>(sourceId: string, projectKey: string, create: () => Promise<T>, storePath = getWorkItemsStorePath(), checkoutRoot?: string): Promise<T> {
  const owner = associationOwner(await readWorkItems(storePath), sourceId);
  const result = await create();
  if (owner && result.newSessionId) {
    try { await inheritWorkItemSession(storePath, sourceId, result.newSessionId, owner, { resolveSession: async () => ({ projectKey, checkoutRoot }) }); }
    catch (error) { throw pending(error, result.newSessionId, owner, sourceId); }
  }
  return result;
}
