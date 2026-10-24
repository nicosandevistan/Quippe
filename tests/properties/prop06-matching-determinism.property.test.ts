import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { rankMatches } from "@/lib/core/matching";
import type { CityCoords, CityCoordsTable, RankCandidate } from "@/lib/core/matching";
import type {
  Ask,
  AskId,
  CompanyId,
  DeliveryMode,
  OfferId,
  OfferType,
  Organization,
  OrgId,
  OrgType,
} from "@/lib/schemas";

/**
 * Feature: open-bench-mvp, Property 6: matching is deterministic.
 *
 * `rankMatches` is a pure, date-injected ranking over hard-filter survivors. It
 * must yield an identical ranked match set, in identical order, for identical
 * inputs — and because its sort is a TOTAL order (score desc, then the fairness
 * tie-break of zero-past-match first, then a total order on offer id) that
 * output must not depend on the order the candidates were handed in. This test
 * exercises both facets, which together are the strongest form of determinism:
 *
 *   1. REPEATABILITY: calling `rankMatches` twice with the very same candidate
 *      list, ask, run date, and options produces byte-for-byte identical
 *      output — same length, and the same offerId / askId / score / reasons at
 *      every index.
 *
 *   2. ORDER-INDEPENDENCE (tie-break totality): calling `rankMatches` on a
 *      SHUFFLED copy of the same candidates produces the same output order. If
 *      the tie-break were not a total order, a permutation of equally-scored
 *      candidates could surface in a different order; asserting equality here
 *      pins down the fairness + offer-id tie-break deterministically.
 *
 * To make ties abundant (so the tie-break is actually exercised rather than
 * every score being distinct), the generator draws from a SMALL pool of offer
 * notes, cities, delivery modes, and under-resourced flags, and reuses them
 * across candidates. Many candidates therefore collide on raw score and must be
 * separated only by fairness and then by offer id. Offers mix `virtual` (score
 * distance 1.0, no coord dependence) and `in_person` (coord-dependent) so both
 * scoring paths — and the "missing coords ⇒ excluded, deterministically" path —
 * are covered. A coords table covering every city used is supplied so in-person
 * distance is computable for the cities the generator picks.
 *
 * Validates: Requirements 16.6.
 */

// --- Shared pools (kept small so scores collide and ties are common) -------

const CITIES: readonly string[] = ["Boston", "Cambridge", "Worcester", "Lowell"];

// A Massachusetts-ish coords table covering every city the generator can pick,
// so in-person distance is always computable for generated candidates.
const COORDS: CityCoordsTable = {
  Boston: { lat: 42.3601, lon: -71.0589 },
  Cambridge: { lat: 42.3736, lon: -71.1097 },
  Worcester: { lat: 42.2626, lon: -71.8023 },
  Lowell: { lat: 42.6334, lon: -71.3162 },
} satisfies Record<string, CityCoords>;

// A tiny notes pool so topicFit(ask.topic, offer.notes) collides often.
const NOTES_POOL: readonly string[] = [
  "biology lab tour for students",
  "chemistry speaker on green solvents",
  "robotics mentoring and spare parts",
  "general outreach event",
];

const OFFER_TYPES: readonly OfferType[] = ["supplies", "lab_tour", "speaker", "erg_event"];
const DELIVERY_MODES: readonly DeliveryMode[] = ["in_person", "virtual"];
const ORG_TYPES: readonly OrgType[] = [
  "high_school_club",
  "college_club",
  "undergrad_lab",
  "community_org",
];

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

// --- Ask ------------------------------------------------------------------

const askArb: fc.Arbitrary<Ask> = fc
  .record({
    type: fc.constantFrom(...OFFER_TYPES),
    groupSize: fc.integer({ min: 1, max: 50 }),
    deliveryMode: fc.constantFrom(...DELIVERY_MODES),
    topic: fc.constantFrom(
      "biology lab tour",
      "green chemistry solvents",
      "robotics parts",
      "outreach",
    ),
    needsSupplies: fc.boolean(),
  })
  .map(
    ({ type, groupSize, deliveryMode, topic, needsSupplies }) =>
      ({
        id: "ask-1" as AskId,
        orgId: "org-ask" as OrgId,
        type,
        groupSize,
        preferredDates: ["2025-06-01", "2025-06-02"],
        deliveryMode,
        topic,
        needsSupplies,
        status: "open",
      }) satisfies Ask,
  );

// --- Candidate (offer + org + pastMatchCount) -----------------------------

/**
 * One generated candidate. The concrete offer id and org id are assigned
 * per-list (so offer ids are unique and the id tie-break is well defined) from
 * the fields drawn here; drawing notes/city/deliveryMode/underResourced from
 * small pools is what makes score collisions — and therefore tie-breaks —
 * frequent.
 */
interface CandidateSpec {
  // offer fields
  offerType: OfferType;
  capacity: number;
  deliveryMode: DeliveryMode;
  offerCity: string;
  notes: string;
  hasMinAge: boolean;
  minAge: number;
  // org fields
  orgType: OrgType;
  underResourced: boolean;
  ageYears: number;
  orgCity: string;
  mission: string;
  // fairness input
  pastMatchCount: number;
}

