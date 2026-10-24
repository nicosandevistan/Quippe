import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handoffSummary } from "@/lib/ai";
import { getRepo } from "@/lib/data/repo";
import type { Organization, OrgId, TimelineEvent } from "@/lib/schemas";

import { denyOwnership, requireRole } from "../../../_lib/guard";

/**
 * Handoff-summary generation route for Quippe (Task 16.1; Req 3.1–3.5).
 *
 * `POST /api/org/[id]/handoff` generates a year-end Handoff_Summary from THIS
 * organization's timeline ONLY (Req 3.1, 3.2): it loads
 * `listTimelineEvents(id)` for the org named in the path and passes exactly
 * those events to `handoffSummary`. No other org's events are ever read, so the
 * summary is derived solely from the org's own records.
 *
 * `handoffSummary` returns a discriminated `AiResult`:
 *   - `{ ok: true, value }`  → a schema-valid HandoffSummary whose referencedIds
 *     are all drawn from the input events (CP9 enforced in the AI wrapper);
 *   - `{ ok: false, fallback }` → the typed `handoff_fallback`, returned both
 *     when there are no timeline events (Req 3.5) and when the generated
 *     summary references an id outside the input events (Req 3.4).
 *
 * JSON response shape (mirrors the AiResult so the caller can branch on `ok`):
 *   success  → 200 { ok: true,  summary: HandoffSummary }
 *   fallback → 200 { ok: false, summary: null, fallback: { kind, ... } }
 * A 200 with `ok: false` means "generation declined, here is the typed
 * fallback" — not a transport error — so the page can render the fallback.
 *
 * Authorization (Req 3.1): generating a handoff is a Club_Officer action.
 * Members are read-only (Req 2.3) and advisors approve asks, so neither may
 * trigger generation. The officer may only generate for their OWN org.
 * A request for an org that does not exist returns 404 (Req 2.6).
 *
 * The route is kept THIN per structure.md: authorize, read this org's events,
 * delegate to the AI module, and surface its typed result as JSON.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Authorize: only a club officer generates a handoff summary (Req 3.1, 1.4).
  const auth = await requireRole(req, "club_officer");
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const orgId = params.id as OrgId;

  // Ownership: an officer generates a handoff for their OWN org only. Acting on
  // another org is denied and changes nothing (Req 1.5, 3.2).
  if (session.orgId !== orgId) {
    return denyOwnership(session, "organization");
  }

  const repo = getRepo();

  // 404 when the org does not exist (Req 2.6).
  const org: Organization | null = await repo.getOrganization(orgId);
  if (org === null) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  // THIS org's timeline only (Req 3.2): we never pass any other org's events.
  const events: TimelineEvent[] = await repo.listTimelineEvents(orgId);

  // Delegate to the AI module. It returns the typed fallback on an empty
  // timeline (Req 3.5) and on any out-of-scope id reference (Req 3.4, CP9),
  // and a schema-valid summary otherwise (Req 3.1, 3.3).
  const result = await handoffSummary(events);

  if (result.ok) {
    return NextResponse.json({ ok: true, summary: result.value });
  }

  // Surface the typed fallback in place of a summary (Req 3.4, 3.5).
  return NextResponse.json({
    ok: false,
    summary: null,
    fallback: result.fallback,
  });
}
