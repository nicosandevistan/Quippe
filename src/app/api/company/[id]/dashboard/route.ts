import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { applyHardFilters, rankMatches } from "@/lib/core/matching";
import type { CityCoordsTable, RankCandidate } from "@/lib/core/matching";
import { visibleToCompany } from "@/lib/core/safety";
import { getRepo } from "@/lib/data/repo";
import type {
  Ask,
  CompanyId,
  Match,
  Offer,
  Organization,
  TimelineEvent,
} from "@/lib/schemas";

import { denyOwnership, requireRole } from "../../../_lib/guard";

/**
 * Liaison dashboard route for Quippe (Task 17.2; Req 5.1–5.6, Property 2).
 *
 * `GET /api/company/[id]/dashboard` returns every Ask the deterministic
 * Matching_Engine has matched to one or more of this company's offers, sorted
 * by match score descending with a stable secondary tie-break, each carrying
 * the plain-language reasons the engine produced (and an explicit "no reasons"
 * indicator when none). Asks held for advisor approval or rejected are hidden
 * from the company (Property 2).
 *
 * The route is kept THIN per structure.md: it authorizes, reads from the repo,
 * injects the run date, and delegates every eligibility/scoring decision to the
 * pure core (`applyHardFilters` then `rankMatches`). It reads the clock only at
 * this boundary; the core receives the date as an argument and stays pure.
 */

/** A single dashboard entry: one matched ask with its best match to us. */
interface DashboardMatch {
  askId: string;
  orgId: string;
  offerId: string;
  score: number;
  /** One plain-language reason per contributing factor (Req 16.4, 5.3). */
  reasons: string[];
  /** True when the engine produced no reasons for this match (Req 5.4). */
  noReasons: boolean;
  /** Every one of this company's offers the ask matched (score-desc order). */
  matchedOfferIds: string[];
}

/**
 * Count an organization's PAST MATCHES from its timeline — the fairness input
 * `rankMatches` uses to favor never-matched orgs (Req 16.3). A past match is a
 * `match` or `accepted` timeline event on the org's timeline.
 */
function countPastMatches(events: readonly TimelineEvent[]): number {
  return events.filter((e) => e.kind === "match" || e.kind === "accepted")
    .length;
}

/**
 * Build the Seed_City_Table lookup the core needs, covering every city that
 * appears on this company's offers or on a candidate org (Req 15.6). Cities
 * without seeded coordinates are simply absent, which makes the core exclude
 * the corresponding in-person pairs (fail closed, Req 15.7).
 */
async function buildCoordsTable(
  repo: ReturnType<typeof getRepo>,
  cities: Iterable<string>,
): Promise<CityCoordsTable> {
  const table: Record<string, { lat: number; lon: number } | undefined> = {};
  const distinct = new Set(cities);
  await Promise.all(
    [...distinct].map(async (city) => {
      const coords = await repo.getCityCoords(city);
      if (coords !== null) table[city] = coords;
    }),
  );
  return table;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Authorize: only a company liaison sees a liaison dashboard (Req 5.1, 1.4).
  const auth = await requireRole(req, "company_liaison");
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const companyId = params.id as CompanyId;

  // Ownership: the dashboard is the liaison's OWN company. Acting on another
  // company's dashboard is denied and changes nothing (Req 5.1, 1.5, 4.4).
  if (session.companyId !== companyId) {
    return denyOwnership(session, "dashboard");
  }

  const repo = getRepo();
  const company = await repo.getCompany(companyId);
  if (company === null) {
    return NextResponse.json(
      { error: "Company not found." },
      { status: 404 },
    );
  }

  // Run date injected at the boundary; the core receives it as an argument.
  const now = new Date().toISOString().slice(0, 10);

  // This company's offers, and the non-expired inventory backing supply offers
  // (the repo already drops expired items on every read — Req 14.4).
  const offers: Offer[] = await repo.listOffers({ companyId });
  const inventory = await repo.listInventory(now, { companyId });

  // Candidate asks: every ask EXCEPT those hidden from companies (Property 2):
  // `pending_advisor_approval` and `rejected` are excluded via the single
  // deterministic predicate `visibleToCompany` (Req 5.6, 9.2).
  const allAsks: Ask[] = await repo.listAsks();
  const visibleAsks = allAsks.filter((ask) => visibleToCompany(ask));

  // Resolve each visible ask's organization once; drop asks whose org is
  // missing from the store (nothing to score against).
  const askOrgs = new Map<string, { ask: Ask; org: Organization }>();
  await Promise.all(
    visibleAsks.map(async (ask) => {
      const org = await repo.getOrganization(ask.orgId);
      if (org !== null) askOrgs.set(ask.id, { ask, org });
    }),
  );

  // Build the coords table from every city the pipeline may need: our offers'
  // cities plus each candidate org's city (Req 15.6).
  const cities: string[] = [
    ...offers.map((o) => o.city),
    ...[...askOrgs.values()].map((e) => e.org.city),
  ];
  const coords = await buildCoordsTable(repo, cities);

  // Past-match count per candidate org (fairness input, Req 16.3). Resolved
  // once per org so the same org's timeline is not scanned repeatedly.
  const distinctOrgIds = new Set(
    [...askOrgs.values()].map((e) => e.org.id),
  );
  const pastMatchByOrg = new Map<string, number>();
  await Promise.all(
    [...distinctOrgIds].map(async (orgId) => {
      const events = await repo.listTimelineEvents(orgId as Organization["id"]);
      pastMatchByOrg.set(orgId, countPastMatches(events));
    }),
  );

  // Run the deterministic pipeline per ask: hard filters, then soft-score
  // ranking against this company's surviving offers.
  const dashboard: DashboardMatch[] = [];
  for (const { ask, org } of askOrgs.values()) {
    const survivors = applyHardFilters(
      offers,
      ask,
      org,
      inventory,
      coords,
      now,
    );
    if (survivors.length === 0) continue;

    const pastMatchCount = pastMatchByOrg.get(org.id) ?? 0;
    const candidates: RankCandidate[] = survivors.map((offer) => ({
      offer,
      org,
      pastMatchCount,
    }));

    const { matches } = rankMatches(candidates, ask, now, { coords });
    if (matches.length === 0) continue;

    // `rankMatches` already sorts by score desc with a deterministic tie-break,
    // so the first match is this ask's best match to us.
    const best: Match = matches[0];
    dashboard.push({
      askId: ask.id,
      orgId: org.id,
      offerId: best.offerId,
      score: best.score,
      reasons: best.reasons,
      noReasons: best.reasons.length === 0,
      matchedOfferIds: matches.map((m) => m.offerId),
    });
  }

  // Global ordering across asks: score descending, then a stable secondary key
  // (askId) so repeated loads of the same data produce identical ordering
  // (Req 5.2).
  dashboard.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.askId < b.askId ? -1 : a.askId > b.askId ? 1 : 0;
  });

  // Empty-state indication when nothing matched (Req 5.5).
  return NextResponse.json({
    companyId,
    matches: dashboard,
    empty: dashboard.length === 0,
  });
}
