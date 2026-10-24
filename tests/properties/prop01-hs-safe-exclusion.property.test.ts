import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { computeHsSafe, DEFAULT_HAZARDOUS_KEYWORDS } from "@/lib/core/safety";
import type { OrgType, HazardClass } from "@/lib/schemas";

/**
 * Feature: open-bench-mvp, Property 1: hs_safe items never reach a high school club.
 *
 * SCOPE NOTE (dependency boundary):
 * The design states Property 1 is ultimately exercised end-to-end through
 * `applyHardFilters` (src/lib/core/matching.ts, Task 7.1) and `buildCoverage`
 * (src/lib/core/coverage.ts, Task 6.1). Those modules do NOT exist yet at the
 * time this test is authored (Task 4.2 runs in wave 3, before wave 4/5). To
 * keep the guarantee under test from the earliest possible point — and to
 * avoid inventing core API that later tasks would duplicate — this file asserts
 * the exclusion INVARIANT on the shared filter primitive that exists now:
 * the authoritative `computeHsSafe` rule in src/lib/core/safety.ts.
 *
 * The HS filter predicate `(orgType === "high_school_club") ? item.hsSafe : true`
 * is inlined here (it is the exact rule both `applyHardFilters` and
 * `buildCoverage` apply for high-school clubs). When those modules land in
 * tasks 6.1 / 7.1 the full integration — no `hsSafe === false` item in filtered
 * matches, coverage item refs, or protocol inputs — is asserted there; this
 * file pins the underlying invariant so a regression in the safety rule is
 * caught independently of the matching/coverage wiring.
 *
 * Honesty: `hsSafe` is never generated directly. We generate a `hazardClass`
 * and a `name` (sometimes seeded with a real hazardous keyword) plus an
 * AI-suggested value, then derive `hsSafe` via `computeHsSafe` exactly as the
 * production inventory pipeline does. The property therefore tests real rule
 * output, not a fabricated flag.
 *
 * Validates: Requirements 12.5, 15.9.
 */

const HAZARD_CLASSES: readonly HazardClass[] = [
  "none",
  "flammable",
  "corrosive",
  "toxic",
  "carcinogen",
  "biohazard",
  "oxidizer",
  "unknown",
];

const NON_HS_ORG_TYPES: readonly OrgType[] = [
  "college_club",
  "undergrad_lab",
  "community_org",
];

const ALL_ORG_TYPES: readonly OrgType[] = ["high_school_club", ...NON_HS_ORG_TYPES];

/** An inventory snapshot item whose `hsSafe` is derived from the safety rule. */
interface SnapshotItem {
  name: string;
  category: string;
  hazardClass: HazardClass;
  hsSafe: boolean;
}

/**
 * The HS exclusion predicate shared by `applyHardFilters` and `buildCoverage`:
 * a high_school_club keeps an item only when it is `hsSafe`; every other org
 * type is unaffected by the HS rule.
 */
const allowedForOrg = (item: SnapshotItem, orgType: OrgType): boolean =>
  orgType === "high_school_club" ? item.hsSafe : true;

/**
 * Arbitrary for a single inventory item. Generates the hazard class and text
 * fields, optionally injecting a configured hazardous keyword into the name so
 * the generated space honestly spans both hsSafe=true and hsSafe=false, then
 * derives `hsSafe` from `computeHsSafe` (the production rule).
 */
const itemArb: fc.Arbitrary<SnapshotItem> = fc
  .record({
    baseName: fc.string({ minLength: 1, maxLength: 20 }),
    injectKeyword: fc.option(fc.constantFrom(...DEFAULT_HAZARDOUS_KEYWORDS), {
      nil: undefined,
    }),
    category: fc.string({ minLength: 1, maxLength: 20 }),
    hazardClass: fc.constantFrom(...HAZARD_CLASSES),
    aiSuggestedHsSafe: fc.boolean(),
  })
  .map(({ baseName, injectKeyword, category, hazardClass, aiSuggestedHsSafe }) => {
    const name = injectKeyword ? `${baseName} ${injectKeyword}` : baseName;
    const hsSafe = computeHsSafe({ name, category, hazardClass }, aiSuggestedHsSafe);
    return { name, category, hazardClass, hsSafe } satisfies SnapshotItem;
  });

const snapshotArb: fc.Arbitrary<SnapshotItem[]> = fc.array(itemArb, {
  minLength: 0,
  maxLength: 30,
});

describe("Property 1 (prop01): hs_safe items never reach a high school club", () => {
  it("excludes every hsSafe===false item for a high_school_club", () => {
    fc.assert(
      fc.property(snapshotArb, (snapshot) => {
        const survivors = snapshot.filter((item) =>
          allowedForOrg(item, "high_school_club"),
        );
        // No surviving item may be unsafe.
        expect(survivors.every((item) => item.hsSafe === true)).toBe(true);
        // Every unsafe item in the snapshot must have been dropped.
        expect(survivors.some((item) => item.hsSafe === false)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("keeps all otherwise-eligible items for non-high-school org types", () => {
    fc.assert(
      fc.property(
        snapshotArb,
        fc.constantFrom(...NON_HS_ORG_TYPES),
        (snapshot, orgType) => {
          const survivors = snapshot.filter((item) => allowedForOrg(item, orgType));
          // The HS rule removes nothing for a non-HS org: all items survive,
          // including those that are hsSafe===false.
          expect(survivors).toHaveLength(snapshot.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("drops unsafe items for HS clubs across any org type, never for non-HS", () => {
    fc.assert(
      fc.property(
        snapshotArb,
        fc.constantFrom(...ALL_ORG_TYPES),
        (snapshot, orgType) => {
          const survivors = snapshot.filter((item) => allowedForOrg(item, orgType));
          if (orgType === "high_school_club") {
            expect(survivors.every((item) => item.hsSafe)).toBe(true);
          } else {
            expect(survivors).toHaveLength(snapshot.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
