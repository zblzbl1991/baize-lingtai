import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  contentTypeResponse,
  invalidRequest,
  notFoundResponse,
  requestDeniedResponse,
  storeErrorResponse,
} from "@/lib/work-items-api";
import {
  WORK_ITEM_NAME_MAX_LENGTH,
  deleteWorkItem,
  getWorkItemsStorePath,
  isWorkItemId,
  updateWorkItem,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";

// Rename / complete / reopen / delete one Work Item. Deleting removes only
// the item and its Associations — native session files are never touched.
// Status is organizational: no agent permission changes on completion.

function withValidId(
  req: Request,
  params: Promise<{ id: string }>,
): Promise<string | NextResponse> {
  return params.then(({ id }) => {
    if (!isWorkItemId(id)) return invalidRequest("id must be a UUID");
    return id;
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isApiRequestAllowed(req)) {
    return requestDeniedResponse();
  }
  if (!hasJsonContentType(req)) {
    return contentTypeResponse();
  }
  const id = await withValidId(req, params);
  if (typeof id !== "string") return id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidRequest("Invalid JSON body");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return invalidRequest("Expected a JSON object");
  }
  const { name, status } = body as { name?: unknown; status?: unknown };
  const renames = "name" in (body as object);
  const setsStatus = "status" in (body as object);
  if (!renames && !setsStatus) {
    return invalidRequest("Send name or status");
  }
  if (renames && (typeof name !== "string" || !name.trim() || name.trim().length > WORK_ITEM_NAME_MAX_LENGTH)) {
    return invalidRequest(`name must be a non-empty string of at most ${WORK_ITEM_NAME_MAX_LENGTH} characters`);
  }
  if (setsStatus && status !== "in-progress" && status !== "completed") {
    return invalidRequest("status must be \"in-progress\" or \"completed\"");
  }

  try {
    // One locked write for both fields: a failure must not persist half of
    // the request.
    const workItem = await updateWorkItem(
      getWorkItemsStorePath(),
      id,
      {
        ...(renames ? { name: name as string } : {}),
        ...(setsStatus ? { status: status as "in-progress" | "completed" } : {}),
      },
    );
    if (!workItem) return notFoundResponse();
    return NextResponse.json({ workItem });
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isApiRequestAllowed(req)) {
    return requestDeniedResponse();
  }
  const id = await withValidId(req, params);
  if (typeof id !== "string") return id;
  try {
    const removed = await deleteWorkItem(getWorkItemsStorePath(), id);
    if (!removed) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeErrorResponse(error);
  }
}
