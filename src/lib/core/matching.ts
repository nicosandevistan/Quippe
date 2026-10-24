import type { InventoryItem, Match, Offer, Organization } from "@/lib/schemas";
import type { Ask } from "@/lib/schemas";

/**
 * Deterministic matching HARD FILTERS and SOFT SCORE for Quippe
 * (Tasks 7.1 & 7.2; Req 15, 16).
 *
 * This module lives in the PURE core per structure.md: no I/O, no randomness,
 * no `Date.now()`. The current date is injected as the `now` argument (Req
 * 15.1) and it imports only types from `src/lib/schemas`. Every eligibility
 * decision here is a deterministic rule — identical inputs always yield an
 * identical result.
 *
 * `applyHardFilters` carries two correctness properties:
 *   - Property 1: `hsSafe === false` items never reach a `high_school_club`
 *     (Req 15.9) — the hazardous-supply gate reuses the same safety data the
 *     rest of the system trusts.
 *   - Property 5: expired inventory (expiry ≤ `now`) never participates in a
 *     match (Req 15.8).
 *
 * The companion SOFT-SCORE ranking (`rankMatches`, `topicFit`) is Task 7.2 and
 * lives at the bottom of this module; `ergFit` lives in the sibling
 * `src/lib/core/erg.ts` (Req 7.5) and reuses `keywordOverlap` from here.
 * `rankMatches` carries Property 6: identical inputs always yield an identical
 * ranked match set in identical order (Req 16.6).
 *
 * Requirements: 7.5, 15.1–15.10, 16.1–16.6.
 */

// --- City coordinates --------------------------------------------------------

/**
 * A single Seed_City_Table coordinate (Req 15.6). Longitude is named `lon` to
 * match the repo's `getCityCoords` return shape in the design.
 */
export interface CityCoords {
  lat: number;
  lon: number;
}

/**
 * The Seed_City_Table: a lookup from city name to its coordinates (Req 15.6).
 *
 * A city with no entry (or an `undefined` value) is treated as "coordinates
 * unavailable", which excludes any in-person pair touching that city (Req
 * 15.7). Modeled as a readonly record so the pure core cannot mutate the seed
 * table it is handed.
 */
export type CityCoordsTable = Readonly<Record<string, CityCoords | undefined>>;

/**
 * The default in-person distance limit, in kilometres.
 *
 * The brief scopes the MVP to Massachusetts (Seed_City_Table is ~15 MA cities),
 * so 80 km (~50 mi) comfortably spans the Boston–Worcester corridor while still
 * excluding genuinely far pairs. Requirement 15.6 leaves the exact limit as a
 * configured value, so callers may override it via `applyHardFilters`'s
 * `maxDistanceKm` parameter.
 */
export const DEFAULT_MAX_DISTANCE_KM = 80;

// Mean Earth radius in kilometres, used by the haversine distance.
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle (straight-line) distance between two coordinates, in kilometres,
 * via the haversine formula. Pure and deterministic.
 *
 * @param a one coordinate
 * @param b the other coordinate
 * @returns the straight-line distance in kilometres (≥ 0)
 */
