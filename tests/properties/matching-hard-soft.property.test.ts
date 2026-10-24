import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  applyHardFilters,
  rankMatches,
  haversineKm,
  DEFAULT_MAX_DISTANCE_KM,
  type CityCoords,
  type CityCoordsTable,
  type RankCandidate,
} from "@/lib/core/matching";
import type {
  Ask,
  AskId,
  CompanyId,
  InventoryItem,
  ItemId,
  Offer,
  OfferId,
  OfferType,
  Organization,
  OrgId,
  OrgType,
} from "@/lib/schemas";

/**
 * Feature: open-bench-mvp, Task 7.4 supporting property tests for the matching
 * engine (src/lib/core/matching.ts).
 *
 * Two guarantees are exercised here:
 *
 *   HARD-FILTER SOUNDNESS — for each exclusion reason in `applyHardFilters`
 *   (Req 15.2–15.7), construct inputs where that one reason holds while every
 *   other dimension is kept valid, and assert the offer is EXCLUDED. Isolating
 *   a single reason per property proves each rule is individually sufficient to
 *   drop a pair (soundness of each filter), rather than merely that some
 *   combination excludes.
 *
 *   SOFT-SCORE BOUNDS — for every `Match` returned by `rankMatches` (Req 16.1,
 *   16.4) the score is in [0, 1] and the number of reasons equals the number of
 *   contributing factors (the implementation emits exactly one reason per
 *   factor — four). Candidates are generated so none is excluded for missing
 *   scoring inputs; the assertion holds for whatever matches are returned.
 *
 * Determinism note: dates are ISO strings "YYYY-MM-DD" with zero-padded
 * components so lexical comparison (what the core uses) matches calendar order.
 *
 * Validates: Requirements 7.5, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.4.
 */

const NUM_RUNS = 200;

// --- Shared coordinate table ---------------------------------------------

// A small Massachusetts-like coords table. All five cities sit within
// DEFAULT_MAX_DISTANCE_KM (80 km) of one another so the distance filter is not
// what excludes a pair unless a property deliberately forces it.
const COORDS: CityCoordsTable = {
  Boston: { lat: 42.3601, lon: -71.0589 },
  Cambridge: { lat: 42.3736, lon: -71.1097 },
  Somerville: { lat: 42.3876, lon: -71.0995 },
  Newton: { lat: 42.337, lon: -71.2092 },
  Quincy: { lat: 42.2529, lon: -71.0023 },
};
const KNOWN_CITIES = Object.keys(COORDS);

// A faraway city used only by the over-distance property. It is > 80 km from
// every city in COORDS (New York is ~300 km from Boston).
const FAR_CITY = "NewYork";
const FAR_COORDS: CityCoords = { lat: 40.7128, lon: -74.006 };
const COORDS_WITH_FAR: CityCoordsTable = { ...COORDS, [FAR_CITY]: FAR_COORDS };

// --- Dates ----------------------------------------------------------------

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

const isoDateArb: fc.Arbitrary<string> = fc
  .record({
    year: fc.integer({ min: 2024, max: 2027 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);

// A non-empty set of distinct ISO dates.
const dateSetArb: fc.Arbitrary<string[]> = fc
  .uniqueArray(isoDateArb, { minLength: 1, maxLength: 5 })
  .map((xs) => [...xs]);

// A fixed run date for the supply-expiry gate; inventory below never expires
// before this so the supply filter never fires in the non-supply tests.
const NOW = "2025-01-01";
const FUTURE_EXPIRY = "2099-12-31";

const OFFER_TYPES: readonly OfferType[] = [
  "supplies",
  "lab_tour",
  "speaker",
  "erg_event",
];
const NON_HS_ORG_TYPES: readonly OrgType[] = [
  "college_club",
  "undergrad_lab",
  "community_org",
];

// --- Builders -------------------------------------------------------------

/**
 * Build a single Offer with sensible, always-valid defaults; callers override
 * only the field(s) that a given property is probing. Kept non-supplies by
 * default so the supply-safety gate (15.8/15.9) never interferes.
 */
function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer-1" as OfferId,
    companyId: "co-1" as CompanyId,
    type: "lab_tour",
    capacity: 100,
    availableDates: ["2025-06-01"],
    deliveryMode: "virtual",
    city: "Boston",
    notes: "a sample offer",
    ...overrides,
  } as Offer;
}

function makeAsk(overrides: Partial<Ask> = {}): Ask {
  return {
    id: "ask-1" as AskId,
    orgId: "org-1" as OrgId,
    type: "lab_tour",
    groupSize: 10,
    preferredDates: ["2025-06-01"],
    deliveryMode: "virtual",
    topic: "a sample ask",
    needsSupplies: false,
    status: "open",
    ...overrides,
  } as Ask;
}

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1" as OrgId,
    type: "college_club",
    name: "Test Org",
    school: "Test School",
    city: "Boston",
    size: 10,
    mission: "test mission",
    underResourced: false,
    ageYears: 20,
    ...overrides,
  } as Organization;
}

