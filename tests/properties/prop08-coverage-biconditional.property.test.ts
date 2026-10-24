import { describe, it } from "vitest";
import fc from "fast-check";

import { buildCoverage } from "@/lib/core/coverage";
import type {
  BOM,
  BomLine,
  BomLineId,
  CompanyId,
  InventoryItem,
  ItemId,
  OrgId,
  Organization,
  Unit,
} from "@/lib/schemas";

/**
 * Feature: open-bench-mvp, Property 8 (prop08): coverage "fully covered" iff
 * allocated ≥ needed.
 *
 * Exercises the pure `buildCoverage(bom, inventory, org, now): CoverageReport`
 * from `src/lib/core/coverage.ts`. No I/O, no randomness beyond fast-check, no
 * clock — `now` is injected as a fixed ISO date.
 *
 * The property pins the classification biconditional against the SAME
 * `needed`/`allocated` numbers that `buildCoverage` reports on each line (we
 * read `line.needed` and `line.allocated` and check the biconditional against
 * `line.status`, never recomputing them):
 *
 *   status === "covered"  IFF  allocated ≥ needed
 *   status === "partial"  IFF  0 < allocated < needed
 *   status === "missing"  IFF  allocated === 0
 *
 * Honesty of the generated space (so a mix of covered/partial/missing results):
 *   - BOMs are generated as real `BomLine`s with non-empty item/category/unit/
 *     purpose and quantity > 0, wrapped in a 1..200-line `BOM`.
 *   - Inventory items are generated with id/companyId/name/category/quantity>0/
 *     unit/expiry/hazardClass/hsSafe. Every expiry is AFTER the fixed `now`, so
 *     the expiry filter (Property 5) does not empty the snapshot out from under
 *     this property.
 *   - The org is a `college_club` (non-high_school_club), so the hs_safe hard
 *     filter never interferes with allocation here.
 *   - Categories are drawn from a small shared pool and units are kept within a
 *     single dimension (mass: mg/g) so `convert` always succeeds and unit
 *     conversions are meaningful. BOM and inventory therefore overlap on
 *     category often, producing a genuine mix of covered, partial, and missing
 *     lines rather than all-missing.
 *
 * Validates: Requirements 11.3, 11.4.
 */

// Fixed injected run date. Every generated expiry is strictly after this so the
// expiry filter keeps every item (lexical ISO comparison, expiry > now).
const NOW = "2020-01-01";

// A small pool of category names so BOM lines and inventory items collide on
// category frequently, yielding covered/partial/missing variety.
const CATEGORIES = ["reagent", "stain", "buffer", "enzyme", "marker"] as const;

// Units kept within the mass dimension so `convert` is always meaningful
// (mg <-> g). This keeps allocation non-trivial and conversions exact.
const MASS_UNITS: readonly Unit[] = ["mg", "g"];

// --- Arbitraries ----------------------------------------------------------

const categoryArb = fc.constantFrom(...CATEGORIES);
const unitArb = fc.constantFrom(...MASS_UNITS);

// A positive, finite quantity. Bounded so mg/g conversions stay well inside
// float precision and both "plenty" and "scarce" supply are reachable.
const quantityArb = fc.double({
  min: 0.01,
  max: 10000,
  noNaN: true,
  noDefaultInfinity: true,
});

// An expiry strictly after NOW ("2020-01-01"), so no item is filtered for
// expiry. Years 2021..2099 are all lexically greater than "2020-01-01".
const expiryArb = fc
  .integer({ min: 2021, max: 2099 })
  .map((year) => `${year}-06-15`);

// A single honest BOM line. The id is branded; quantity is strictly > 0.
const bomLineArb = (index: number): fc.Arbitrary<BomLine> =>
  fc.record({
    item: fc.string({ minLength: 1, maxLength: 20 }),
    category: categoryArb,
    quantity: quantityArb,
    unit: unitArb,
    purpose: fc.string({ minLength: 1, maxLength: 20 }),
  }).map(({ item, category, quantity, unit, purpose }) => ({
    id: `bl-${index}` as BomLineId,
    item: item.trim().length > 0 ? item : "reagent",
    category,
    quantity,
    unit,
    purpose: purpose.trim().length > 0 ? purpose : "run",
  }));