export function haversineKm(a: CityCoords, b: CityCoords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// --- Small pure helpers ------------------------------------------------------

/**
 * Whether two date-string sets share at least one common date (Req 15.4).
 *
 * Dates are compared by exact string equality — the schema stores ISO date
 * strings (e.g. "2025-02-14"), so lexical equality is the right notion of "the
 * same day". Returns `false` when either side is empty.
 */
export function datesOverlap(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const seen = new Set(a);
  return b.some((date) => seen.has(date));
}

/**
 * Whether an inventory item is still usable on `now` (Req 15.8, Property 5).
 *
 * An item is expired when its expiry is earlier than OR equal to the run date,
 * so an item expiring exactly on `now` is treated as expired. Comparison is
 * lexical on ISO date strings, matching `buildCoverage`'s expiry filter.
 */
export function isInventoryUsable(
  item: Pick<InventoryItem, "expiry">,
  now: string,
): boolean {
  return item.expiry > now;
}

/**
 * Whether a single inventory item may back a supply match for this ask/org
 * (Req 15.8, 15.9, 15.10; Properties 1 & 5).
 *
 * An item is usable only when BOTH hold:
 *   - it is not expired (`expiry > now`), AND
 *   - if the organization is a `high_school_club`, the item is `hsSafe`.
 *
 * For any non-high-school org the `hsSafe` gate does not apply, so an
 * otherwise-eligible item is retained regardless of its `hsSafe` flag.
 */
export function isItemEligibleForOrg(
  item: Pick<InventoryItem, "expiry" | "hsSafe">,
  org: Pick<Organization, "type">,
  now: string,
): boolean {
  if (!isInventoryUsable(item, now)) {
    return false;
  }
  if (org.type === "high_school_club" && item.hsSafe === false) {
    return false;
  }
  return true;
}

// --- Hard filters ------------------------------------------------------------

/**
 * Apply every matching HARD FILTER and return the offers that survive for the
 * given ask/organization (Req 15.2–15.10).
 *
 * The function is pure and deterministic: it receives the run date (`now`) as
 * an argument, performs no I/O and no randomness (Req 15.1), and never mutates
 * its inputs. An offer is EXCLUDED when ANY of the following holds:
 *
 *   - 15.2 TYPE MISMATCH: `offer.type !== ask.type`.
 *   - 15.3 CAPACITY TOO SMALL: the offer's remaining capacity is less than the
 *     ask's `groupSize`. "Remaining capacity" is `offer.capacity` minus the
 *     caller-supplied already-accepted total for that offer/period
 *     (`acceptedByOffer`, default 0), so an offer already partly booked is
 *     filtered correctly.
 *   - 15.4 NO DATE OVERLAP: `offer.availableDates` and `ask.preferredDates`
 *     share no common date.
 *   - 15.5 UNDER MIN AGE: the offer specifies a `minAge` and the org's
 *     `ageYears` is strictly less than it. Absent `minAge` ⇒ the check is
 *     skipped.
 *   - 15.6 OVER DISTANCE (in-person only): the straight-line (haversine)
 *     distance between the offer city and the ask/org city, looked up in the
 *     Seed_City_Table, exceeds `maxDistanceKm`.
 *   - 15.7 MISSING COORDS (in-person only): either the offer city or the
 *     ask/org city has no Seed_City_Table coordinates — a missing coordinate
 *     EXCLUDES the pair (fail closed).
 *   - 15.8 / 15.9 SUPPLY SAFETY (supplies offers only): a `supplies` offer must
 *     have at least one inventory item that is both non-expired (Property 5)
 *     and, for a `high_school_club`, `hsSafe` (Property 1). An offer whose
 *     every item is expired or hs-unsafe serves nothing and is excluded. The
 *     ineligible items are removed from consideration either way (Req 15.10).
 *
 * Distance uses only the virtual/in-person distinction from the offer's
 * `deliveryMode`: `virtual` offers skip the distance and coordinate checks
 * entirely (15.6/15.7 are guarded by `WHERE an Offer is in_person`).
 *
 * The ask/org city is taken from `org.city` (the organization that owns the
 * ask). Inventory is filtered to the offer's own company before the supply
 * safety check so an offer is only judged on supplies its company actually
 * holds.
 *
 * @param offers           candidate offers to filter
 * @param ask              the ask being matched
 * @param org              the organization that owns the ask (city, age, type)
 * @param inventory        inventory items available to back `supplies` offers
 * @param coords           Seed_City_Table city → coordinates lookup (Req 15.6)
 * @param now              injected run date (ISO date string); never read from a clock
 * @param options          optional tuning:
 *        - `maxDistanceKm`  in-person distance limit (default {@link DEFAULT_MAX_DISTANCE_KM})
 *        - `acceptedByOffer` already-accepted group total per offer id, for the
 *          remaining-capacity computation (default: none accepted)
 * @returns the subset of `offers` that passes every hard filter, in input order
 */
export function applyHardFilters(
  offers: readonly Offer[],
  ask: Ask,
  org: Organization,
  inventory: readonly InventoryItem[],
  coords: CityCoordsTable,
  now: string,
  options?: {
    maxDistanceKm?: number;
    acceptedByOffer?: Readonly<Record<string, number>>;
  },
): Offer[] {
  const maxDistanceKm = options?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;
  const acceptedByOffer = options?.acceptedByOffer ?? {};

  const askCoords = coords[org.city];

  return offers.filter((offer) => {
    // 15.2 Type must match exactly.
    if (offer.type !== ask.type) {
      return false;
    }

    // 15.3 Remaining capacity must be able to seat the whole group.
    const alreadyAccepted = acceptedByOffer[offer.id] ?? 0;
    const remainingCapacity = offer.capacity - alreadyAccepted;
    if (remainingCapacity < ask.groupSize) {
      return false;
    }

    // 15.4 Preferred and available dates must share at least one day.
    if (!datesOverlap(offer.availableDates, ask.preferredDates)) {
      return false;
    }

    // 15.5 Org must meet the offer's minimum age when one is specified.
    if (offer.minAge !== undefined && org.ageYears < offer.minAge) {
      return false;
    }

    // 15.6 / 15.7 In-person offers need both cities geocoded and within range.
    if (offer.deliveryMode === "in_person") {
      const offerCoords = coords[offer.city];
      // Missing coordinates on either side excludes the pair (fail closed).
      if (offerCoords === undefined || askCoords === undefined) {
        return false;
      }
      if (haversineKm(offerCoords, askCoords) > maxDistanceKm) {
        return false;
      }
    }

    // 15.8 / 15.9 / 15.10 A supplies offer must back at least one eligible item:
    // non-expired, and hs-safe for a high school club. Items its own company
    // does not hold are not considered.
    if (offer.type === "supplies") {
      const companyInventory = inventory.filter(
        (item) => item.companyId === offer.companyId,
      );
      const hasEligibleItem = companyInventory.some((item) =>
        isItemEligibleForOrg(item, org, now),
      );
      if (!hasEligibleItem) {
        return false;
      }
    }

    return true;
  });
}

// --- Soft score: keyword overlap, topic fit, ranking (Req 16) ----------------

/**
 * Tokenize free text into a normalized set of keyword tokens.
 *
 * Lower-cases, splits on any run of non-alphanumeric characters, and drops
 * empty tokens and very short tokens (length < 2, e.g. stray "a"/"i") so the
 * overlap reflects meaningful words rather than punctuation. Returns a `Set`
 * so overlap is computed over distinct keywords. Pure and deterministic.
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  return new Set(tokens);
}

/**
 * Keyword-overlap score in [0, 1] between two free-text strings (Req 16.2).
 *
 * Uses the OVERLAP COEFFICIENT — |A ∩ B| ÷ min(|A|, |B|) — over the two
 * normalized token sets. The overlap coefficient (rather than Jaccard) keeps a
 * short text from being unfairly penalized when compared against a much longer
 * one: a focused ask whose every keyword appears in a long offer description
 * scores 1.0. When either text has no usable tokens the overlap is 0.
 *
 * The result is clamped to [0, 1] and is fully deterministic: identical inputs
 * yield an identical score, independent of token order.
 *
 * @param a one free-text string
 * @param b the other free-text string
 * @returns a score in the range 0.0 to 1.0 inclusive
 */
export function keywordOverlap(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = smaller === setA ? setB : setA;
  if (smaller.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      intersection += 1;
    }
  }
  return intersection / smaller.size;
}

