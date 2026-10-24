import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { writeProtocol } from "@/lib/ai";
import { getRepo } from "@/lib/data/repo";
import { CoverageReport, type Organization, type OrgId } from "@/lib/schemas";

import { requireRole } from "../../_lib/guard";

/**
 * AI adapted-protocol route for Quippe (Task 19.2; Req 12.1, 12.2, 12.3, 12.6;
 * Property 1, Property 9).
 *
 * `POST /api/supplies/protocol` accepts a `CoverageReport` and drafts a protocol
 * adapted to the matched items. All of the protocol's hard guarantees live in
 * the AI module (`writeProtocol`), so this handler stays thin:
 *
 *   - CP9 / id-scope (Req 12.2): the AI wrapper rejects any protocol whose item
 *     refs are not ⊆ the coverage report's item ids, returning the typed
 *     `protocol_rejected` fallback instead (Req 12.4).
 *   - Missing lines (Req 12.3): `writeProtocol` requires the protocol to list
 *     every BOM line marked `missing`, and falls back if one is omitted.
 *   - HS review text (Req 12.6): when `isHighSchool` is true the module sets the
 *     "Advisor must review before running" text on the protocol. The coverage
 *     report itself was already built with hs_safe filtering, so no unsafe item
 *     id is in scope (Req 12.5, Property 1).
 *
 * `isHighSchool` is derived from the requesting org's type (loaded from the
 * session), not trusted from the client.
 *
 * Authorization (Req 12): drafting a protocol is a Club_Officer action for their
 * own org, also open to the club's Club_Advisor (Task 26.1).
 *
 * Input validation: the submitted CoverageReport is validated with the
 * `CoverageReport` schema; an invalid report returns 400.
 *
 * JSON response shape (mirrors the AiResult so the caller branches on `ok`):
 *   success  → 200 { ok: true,  protocol: Protocol }
 *   fallback → 200 { ok: false, protocol: null, fallback: { kind: "protocol_rejected", reason } }
 * A 200 with `ok: false` means the protocol was rejected (out-of-scope id or
 * omitted missing line) and the typed fallback is returned in its place
 * (Req 12.4) — not a transport error.
 */

/**
 * Roles that may run the supplies flow for their OWN org (the org comes from
 * the session). A club officer plans supplies; a club advisor may run it for
 * their club too (Task 26.1, demo step 6: the high school club has no officer
 * account, so its advisor shows that hazardous items never appear in the
 * club's supply list). Members stay read-only and company roles are denied.
 */
const SUPPLIES_ROLES = ["club_officer", "club_advisor"] as const;

/**
 * Fixed advisor-review text for high school protocols (Req 12.6). Not
 * exported: Next.js route modules may only export HTTP handlers and config.
 */
const HS_REVIEW_TEXT = "Advisor must review before running";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Authorize: a club officer or advisor drafts a protocol for their org
  // (Req 12, 1.4).
  const auth = await requireRole(req, SUPPLIES_ROLES);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const orgId = session.orgId ?? null;
  if (orgId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with an organization." },
      { status: 403 },
    );
  }

  // Parse the JSON body.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  // Validate the submitted CoverageReport against the schema (Req 12.1).
  const parsed = CoverageReport.safeParse(
    (json as { coverage?: unknown })?.coverage ?? json,
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The coverage report is not valid.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const coverage = parsed.data;

  const repo = getRepo();

  // Determine isHighSchool from the requesting org's type (Req 12.6). Never
  // trusted from the client.
  const org: Organization | null = await repo.getOrganization(orgId as OrgId);
  if (org === null) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }
  const isHighSchool = org.type === "high_school_club";

  // Delegate to the AI module. It enforces item ids ⊆ coverage ids (CP9,
  // Req 12.2), requires every missing BOM line to be listed (Req 12.3), injects
  // the HS review text when isHighSchool (Req 12.6), and returns the typed
  // `protocol_rejected` fallback on any violation (Req 12.4).
  const result = await writeProtocol(coverage, isHighSchool);

  if (result.ok) {
    // Safety does not depend on the model (Req 12.6, F6; Task 26.1): for a
    // high school club the route itself sets the review flag and the fixed
    // review text, so a model that omits or rewords them cannot drop the
    // advisor-review requirement.
    const protocol = isHighSchool
      ? { ...result.value, hsReviewRequired: true, hsReviewText: HS_REVIEW_TEXT }
      : result.value;
    return NextResponse.json({ ok: true, protocol });
  }

  // Surface the typed fallback in place of a protocol (Req 12.4).
  return NextResponse.json({
    ok: false,
    protocol: null,
    fallback: result.fallback,
  });
}
