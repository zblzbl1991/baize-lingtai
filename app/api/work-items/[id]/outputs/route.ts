import { NextResponse } from "next/server";
import { isWorkItemId } from "@/lib/work-items";
import { readWorkItemOutputs } from "@/lib/work-item-outputs";
import { invalidRequest, storeErrorResponse } from "@/lib/work-items-api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isWorkItemId(id)) return invalidRequest("Invalid id");
  try { return NextResponse.json(await readWorkItemOutputs(id, req.signal)); }
  catch (error) { return storeErrorResponse(error); }
}