/**
 * Topic fit in [0, 1] from keyword overlap between an ask and an offer
 * (Req 16.2). A thin, named wrapper over {@link keywordOverlap} so the matching
 * API expresses intent. Pure and deterministic.
 *
 * @param askText   the ask text (topic / request wording)
 * @param offerText the offer text (notes / description)
 * @returns a topic-fit score in the range 0.0 to 1.0 inclusive
 */
export function topicFit(askText: string, offerText: string): number {
  return keywordOverlap(askText, offerText);
}

/**
 * The four soft-score weights (Req 16.1). They sum to 1.0 so the combined score
 * is already in [0, 1] without further normalization. Topic fit dominates
 * because it is the most direct signal of a good match; distance, the
 * under-resourced boost, and fairness are meaningful but secondary.
 */
export interface SoftScoreWeights {
  topic: number;
  distance: number;
  underResourced: number;
  fairness: number;
}

/**
 * Default soft-score weights (Req 16.1). Chosen to sum to 1.0:
 *   topic 0.5, distance 0.2, under_resourced 0.2, fairness 0.1.
 */
export const DEFAULT_SOFT_SCORE_WEIGHTS: SoftScoreWeights = {
  topic: 0.5,
  distance: 0.2,
  underResourced: 0.2,
  fairness: 0.1,
};

/**
 * A single ranking candidate: an offer that already survived
 * {@link applyHardFilters}, paired with the organization it is for and that
 * org's past-match count (the fairness / tie-break input, Req 16.3).
 *
 * `pastMatchCount` is the number of prior matches the organization already has
 * — the caller supplies it from a past-match lookup (e.g. counting the org's
 * `match`/`accepted` timeline events). A count of 0 means a never-matched org,
 * which the fairness factor and the tie-break both favor.
 */
