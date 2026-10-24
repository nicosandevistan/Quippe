import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";
import type { Ask, OrgId } from "@/lib/schemas";

import { requireRole } from "../../_lib/guard";

/**
 * Advisor approval queue route for Quippe (Task 18.2; Req 9.6, 9.5, 9.3).
 *
 * `GET /api/advisor/queue` returns the Asks a Club_Advisor still has to review:
 * exactly those with status `pending_advisor_approval` that belong to the
 * advisor's OWN organization, and no Asks belonging to any other organization
 * (Req 9.6). The advisor's org is taken from the session binding (never from
 * the client), so one advisor can never see another org's pending asks (Req
 * 9.5).
 *
 * The route is kept THIN per structure.md: it authorizes, then reads the
 * already-scoped slice from the repo (`listAsks({ orgId, status })`) and
 * returns it. It performs no status transition and writes nothing.
 */

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Authorize: only a club advisor opens an approval queue (Req 9.6, 1.4).
  const auth = await requireRole(req, "club_advisor");
  if (!auth.ok) return auth.response;
  const { session } = auth;

  // The advisor's own org binding scopes the whole queue (Req 9.5, 9.6). A
  // misconfigured advisor with no org has an empty queue rather than seeing
  // every org's asks.
  const orgId: OrgId | undefined = session.orgId;
  if (orgId === undefined) {
    return NextResponse.json({ asks: [], empty: true });
  }

  const repo = getRepo();

  // Scope to this org AND to pending-approval status in one repo read, so the
  // queue can only ever contain this advisor's pending asks (Req 9.6).
  const asks: Ask[] = await repo.listAsks({
    orgId,
    status: "pending_advisor_approval",
  });

  return NextResponse.json({ asks, empty: asks.length === 0 });
}
