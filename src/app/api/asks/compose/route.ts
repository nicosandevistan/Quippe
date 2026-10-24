import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { composeAsks } from "@/lib/ai";

import { requireRole } from "../../_lib/guard";

/**
 * Ask composer route for Quippe (Task 19.1; Req 8.2, 8.3, 8.7, 8.8).
 *
 * `POST /api/asks/compose` turns an officer's free text into structured ask
 * DRAFTS for review. It is the "AI suggests" half of the composer flow: nothing
 * is submitted or persisted here — the officer later confirms each draft
 * through `POST /api/asks/confirm` (Req 8.7, 8.8). The handler is thin and
 * ordered so a rejected request never calls the model:
 *
 *   authorize (club officer) → parse body → validate text length 1..5000
 *   → composeAsks (bounded at 30s by the AI wrapper) → return drafts OR the
 *   manual-form fallback.
 *
 * On a length violation the entered text is RETAINED in the error response so
 * the UI can keep what the officer typed (Req 8.2). On the AI fallback the
 * manual-form payload (with any extracted fields) is returned so the UI can
 * render a pre-filled manual form (Req 8.6).
 */

/** Only a club officer composes asks for their organization (Req 8). */
const ALLOWED_ROLE = "club_officer" as const;

/** Free-text length bounds (Req 8.1, 8.2). */
const MIN_TEXT = 1;
const MAX_TEXT = 5000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Authorize by role first — a denied request never reaches the model.
  const auth = await requireRole(req, ALLOWED_ROLE);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const orgId = session.orgId ?? null;
  if (orgId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with an organization." },
      { status: 403 },
    );
  }

  // 2) Parse the JSON body.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  // The composer input is just free text. Read it defensively so a non-string
  // body is treated as empty (and rejected) rather than throwing.
  const text =
    typeof json === "object" &&
    json !== null &&
    typeof (json as { text?: unknown }).text === "string"
      ? (json as { text: string }).text
      : "";

  // 3) Validate length 1..5000. On violation, RETAIN the submitted text so the
  //    UI can keep what the officer typed, and state the allowed range
  //    (Req 8.2, 8.7). Nothing is submitted.
  if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
    return NextResponse.json(
      {
        ok: false,
        error: `Enter between ${MIN_TEXT} and ${MAX_TEXT} characters.`,
        text,
      },
      { status: 400 },
    );
  }

  // 4) Compose. The AI wrapper validates each ask against the schema, retries
  //    once on failure, and is bounded at 30s — returning the manual-form
  //    fallback when it cannot produce valid asks (Req 8.3, 8.4, 8.5, 8.6).
  const result = await composeAsks({ text, orgId });

  // 5) Return DRAFTS for review — nothing is submitted or persisted here
  //    (Req 8.3, 8.8). On the fallback, return the manual-form payload so the
  //    UI can render the pre-filled manual form (Req 8.6).
  if (result.ok) {
    return NextResponse.json({ ok: true, drafts: result.value });
  }
  return NextResponse.json({ ok: false, fallback: result.fallback });
}