// A BOM of 1..12 lines (within the schema's 1..200 bound). Line ids are made
// unique by their index so coverage lines map back unambiguously.
const bomArb: fc.Arbitrary<BOM> = fc
  .integer({ min: 1, max: 12 })
  .chain((count) =>
    fc.tuple(...Array.from({ length: count }, (_unused, i) => bomLineArb(i))),
  )
  .map((lines) => ({ lines }));

// A single honest inventory item. hsSafe is irrelevant to this property (the
// org is a college_club) but generated anyway to exercise a realistic shape.
const inventoryItemArb = (index: number): fc.Arbitrary<InventoryItem> =>
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    category: categoryArb,
    quantity: quantityArb,
    unit: unitArb,
    expiry: expiryArb,
    hsSafe: fc.boolean(),
  }).map(({ name, category, quantity, unit, expiry, hsSafe }) => ({
    id: `it-${index}` as ItemId,
    companyId: "co-1" as CompanyId,
    name: name.trim().length > 0 ? name : "reagent",
    category,
    quantity,
    unit,
    expiry,
    hazardClass: "none" as const,
    hsSafe,
  }));

// An inventory snapshot of 0..20 items with unique ids.
const inventoryArb: fc.Arbitrary<InventoryItem[]> = fc
  .integer({ min: 0, max: 20 })
  .chain((count) =>
    count === 0
      ? fc.constant<InventoryItem[]>([])
      : fc.tuple(
          ...Array.from({ length: count }, (_unused, i) => inventoryItemArb(i)),
        ).map((items) => [...items]),
  );

// A fixed non-high_school_club org so the hs_safe filter never interferes.
const ORG: Organization = {
  id: "org-1" as OrgId,
  type: "college_club",
  name: "Demo College Club",
  school: "Demo University",
  city: "Boston",
  size: 10,
  mission: "demonstrate coverage classification",
  underResourced: false,
  ageYears: 3,
};

const NUM_RUNS = 200;

describe('Property 8 (prop08): coverage "fully covered" iff allocated ≥ needed', () => {
  it("classifies every coverage line by the allocated-vs-needed biconditional", () => {
    fc.assert(
      fc.property(bomArb, inventoryArb, (bom, inventory) => {
        const report = buildCoverage(bom, inventory, ORG, NOW);

        // One line per BOM line, in BOM order.
        if (report.lines.length !== bom.lines.length) {
          throw new Error(
            `expected ${bom.lines.length} coverage lines, got ${report.lines.length}`,
          );
        }

        for (const line of report.lines) {
          // Read the numbers buildCoverage itself reported; never recompute.
          const { status, needed, allocated } = line;

          const isCovered = status === "covered";
          const isPartial = status === "partial";
          const isMissing = status === "missing";

          // covered  IFF  allocated ≥ needed
          if (isCovered !== allocated >= needed) {
            throw new Error(
              `line ${line.bomLineId}: status="${status}" but allocated=${allocated}, ` +
                `needed=${needed} (covered should hold iff allocated ≥ needed)`,
            );
          }

          // partial  IFF  0 < allocated < needed
          if (isPartial !== (allocated > 0 && allocated < needed)) {
            throw new Error(
              `line ${line.bomLineId}: status="${status}" but allocated=${allocated}, ` +
                `needed=${needed} (partial should hold iff 0 < allocated < needed)`,
            );
          }

          // missing  IFF  allocated === 0
          if (isMissing !== (allocated === 0)) {
            throw new Error(
              `line ${line.bomLineId}: status="${status}" but allocated=${allocated} ` +
                `(missing should hold iff allocated === 0)`,
            );
          }

          // Exactly one status holds (sanity on the enum partition).
          const trueCount = [isCovered, isPartial, isMissing].filter(Boolean).length;
          if (trueCount !== 1) {
            throw new Error(
              `line ${line.bomLineId}: status="${status}" is not exactly one of covered/partial/missing`,
            );
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