// No inventory is needed for the non-supplies hard-filter properties.
const NO_INVENTORY: readonly InventoryItem[] = [];

// Supplies inventory that is always eligible (non-expired, hsSafe) so that the
// supply gate never masks the single reason a given property is testing.
const eligibleInventory: readonly InventoryItem[] = [
  {
    id: "item-1" as ItemId,
    companyId: "co-1" as CompanyId,
    name: "agarose",
    category: "reagent",
    quantity: 100,
    unit: "g",
    expiry: FUTURE_EXPIRY,
    hazardClass: "none",
    hsSafe: true,
  },
];

describe("Task 7.4 — hard-filter soundness (applyHardFilters)", () => {
  // 15.2 TYPE MISMATCH always excludes.
  it("excludes when offer.type !== ask.type (Req 15.2)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...OFFER_TYPES),
        fc.constantFrom(...OFFER_TYPES),
        (offerType, askType) => {
          fc.pre(offerType !== askType);
          const offer = makeOffer({ type: offerType });
          const ask = makeAsk({ type: askType });
          const survivors = applyHardFilters(
            [offer],
            ask,
            makeOrg(),
            eligibleInventory,
            COORDS,
            NOW,
          );
          expect(survivors).toHaveLength(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // 15.3 CAPACITY < groupSize always excludes.
  it("excludes when remaining capacity < ask.groupSize (Req 15.3)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 499 }),
        (groupSize, deficit) => {
          // capacity strictly below groupSize by `deficit`, clamped to >= 1.
          const capacity = Math.max(1, groupSize - deficit);
          fc.pre(capacity < groupSize);
          const offer = makeOffer({ capacity });
          const ask = makeAsk({ groupSize });
          const survivors = applyHardFilters(
            [offer],
            ask,
            makeOrg(),
            eligibleInventory,
            COORDS,
            NOW,
          );
          expect(survivors).toHaveLength(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // 15.4 NO DATE OVERLAP always excludes. Disjoint date sets by construction.
  it("excludes when offer and ask dates do not overlap (Req 15.4)", () => {
    fc.assert(
      fc.property(dateSetArb, dateSetArb, (datesA, datesB) => {
        // Force disjointness: prefix every ask date so no string can match.
        const offerDates = datesA.map((d) => `A-${d}`);
        const askDates = datesB.map((d) => `B-${d}`);
        const offer = makeOffer({ availableDates: offerDates });
        const ask = makeAsk({ preferredDates: askDates });
        const survivors = applyHardFilters(
          [offer],
          ask,
          makeOrg(),
          eligibleInventory,
          COORDS,
          NOW,
        );
        expect(survivors).toHaveLength(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // 15.5 UNDER MIN AGE always excludes.
  it("excludes when org.ageYears < offer.minAge (Req 15.5)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 25 }),
        fc.integer({ min: 1, max: 25 }),
        (minAge, below) => {
          const ageYears = Math.max(0, minAge - below);
          fc.pre(ageYears < minAge);
          const offer = makeOffer({ minAge });
          const org = makeOrg({ ageYears });
          const survivors = applyHardFilters(
            [offer],
            makeAsk(),
            org,
            eligibleInventory,
            COORDS,
            NOW,
          );
          expect(survivors).toHaveLength(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // 15.6 IN-PERSON OVER DISTANCE always excludes. Offer is in the faraway city
  // (> 80 km from every org city in COORDS), everything else valid.
  it("excludes in-person offers beyond the distance limit (Req 15.6)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...KNOWN_CITIES), (orgCity) => {
        // Sanity: the faraway city really is over the limit from this org city.
        fc.pre(
          haversineKm(FAR_COORDS, COORDS[orgCity] as CityCoords) >
            DEFAULT_MAX_DISTANCE_KM,
        );
        const offer = makeOffer({ deliveryMode: "in_person", city: FAR_CITY });
        const ask = makeAsk({ deliveryMode: "in_person" });
        const org = makeOrg({ city: orgCity });
        const survivors = applyHardFilters(
          [offer],
          ask,
          org,
          eligibleInventory,
          COORDS_WITH_FAR,
          NOW,
        );
        expect(survivors).toHaveLength(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // 15.7 IN-PERSON MISSING COORDS always excludes — either city absent from the
  // coords table drops the pair (fail closed).
  it("excludes in-person offers when either city is not in the coords table (Req 15.7)", () => {
    const missingSideArb = fc.constantFrom<"offer" | "org" | "both">(
      "offer",
      "org",
      "both",
    );
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_CITIES),
        fc.constantFrom(...KNOWN_CITIES),
        missingSideArb,
        (offerCity, orgCity, side) => {
          // "Ghost" cities that are not keys in COORDS.
          const ghostOffer = "GhostOfferCity";
          const ghostOrg = "GhostOrgCity";
          const finalOfferCity =
            side === "offer" || side === "both" ? ghostOffer : offerCity;
          const finalOrgCity =
            side === "org" || side === "both" ? ghostOrg : orgCity;
          const offer = makeOffer({
            deliveryMode: "in_person",
            city: finalOfferCity,
          });
          const ask = makeAsk({ deliveryMode: "in_person" });
          const org = makeOrg({ city: finalOrgCity });
          const survivors = applyHardFilters(
            [offer],
            ask,
            org,
            eligibleInventory,
            COORDS,
            NOW,
          );
          expect(survivors).toHaveLength(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Sanity: a fully-valid in-person pair within range SURVIVES, so the
  // exclusion properties above are not vacuously passing on a broken baseline.
  it("keeps a fully-valid in-person pair within range (baseline sanity)", () => {
    const offer = makeOffer({
      deliveryMode: "in_person",
      city: "Boston",
      type: "lab_tour",
      capacity: 50,
      availableDates: ["2025-06-01"],
    });
    const ask = makeAsk({
      deliveryMode: "in_person",
      type: "lab_tour",
      groupSize: 10,
      preferredDates: ["2025-06-01"],
    });
    const org = makeOrg({ city: "Cambridge", ageYears: 20 });
    const survivors = applyHardFilters(
      [offer],
      ask,
      org,
      eligibleInventory,
      COORDS,
      NOW,
    );
    expect(survivors).toHaveLength(1);
  });
});

// --- Soft-score bounds ----------------------------------------------------

// A candidate generator whose offers are VIRTUAL, so distance scoring never
// needs coordinates and no candidate is excluded for a missing scoring input.
const candidateArb: fc.Arbitrary<RankCandidate> = fc
  .record({
    idn: fc.integer({ min: 0, max: 9999 }),
    orgType: fc.constantFrom(...NON_HS_ORG_TYPES),
    underResourced: fc.boolean(),
    notes: fc.string({ minLength: 0, maxLength: 60 }),
    pastMatchCount: fc.integer({ min: 0, max: 50 }),
    city: fc.constantFrom(...KNOWN_CITIES),
  })
  .map(({ idn, orgType, underResourced, notes, pastMatchCount, city }) => {
    const offer = makeOffer({
      id: `offer-${pad(idn, 4)}` as OfferId,
      deliveryMode: "virtual",
      notes,
      city,
    });
    const org = makeOrg({
      id: `org-${pad(idn, 4)}` as OrgId,
      type: orgType,
      underResourced,
      city,
    });
    return { offer, org, pastMatchCount } satisfies RankCandidate;
  });

describe("Task 7.4 — soft-score bounds (rankMatches)", () => {
  it("every returned match has score in [0,1] and exactly 4 reasons (Req 16.1, 16.4)", () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 60 }),
        (candidates, topic) => {
          const ask = makeAsk({ topic });
          const { matches } = rankMatches(candidates, ask, NOW, {
            coords: COORDS,
          });
          for (const match of matches) {
            expect(match.score).toBeGreaterThanOrEqual(0);
            expect(match.score).toBeLessThanOrEqual(1);
            // One reason per contributing factor: topic, distance,
            // under_resourced, fairness — exactly four.
            expect(match.reasons).toHaveLength(4);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("holds for in-person candidates with a complete coords table too (Req 16.1, 16.4)", () => {
    const inPersonCandidateArb: fc.Arbitrary<RankCandidate> = candidateArb.map(
      (c) => ({
        ...c,
        offer: makeOffer({
          id: c.offer.id,
          deliveryMode: "in_person",
          notes: c.offer.notes,
          city: c.offer.city,
        }),
      }),
    );
    fc.assert(
      fc.property(
        fc.array(inPersonCandidateArb, { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 60 }),
        (candidates, topic) => {
          const ask = makeAsk({ topic });
          const { matches } = rankMatches(candidates, ask, NOW, {
            coords: COORDS,
          });
          for (const match of matches) {
            expect(match.score).toBeGreaterThanOrEqual(0);
            expect(match.score).toBeLessThanOrEqual(1);
            expect(match.reasons).toHaveLength(4);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
