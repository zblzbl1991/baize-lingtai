import { NextResponse } from "next/server";

// Shared response shapes for the Work Items routes. Next.js validates route
// exports, so the helpers live here, not in route.ts. Every failure carries a
// structured `code` the UI translates beside the diagnostic `error` (the
// repo's route convention).

/** A store the server cannot read or write: fail closed, never claim success. */
export function storeErrorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error), code: "store-error" },
    { status: 500 },
  );
}

export function invalidRequest(error: string) {
  return NextResponse.json({ error, code: "invalid-request" }, { status: 400 });
}

export function notFoundResponse() {
  return NextResponse.json({ error: "No such Work Item", code: "not-found" }, { status: 404 });
}

export function requestDeniedResponse() {
  return NextResponse.json({ error: "Untrusted API request", code: "request-denied" }, { status: 403 });
}

export function contentTypeResponse() {
  return NextResponse.json({ error: "Content-Type must be application/json", code: "content-type" }, { status: 415 });
}
