import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCoverage } from "@/lib/core/coverage";
import { getRepo } from "@/lib/data/repo";
import { BOM, type Organization, type OrgId } from "@/lib/schemas";

import { requireRole } from "../../_lib/guard";

/**
 * Deterministic coverage report route for Quippe (Task 19.2; Req 11.1, 11.2,
 * 12.5; Property 1, Property 8).
 *
 * `POST /api/supplies/coverage` accepts a BOM and compares it against the
 * non-expired inventory across ALL companies, producing a `CoverageReport` that
 * marks each line covered/partial/missing and names the supplying company for
 * covered/partial lines (Req 11.2).
 *
 * Cross-company, non-expired inventory (Req 11.1): the handler calls
 * `listInventory(now)` with NO company filter, so it reads inventory from every
 * company. The repo applies the expired-item filter on every read, comparing
 * each item's expiry to the injected `now`, so no expired item reaches the
 * coverage comparison (Req 11.7, CP5). `now` is read from the clock ONLY here at
 * the boundary — the pure core (`buildCoverage`) receives it as an argument and
 * stays pure.
 *
 * High-school safety (Req 12.5; Property 1): the requesting org is loaded from
 * the session and passed to `buildCoverage`. When the org's type is
 * `high_school_club`, the core additionally excludes every item with
 * `hsSafe === false`, so no unsafe item id can appear in any coverage line's
 * `itemRefs`. Non-HS orgs keep otherwise-eligible items.
 *
 * Authorization (Req 10/12): the supplies flow is a Club_Officer action; the
 * officer runs coverage for their OWN org (the session's org drives hs_safe
 * filtering).
 *
 * Input validation: the submitted BOM is validated with the `BOM` schema; an
 * invalid BOM returns 400 with the field errors.
 *
 * JSON response shape:
 *   success → 200 { ok: true, coverage: CoverageReport,
 *                   companyNames: Record<CompanyId, string> }
 * `companyNames` maps each `supplyingCompanyId` that appears in the report to
 * the company's display name (ids that do not resolve are omitted). It is for
 * display only; the report is the source of truth.
 *
 * The route is kept THIN per structure.md: authorize, validate the BOM, read the
 * clock + cross-company inventory + requesting org, delegate to the pure core.
 */

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Authorize: only a club officer runs coverage for their org (Req 10/12, 1.4).
  const auth = await requireRole(req, "club_officer");
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

  // Validate the submitted BOM against the schema (Req 11.1 operates on a BOM).
  const parsed = BOM.safeParse((json as { bom?: unknown })?.bom ?? json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The bill of materials is not valid.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const bom = parsed.data;

  const repo = getRepo();

  // Load the requesting org so high_school_club hs_safe filtering applies
  // (Req 12.5, Property 1).
  const org: Organization | null = await repo.getOrganization(orgId as OrgId);
  if (org === null) {
    return NextResponse.json(
      { error: "Organization not found." },
      { status: 404 },
    );
  }

  // Inject the run date ONLY at the boundary (Req 11.7, CP5).
  const now = new Date().toISOString().slice(0, 10);

  // Read NON-EXPIRED inventory across ALL companies — no company filter
  // (Req 11.1). The repo applies the expiry filter on every read.
  const inventory = await repo.listInventory(now);

  // Delegate to the pure core: it filters expired + hs-unsafe items, matches by
  // category, converts units, allocates, and classifies each line (Req 11.1–11.4,
  // 11.6, 11.7, 12.5; CP1, CP5, CP8).
  const coverage = buildCoverage(bom, inventory, org, now);

  // Display names for the supplying companies named in the report, so the page
  // can show a company name instead of a raw id. Additive only: ids that do not
  // resolve are skipped, and the report itself is unchanged.
  const companyNames: Record<string, string> = {};
  const supplierIds = new Set(
    coverage.lines
      .map((l) => l.supplyingCompanyId)
      .filter((id): id is NonNullable<typeof id> => id !== undefined),
  );
  for (const id of supplierIds) {
    const company = await repo.getCompany(id);
    if (company !== null) companyNames[id] = company.name;
  }

  return NextResponse.json({ ok: true, coverage, companyNames });
}
