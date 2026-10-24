import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildCoverage } from "@/lib/core/coverage";
import { isInventoryUsable } from "@/lib/core/matching";
import type {
  BOM,
  BomLine,
  BomLineId,
  CompanyId,
  InventoryItem,
  ItemId,
  Organization,
  OrgId,
  OrgType,
  Unit,
} from "@/lib/schemas";

/**
 * Feature: open-bench-mvp, Property 5: expired items never appear.
 *
 * For all inventory snapshots and run dates `now`, an item whose expiry is ≤
 * `now` (expired) is EXCLUDED from coverage — its id never appears in any
 * coverage line's `itemRefs` — and from matching, while an item whose expiry
 * is > `now` is retained (eligible to appear). Both the pure core paths that
 * apply the expiry filter are exercised:
 *
 *   - `buildCoverage` (src/lib/core/coverage.ts): a BOM is matched against an
 *     inventory snapshot that deliberately mixes expired and non-expired items
 *     in the SAME categories/units the BOM needs, so an expired item is a
 *     genuine allocation candidate that must still be dropped. The test asserts
 *     no expired item id appears in any `line.itemRefs`, and that every
 *     allocated itemRef points at an item whose expiry is strictly after `now`.
 *
 *   - `isInventoryUsable` (src/lib/core/matching.ts): the primitive the
 *     hard-filter supply gate consults. A simple oracle — for every item and
 *     every `now`, `isInventoryUsable(item, now) === (item.expiry > now)`.
 *
 * SCOPE NOTE: to keep ONLY the expiry filter under test, every coverage run
 * uses a non-`high_school_club` org (so the hs_safe gate is inert) and all
 * units stay within one dimension (so unit convertibility never masks an
 * item). Dates are ISO strings built from padded year/month/day components, so
 * lexical comparison (the comparison `buildCoverage` and `isInventoryUsable`
 * use) agrees with calendar order; `now` is drawn from inside the same range so
 * both expired and non-expired items genuinely occur.
 *
 * Validates: Requirements 11.7, 14.4, 15.8.
 */

// --- Dates ----------------------------------------------------------------

// Years span a window around a mid-point `now`, chosen so both expired
// (expiry ≤ now) and non-expired (expiry > now) items occur across runs.
const MIN_YEAR = 2018;
const MAX_YEAR = 2026;

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/**
 * An ISO date string "YYYY-MM-DD" with zero-padded components so that lexical
 * (string) comparison matches calendar order — exactly the comparison the core
 * applies to `expiry` vs `now`.
 */
