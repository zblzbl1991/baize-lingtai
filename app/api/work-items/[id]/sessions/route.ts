import { NextResponse } from "next/server";
import { isApiRequestAllowed, hasJsonContentType } from "@/lib/request-security";
import { attachWorkItemSession, getWorkItemsStorePath, isSessionId, isWorkItemId } from "@/lib/work-items";
import { resolveWorkItemSession } from "@/lib/work-item-sessions";
import { clearPendingWorkItemAssociation, retryPendingWorkItemAssociation } from "@/lib/work-item-lifecycle";
import { invalidRequest, storeErrorResponse, requestDeniedResponse, contentTypeResponse } from "@/lib/work-items-api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isApiRequestAllowed(req)) return requestDeniedResponse();
  if (!hasJsonContentType(req)) return contentTypeResponse();
  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { return invalidRequest("Invalid JSON"); }
  if (!body || !isWorkItemId(id) || !isSessionId(body.sessionId) || !(body.expectedWorkItemId === null || isWorkItemId(body.expectedWorkItemId))) return invalidRequest("Invalid Association intent");
  try {
    if (body.recover === true) {
      await retryPendingWorkItemAssociation(getWorkItemsStorePath(), id, body.sessionId, { resolveSession: resolveWorkItemSession });
      return NextResponse.json({ ok: true });
    }
    const workItem = await attachWorkItemSession(getWorkItemsStorePath(), id, body.sessionId, body.expectedWorkItemId, { resolveSession: resolveWorkItemSession });
    clearPendingWorkItemAssociation(body.sessionId);
    return NextResponse.json({ workItem });
  } catch (error) { return storeErrorResponse(error); }
}
