import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { sortTimeline } from "@/lib/core/timeline";
import { getRepo } from "@/lib/data/repo";
import type { Organization, OrgId, Role, TimelineEvent } from "@/lib/schemas";

import { isCompanyCopyEvent } from "../../_lib/accept-decline";
import { requireRole } from "../../_lib/guard";

/**
 * Organization profile + timeline route for Quippe (Task 16.1; Req 2.1–2.6).
 *
 * `GET /api/org/[id]` returns the organization's profile together with its
 * timeline ordered reverse-chronologically by the pure core
 * (`sortTimeline(listTimelineEvents(id))`, Req 2.1/2.2/2.4). When the org has
 * no events it returns an empty array plus an explicit `emptyTimeline` flag so
 * callers can show the empty-timeline indicator (Req 2.5). A request for an
 * org that does not exist returns 404 (Req 2.6).
 *
 * READ-ONLY view (Req 2.3): this handler only reads — it exposes no create/
 * edit/delete, so a club_member (as well as a club_officer or the org's
 * advisor) may GET the org without being able to mutate anything. Access is
 * scoped to the caller's OWN org via the session binding; a signed-in user of
 * an org role cannot read another org's page.
 *
 * The route is kept THIN per structure.md: authorize, read from the repo, sort
 * with the pure core, and return JSON. It writes nothing.
 */

/** Org-facing roles that may view an organization page (Req 2.1–2.3). */
const ORG_VIEW_ROLES: readonly Role[] = [
  "club_officer",
  "club_member",
  "club_advisor",
];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Authorize: an org page is viewed by the org's officer, member (read-only),
  // or advisor (Req 2.1–2.3, 1.4). The guard also rejects an unsigned request.
  const auth = await requireRole(req, ORG_VIEW_ROLES);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const orgId = params.id as OrgId;

  // Scope to the caller's OWN org: an org-role account only views its own
  // organization page, never another org's (Req 1.4, 2.3). This also means a
  // member cannot reach into another org even read-only.
  if (session.orgId !== orgId) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to view this organization. It belongs to a different organization than your account.",
      },
      { status: 403 },
    );
  }

  const repo = getRepo();

  // 404 when the org does not exist (Req 2.6): no page, just a not-found
  // indication.
  const org: Organization | null = await repo.getOrganization(orgId);
  if (org === null) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  // Timeline, ordered by the pure core: date desc, then seq asc (Req 2.2, 2.4).
  //
  // Accept/decline write two copies of each outcome (Req 6.4, 6.5): one in the
  // org's voice and one in the company's voice. Both carry the orgId, so the
  // company copy (id prefix `ev-co-`) is dropped here; otherwise the org page
  // would show every accept/decline twice (Task 26.1).
  const events: TimelineEvent[] = (await repo.listTimelineEvents(orgId)).filter(
    (e) => !isCompanyCopyEvent(e),
  );
  const timeline = sortTimeline(events);

  // Empty-timeline indicator (Req 2.5): the array is returned regardless, and
  // `emptyTimeline` lets the caller render the "no events" state explicitly.
  return NextResponse.json({
    organization: org,
    timeline,
    emptyTimeline: timeline.length === 0,
  });
}