export interface RankCandidate {
  offer: Offer;
  org: Organization;
  pastMatchCount: number;
}

/**
 * Optional tuning for {@link rankMatches}.
 *   - `coords`         Seed_City_Table used to score distance for in-person
 *                      offers; omit to skip distance geolocation (virtual-only).
 *   - `maxDistanceKm`  the distance that scores 0; closer scores higher
 *                      (default {@link DEFAULT_MAX_DISTANCE_KM}).
 *   - `weights`        soft-score weights (default {@link DEFAULT_SOFT_SCORE_WEIGHTS}).
 */
export interface RankOptions {
  coords?: CityCoordsTable;
  maxDistanceKm?: number;
  weights?: Partial<SoftScoreWeights>;
}

// A candidate that failed input validation, with the reason it was dropped.
interface ExcludedCandidate {
  offerId: string;
  reason: string;
}

// An internal, fully-scored ranking row kept until the final sort.
interface ScoredRow {
  match: Match;
  score: number;
  pastMatchCount: number;
  offerId: string;
}

/**
 * The distance sub-score in [0, 1] for an in-person offer, or `null` when it
 * cannot be computed (missing coordinates on either side). Closer is higher:
 * distance 0 ⇒ 1.0, distance ≥ `maxDistanceKm` ⇒ 0.0, linear in between.
 *
 * Virtual offers have no geographic distance; the caller treats them as a
 * perfect 1.0 distance score (there is nothing to travel), handled in
 * `rankMatches` rather than here.
 */
function distanceScore(
  offerCity: string,
  orgCity: string,
  coords: CityCoordsTable,
  maxDistanceKm: number,
): number | null {
  const offerCoords = coords[offerCity];
  const orgCoords = coords[orgCity];
  if (offerCoords === undefined || orgCoords === undefined) {
    return null;
  }
  const km = haversineKm(offerCoords, orgCoords);
  if (km >= maxDistanceKm) {
    return 0;
  }
  return 1 - km / maxDistanceKm;
}

/**
 * Rank the surviving candidates for an ask into scored {@link Match}es
 * (Req 16.1–16.6; Property 6).
 *
 * Each candidate is expected to have already passed {@link applyHardFilters}.
 * For every candidate `rankMatches` computes a weighted SOFT SCORE in [0, 1]
 * from four factors and emits ONE plain-language reason per contributing factor
 * (Req 16.4):
 *
 *   - TOPIC FIT — keyword overlap between the ask text and the offer notes
 *     (`topicFit`), weighted by `weights.topic`.
 *   - DISTANCE — for an in-person offer, closer scores higher (1 at 0 km, 0 at
 *     `maxDistanceKm`), using `haversineKm` over the Seed_City_Table; a virtual
 *     offer has no travel and scores a perfect 1.0. Weighted by
 *     `weights.distance`.
 *   - UNDER_RESOURCED — a boost of 1.0 when `org.underResourced`, else 0,
 *     weighted by `weights.underResourced` (Req 16.1).
 *   - FAIRNESS — 1.0 for an org with zero past matches, else 0, weighted by
 *     `weights.fairness`. This also drives the tie-break below (Req 16.3).
 *
 * Because the weights sum to 1.0 and every factor is in [0, 1], the combined
 * score is always in [0, 1] (Req 16.1).
 *
 * EXCLUSION (Req 16.5): a candidate is dropped from the ranked output — without
 * failing the whole request — when a required scoring input is missing or
 * cannot be computed: a non-finite `pastMatchCount`, or an in-person offer
 * whose distance cannot be computed because the offer city or the org city has
 * no Seed_City_Table coordinates. Each excluded candidate is recorded in the
 * returned `excluded` list with a reason naming the unavailable input.
 *
 * ORDERING & DETERMINISM (Req 16.6; Property 6): results are sorted by score
 * descending; ties are broken FIRST by fairness — an org with zero past matches
 * ranks above an org with one or more (Req 16.3) — and then by a TOTAL ORDER on
 * offer id so the output never depends on input order or on the engine's sort
 * stability. Identical inputs therefore always produce an identical match set
 * in an identical order.
 *
 * @param candidates the hard-filter survivors to rank (offer + org + past count)
 * @param ask        the ask being matched (supplies the topic text)
 * @param now        the injected run date (ISO string); accepted for a pure,
 *                   date-injected signature even though the soft score does not
 *                   read it today
 * @param options    optional coords table, distance limit, and weights
 * @returns `{ matches, excluded }` — ranked matches plus any dropped candidates
 *          with the reason each was excluded
 */
