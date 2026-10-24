import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { AskId } from "@/lib/schemas";

import { moderatePendingAsk } from "../../../_lib/advisor";
import { requireRole } from "../../../_lib/guard";

/**
 * Advisor approve route for Quippe (Task 18.2; Req 9.3, 9.4).
 *
 * `POST /api/asks/[id]/approve` approves an Ask that is awaiting advisor
 * review. On success the ask moves from `pending_advisor_approval` to `open`
 * (Req 9.3), which makes it visible to companies.
 *
 * The route is THIN: it authorizes the role, then delegates the shared guard
 * order (exists → pending-only → the advisor's org owns the ask) to
 * `moderatePendingAsk`. An advisor whose org does not match the ask's org is
 * rejected with the ask left unchanged (Req 9.4), and a non-pending ask is
 * rejected unchanged — both decided before any write.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Authorize: only a club advisor approves an ask (Req 9.3, 1.4).
  const auth = await requireRole(req, "club_advisor");
  if (!auth.ok) return auth.response;

  const askId = params.id as AskId;

  // Approve ⇒ target status `open` (Req 9.3). Ownership + pending-only guards
  // live in the shared helper and run before any status change.
  const result = await moderatePendingAsk(auth.session, askId, "open");
  if (!result.ok) return result.response;

  return NextResponse.json({ ask: result.ask });
}
