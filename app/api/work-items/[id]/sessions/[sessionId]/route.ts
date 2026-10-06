import { NextResponse } from "next/server";
import { isApiRequestAllowed } from "@/lib/request-security";
import { detachWorkItemSession, getWorkItemsStorePath, isSessionId, isWorkItemId } from "@/lib/work-items";
import { invalidRequest, storeErrorResponse, requestDeniedResponse } from "@/lib/work-items-api";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  if (!isApiRequestAllowed(req)) return requestDeniedResponse();
  const { id, sessionId } = await params;
  if (!isWorkItemId(id) || !isSessionId(sessionId)) return invalidRequest("Invalid ids");
  try {
    await detachWorkItemSession(getWorkItemsStorePath(), id, sessionId);
    return NextResponse.json({ ok: true });
  } catch (error) { return storeErrorResponse(error); }
}