export function rankMatches(
  candidates: readonly RankCandidate[],
  ask: Ask,
  now: string,
  options?: RankOptions,
): { matches: Match[]; excluded: ExcludedCandidate[] } {
  void now; // accepted for a pure, date-injected signature; unused by the score
  const weights: SoftScoreWeights = {
    ...DEFAULT_SOFT_SCORE_WEIGHTS,
    ...options?.weights,
  };
  const maxDistanceKm = options?.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM;
  const coords = options?.coords;

  const scored: ScoredRow[] = [];
  const excluded: ExcludedCandidate[] = [];

  for (const candidate of candidates) {
    const { offer, org, pastMatchCount } = candidate;

    // Req 16.5: a missing/uncomputable past-match count is a missing input.
    if (!Number.isFinite(pastMatchCount)) {
      excluded.push({
        offerId: offer.id,
        reason: "Excluded: past-match count is unavailable for this organization",
      });
      continue;
    }

    // Distance factor. Virtual offers have no travel distance ⇒ perfect 1.0.
    // In-person offers need both cities geocoded; otherwise the distance input
    // is missing and the candidate is excluded with a reason (Req 16.5).
    let distanceFactor: number;
    let distanceReason: string;
    if (offer.deliveryMode === "virtual") {
      distanceFactor = 1;
      distanceReason = "Virtual offer, so distance is not a barrier";
    } else {
      if (coords === undefined) {
        excluded.push({
          offerId: offer.id,
          reason: "Excluded: city coordinates are unavailable to compute distance",
        });
        continue;
      }
      const score = distanceScore(offer.city, org.city, coords, maxDistanceKm);
      if (score === null) {
        excluded.push({
          offerId: offer.id,
          reason: "Excluded: city coordinates are unavailable to compute distance",
        });
        continue;
      }
      distanceFactor = score;
      distanceReason =
        score >= 0.75
          ? "Offer is very close by"
          : score >= 0.4
            ? "Offer is a moderate distance away"
            : "Offer is near the distance limit";
    }

    // Topic fit from ask topic vs offer notes (Req 16.2).
    const topicFactor = topicFit(ask.topic, offer.notes);
    const topicReason =
      topicFactor >= 0.5
        ? "Strong topic overlap between the ask and the offer"
        : topicFactor > 0
          ? "Some topic overlap between the ask and the offer"
          : "Little topic overlap between the ask and the offer";

    // Under-resourced boost (Req 16.1).
    const underResourcedFactor = org.underResourced ? 1 : 0;
    const underResourcedReason = org.underResourced
      ? "Organization is flagged under-resourced, which raises its priority"
      : "Organization is not flagged under-resourced";

    // Fairness: never-matched orgs are favored (Req 16.3).
    const fairnessFactor = pastMatchCount === 0 ? 1 : 0;
    const fairnessReason =
      pastMatchCount === 0
        ? "Organization has no past matches, so it is prioritized for fairness"
        : `Organization already has ${pastMatchCount} past match${pastMatchCount === 1 ? "" : "es"}`;

    const rawScore =
      weights.topic * topicFactor +
      weights.distance * distanceFactor +
      weights.underResourced * underResourcedFactor +
      weights.fairness * fairnessFactor;
    // Clamp into [0, 1] against any floating-point drift (Req 16.1).
    const score = Math.min(1, Math.max(0, rawScore));

    // One plain-language reason per contributing factor (Req 16.4).
    const reasons = [topicReason, distanceReason, underResourcedReason, fairnessReason];

    scored.push({
      match: { askId: ask.id, offerId: offer.id, score, reasons },
      score,
      pastMatchCount,
      offerId: offer.id,
    });
  }

  // Deterministic total order (Property 6): score desc, then fairness tie-break
  // (zero-past-match first), then a total order on offer id so ordering never
  // depends on input order or on the engine's sort stability.
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    const aFair = a.pastMatchCount === 0 ? 0 : 1;
    const bFair = b.pastMatchCount === 0 ? 0 : 1;
    if (aFair !== bFair) {
      return aFair - bFair; // zero-past-match (0) ranks before matched (1)
    }
    return a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0;
  });

  return { matches: scored.map((row) => row.match), excluded };
}
