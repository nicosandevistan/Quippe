import { applyHardFilters, type CityCoordsTable } from "@/lib/core/matching";
import type { Repo } from "@/lib/data/repo";
import type { Ask, Organization } from "@/lib/schemas";

/**
 * Decide whether a newly visible ask is `matched` or `open` (Task 26.1,
 * approved demo fix 1).
 *
 * Before this helper, confirm saved every visible ask as `open` and advisor
 * approval moved asks to `open`, while accept/decline only act on `matched`
 * asks. Nothing ever set `matched`, so a freshly composed ask could never be
 * accepted. This helper closes that gap at the route boundary.
 *
 * It performs NO matching logic of its own: it loads every offer, the
 * non-expired inventory across all companies, and the city coordinates the
 * core needs, then asks the pure core `applyHardFilters` which offers survive.
 * The ask is `matched` when at least one offer survives, otherwise `open`.
 * The run date (`now`) is injected by the caller; the core never reads a clock.
 *
 * Callers must only use this for asks that companies may see. An in-person
 * high school ask held at `pending_advisor_approval` keeps that status; the
 * safety gate runs first and this helper is never consulted for it.
 */
export async function statusAfterMatching(
  repo: Repo,
  ask: Ask,
  org: Organization,
  now: string,
): Promise<"matched" | "open"> {
  const offers = await repo.listOffers();
  // The repo drops expired items on every read (Req 14.4); the core filters
  // expiry again, so this stays correct either way.
  const inventory = await repo.listInventory(now);

  // Seed_City_Table lookup for the org city and every offer city. Cities with
  // no coordinates stay absent, so the core excludes those in-person pairs
  // (fail closed, Req 15.7).
  const coords: Record<string, { lat: number; lon: number } | undefined> = {};
  const cities = new Set<string>([org.city, ...offers.map((o) => o.city)]);
  for (const city of cities) {
    const c = await repo.getCityCoords(city);
    if (c !== null) coords[city] = c;
  }

  const survivors = applyHardFilters(
    offers,
    ask,
    org,
    inventory,
    coords as CityCoordsTable,
    now,
  );
  return survivors.length > 0 ? "matched" : "open";
}
