import { NextResponse } from "next/server";
import { isAbsolute } from "node:path";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  contentTypeResponse,
  invalidRequest,
  requestDeniedResponse,
  storeErrorResponse,
} from "@/lib/work-items-api";
import {
  WORK_ITEM_NAME_MAX_LENGTH,
  createWorkItem,
  getWorkItemsStorePath,
  resolveWorkItemProject,
  isSessionId,
} from "@/lib/work-items";
import { resolveWorkItemSession, workItemsView } from "@/lib/work-item-sessions";

export const dynamic = "force-dynamic";

// Work Items (工作目标, ADR 0007) and their Associations. The store is
// authoritative user data: a store we cannot read or write fails the request
// with a structured `code` and never replaces the file on disk. This route
// owns create/list; Association moves live in the [id]/sessions routes (02).

export async function GET() {
  try {
    const workItems = await workItemsView();
    return NextResponse.json({ workItems });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return requestDeniedResponse();
  }
  if (!hasJsonContentType(req)) {
    return contentTypeResponse();
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidRequest("Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalidRequest("Expected a JSON object");
  }
  const { projectRoot, name, sessionIds } = body as { projectRoot?: unknown; name?: unknown; sessionIds?: unknown };
  if (sessionIds !== undefined && (!Array.isArray(sessionIds) || sessionIds.length > 500 || sessionIds.some((id) => !isSessionId(id)))) return invalidRequest("Invalid sessionIds");

  if (typeof projectRoot !== "string" || !projectRoot.trim() || !isAbsolute(projectRoot)) {
    return invalidRequest("projectRoot must be an absolute path");
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > WORK_ITEM_NAME_MAX_LENGTH) {
    return invalidRequest(`name must be a non-empty string of at most ${WORK_ITEM_NAME_MAX_LENGTH} characters`);
  }

  try {
    // The server, not the picker, decides what Project this item belongs to:
    // worktrees collapse into their main checkout, Windows paths compare
    // case-insensitively through the identity key.
    const identity = await resolveWorkItemProject(projectRoot);
    const workItem = await createWorkItem(getWorkItemsStorePath(), { ...identity, name, sessionIds: sessionIds as string[] | undefined }, { resolveSession: resolveWorkItemSession });
    return NextResponse.json({ workItem }, { status: 201 });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