const isoDateArb: fc.Arbitrary<string> = fc
  .record({
    year: fc.integer({ min: MIN_YEAR, max: MAX_YEAR }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // 1..28 keeps every month valid
  })
  .map(({ year, month, day }) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);

// Units within a SINGLE dimension (volume) so convertibility never excludes an
// item for a reason other than expiry.
const VOLUME_UNITS: readonly Unit[] = ["uL", "mL", "L"];

// A small pool of shared categories so BOM lines and inventory items line up
// and expired items are real allocation candidates.
const CATEGORIES: readonly string[] = ["reagent", "solvent", "buffer", "stain"];

// --- Non-HS organization --------------------------------------------------

const NON_HS_ORG_TYPES: readonly OrgType[] = [
  "college_club",
  "undergrad_lab",
  "community_org",
];

const orgArb: fc.Arbitrary<Organization> = fc
  .record({
    type: fc.constantFrom(...NON_HS_ORG_TYPES),
    underResourced: fc.boolean(),
  })
  .map(
    ({ type, underResourced }) =>
      ({
        id: "org-1" as OrgId,
        type,
        name: "Test Org",
        school: "Test School",
        city: "Boston",
        size: 10,
        mission: "test mission",
        underResourced,
        ageYears: 20,
      }) as Organization,
  );

// --- Inventory ------------------------------------------------------------

/** A raw item spec; the concrete id is assigned per-snapshot so ids are unique. */
interface ItemSpec {
  companyId: string;
  name: string;
  category: string;
  quantity: number;
  unit: Unit;
  expiry: string;
  hsSafe: boolean;
}

const itemSpecArb: fc.Arbitrary<ItemSpec> = fc.record({
  companyId: fc.constantFrom("co-a", "co-b"),
  name: fc.string({ minLength: 1, maxLength: 12 }),
  category: fc.constantFrom(...CATEGORIES),
  quantity: fc.double({ min: 0.5, max: 1000, noNaN: true, noDefaultInfinity: true }),
  unit: fc.constantFrom(...VOLUME_UNITS),
  expiry: isoDateArb,
  hsSafe: fc.boolean(),
});

const toInventory = (specs: readonly ItemSpec[]): InventoryItem[] =>
  specs.map(
    (spec, i) =>
      ({
        id: `item-${pad(i, 3)}` as ItemId,
        companyId: spec.companyId as CompanyId,
        name: spec.name,
        category: spec.category,
        quantity: spec.quantity,
        unit: spec.unit,
        expiry: spec.expiry,
        hazardClass: "none",
        hsSafe: spec.hsSafe,
      }) satisfies InventoryItem,
  );

// --- BOM ------------------------------------------------------------------

const bomLineArb: fc.Arbitrary<Omit<BomLine, "id">> = fc.record({
  item: fc.string({ minLength: 1, maxLength: 12 }),
  category: fc.constantFrom(...CATEGORIES),
  quantity: fc.double({ min: 0.5, max: 500, noNaN: true, noDefaultInfinity: true }),
  unit: fc.constantFrom(...VOLUME_UNITS),
  purpose: fc.string({ minLength: 1, maxLength: 12 }),
});

const bomArb: fc.Arbitrary<BOM> = fc
  .array(bomLineArb, { minLength: 1, maxLength: 8 })
  .map((lines) => ({
    lines: lines.map(
      (line, i) => ({ ...line, id: `bl-${pad(i, 2)}` as BomLineId }) satisfies BomLine,
    ),
  }));

const NUM_RUNS = 200;

describe("Property 5 (prop05): expired items never appear", () => {
  it("buildCoverage never references an expired item (expiry ≤ now) in any line", () => {
    fc.assert(
      fc.property(
        bomArb,
        fc.array(itemSpecArb, { minLength: 0, maxLength: 25 }),
        isoDateArb,
        orgArb,
        (bom, specs, now, org) => {
          const inventory = toInventory(specs);
          const byId = new Map(inventory.map((item) => [item.id as string, item]));
          const expiredIds = new Set(
            inventory.filter((item) => item.expiry <= now).map((item) => item.id as string),
          );

          const report = buildCoverage(bom, inventory, org, now);

          for (const line of report.lines) {
            for (const ref of line.itemRefs) {
              // No expired item id may appear in any coverage line.
              expect(expiredIds.has(ref as string)).toBe(false);
              // Every allocated item must have expiry strictly after `now`.
              const item = byId.get(ref as string);
              expect(item).toBeDefined();
              expect((item as InventoryItem).expiry > now).toBe(true);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("isInventoryUsable(item, now) is exactly (item.expiry > now)", () => {
    fc.assert(
      fc.property(isoDateArb, isoDateArb, (expiry, now) => {
        expect(isInventoryUsable({ expiry }, now)).toBe(expiry > now);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("a non-expired item in a matching category is eligible to appear in coverage", () => {
    // A targeted generator that guarantees at least one non-expired item in the
    // BOM's category/unit, so the "retained items are eligible" direction is
    // actually exercised (not vacuously true because everything expired).
    const scenarioArb = fc
      .record({
        category: fc.constantFrom(...CATEGORIES),
        unit: fc.constantFrom(...VOLUME_UNITS),
        now: isoDateArb,
        org: orgArb,
      })
      .chain(({ category, unit, now, org }) => {
        // A future expiry strictly greater than `now` within the window.
        const futureExpiry = fc
          .record({
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 28 }),
          })
          .map(({ month, day }) => `${pad(MAX_YEAR + 1, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
        return fc.record({
          category: fc.constant(category),
          unit: fc.constant(unit),
          now: fc.constant(now),
          org: fc.constant(org),
          liveExpiry: futureExpiry,
          need: fc.double({ min: 0.5, max: 100, noNaN: true, noDefaultInfinity: true }),
          supply: fc.double({ min: 0.5, max: 1000, noNaN: true, noDefaultInfinity: true }),
        });
      });

    fc.assert(
      fc.property(scenarioArb, ({ category, unit, now, org, liveExpiry, need, supply }) => {
        const inventory: InventoryItem[] = [
          {
            id: "item-live" as ItemId,
            companyId: "co-a" as CompanyId,
            name: "live",
            category,
            quantity: supply,
            unit,
            expiry: liveExpiry, // > now by construction
            hazardClass: "none",
            hsSafe: true,
          },
        ];
        const bom: BOM = {
          lines: [
            {
              id: "bl-00" as BomLineId,
              item: "x",
              category,
              quantity: need,
              unit,
              purpose: "p",
            },
          ],
        };

        const report = buildCoverage(bom, inventory, org, now);
        // The single live item (expiry > now) must be the one allocated.
        expect(report.lines[0].itemRefs).toContain("item-live");
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
