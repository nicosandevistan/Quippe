import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { AskId } from "@/lib/schemas";

import { moderatePendingAsk } from "../../../_lib/advisor";
import { requireRole } from "../../../_lib/guard";

/**
 * Advisor reject route for Quippe (Task 18.2; Req 9.4, 9.5).
 *
 * `POST /api/asks/[id]/reject` rejects an Ask that is awaiting advisor review.
 * On success the ask moves from `pending_advisor_approval` to `rejected` (Req
 * 9.5), which keeps it hidden from every company-facing view (CP2).
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
  // Authorize: only a club advisor rejects an ask (Req 9.5, 1.4).
  const auth = await requireRole(req, "club_advisor");
  if (!auth.ok) return auth.response;

  const askId = params.id as AskId;

  // Reject ⇒ target status `rejected` (Req 9.5). Ownership + pending-only
  // guards live in the shared helper and run before any status change.
  const result = await moderatePendingAsk(auth.session, askId, "rejected");
  if (!result.ok) return result.response;

  return NextResponse.json({ ask: result.ask });
}