const candidateSpecArb: fc.Arbitrary<CandidateSpec> = fc.record({
  offerType: fc.constantFrom(...OFFER_TYPES),
  capacity: fc.integer({ min: 1, max: 10000 }),
  deliveryMode: fc.constantFrom(...DELIVERY_MODES),
  offerCity: fc.constantFrom(...CITIES),
  notes: fc.constantFrom(...NOTES_POOL),
  hasMinAge: fc.boolean(),
  minAge: fc.integer({ min: 0, max: 25 }),
  orgType: fc.constantFrom(...ORG_TYPES),
  underResourced: fc.boolean(),
  ageYears: fc.integer({ min: 0, max: 60 }),
  orgCity: fc.constantFrom(...CITIES),
  mission: fc.constantFrom(
    "advance biology education",
    "support chemistry outreach",
    "grow robotics programs",
    "community STEM access",
  ),
  // Draw past-match counts from a small set (0,1,2) so the fairness tie-break
  // (zero vs non-zero) is exercised across many colliding scores.
  pastMatchCount: fc.nat({ max: 2 }),
});

/** Build the concrete RankCandidate list, assigning unique offer/org ids. */
function toCandidates(specs: readonly CandidateSpec[]): RankCandidate[] {
  return specs.map((spec, i) => {
    const offer = {
      id: `offer-${pad(i, 3)}` as OfferId,
      companyId: "co-a" as CompanyId,
      type: spec.offerType,
      capacity: spec.capacity,
      availableDates: ["2025-06-01", "2025-06-02"],
      deliveryMode: spec.deliveryMode,
      city: spec.offerCity,
      notes: spec.notes,
      ...(spec.hasMinAge ? { minAge: spec.minAge } : {}),
    };
    const org = {
      id: `org-${pad(i, 3)}` as OrgId,
      type: spec.orgType,
      name: "Org",
      school: "School",
      city: spec.orgCity,
      size: 10,
      mission: spec.mission,
      underResourced: spec.underResourced,
      ageYears: spec.ageYears,
      ...(spec.orgType === "high_school_club"
        ? { advisorAccountId: "acct-advisor" as Organization["advisorAccountId"] }
        : {}),
    } as Organization;
    return {
      offer: offer as RankCandidate["offer"],
      org,
      pastMatchCount: spec.pastMatchCount,
    } satisfies RankCandidate;
  });
}

// A deterministic permutation driven by a generated index list, so fast-check
// controls (and can shrink) the shuffle.
function permute<T>(items: readonly T[], order: readonly number[]): T[] {
  return order.map((i) => items[i]);
}

const NUM_RUNS = 200;

describe("Property 6 (prop06): matching is deterministic", () => {
  it("rankMatches called twice with identical inputs yields identical matches in identical order", () => {
    fc.assert(
      fc.property(
        fc.array(candidateSpecArb, { minLength: 0, maxLength: 30 }),
        askArb,
        (specs, ask) => {
          const candidates = toCandidates(specs);

          const first = rankMatches(candidates, ask, "2025-01-01", {
            coords: COORDS,
          });
          const second = rankMatches(candidates, ask, "2025-01-01", {
            coords: COORDS,
          });

          // Same number of matches.
          expect(second.matches.length).toBe(first.matches.length);
          // Deep equality of the whole matches array (offerId/askId/score/reasons
          // at every index) and of the excluded list.
          expect(JSON.stringify(second.matches)).toBe(JSON.stringify(first.matches));
          expect(JSON.stringify(second.excluded)).toBe(JSON.stringify(first.excluded));

          // Index-by-index field checks for an explicit, readable guarantee.
          first.matches.forEach((m, i) => {
            const n = second.matches[i];
            expect(n.offerId).toBe(m.offerId);
            expect(n.askId).toBe(m.askId);
            expect(n.score).toBe(m.score);
            expect(n.reasons).toEqual(m.reasons);
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("shuffling the candidate input order does not change rankMatches output order", () => {
    fc.assert(
      fc.property(
        fc
          .array(candidateSpecArb, { minLength: 0, maxLength: 30 })
          .chain((specs) =>
            fc.record({
              specs: fc.constant(specs),
              // A permutation of [0..n): a shuffled sequence of the indices.
              order: fc.constant(specs.map((_, i) => i)).chain((idx) =>
                fc.shuffledSubarray(idx, { minLength: idx.length, maxLength: idx.length }),
              ),
            }),
          ),
        askArb,
        ({ specs, order }, ask) => {
          const candidates = toCandidates(specs);
          const shuffled = permute(candidates, order);

          const original = rankMatches(candidates, ask, "2025-01-01", {
            coords: COORDS,
          });
          const reordered = rankMatches(shuffled, ask, "2025-01-01", {
            coords: COORDS,
          });

          // The ranked output order must be identical despite the input shuffle:
          // the sort is a total order (score, then fairness, then offer id).
          expect(reordered.matches.length).toBe(original.matches.length);
          expect(JSON.stringify(reordered.matches)).toBe(
            JSON.stringify(original.matches),
          );

          // The set of excluded offer ids is identical (order of exclusions may
          // follow input order, so compare as sorted id sets).
          const exIds = (r: { excluded: { offerId: string }[] }) =>
            r.excluded.map((e) => e.offerId).sort();
          expect(exIds(reordered)).toEqual(exIds(original));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
