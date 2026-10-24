import type {
  BOM,
  CompanyId,
  CoverageLine,
  CoverageReport,
  CoverageStatus,
  InventoryItem,
  ItemId,
  Organization,
} from "@/lib/schemas";

import { allocate } from "./capacity";
import { convert } from "./units";

/**
 * Deterministic coverage builder for Open Bench (Req 11.1–11.4, 11.6, 11.7,
 * 12.5, 14.4, 15.8; CP1, CP5, CP8).
 *
 * This module is PURE per structure.md: no I/O, no randomness, no `Date.now()`.
 * The run date arrives as the `now` argument and is never read from a clock.
 * It imports ONLY from `src/lib/schemas` and the sibling core modules
 * `./capacity` (allocate) and `./units` (convert).
 *
 * `buildCoverage` compares a BOM against an inventory snapshot and produces an
 * identical `CoverageReport` for identical inputs. Three guarantees land here:
 *
 *   - CP5 (Property 5): inventory items whose expiry is earlier than OR equal
 *     to `now` are excluded before any matching (Req 11.7). ISO date strings
 *     are compared lexically, which orders calendar dates correctly.
 *   - CP1 (Property 1): when `org.type === "high_school_club"`, items with
 *     `hsSafe === false` are additionally excluded, so no unsafe item ID can
 *     appear in any coverage line's `itemRefs` (Req 12.5, 14.4).
 *   - CP8 (Property 8): each line is classified `covered` iff allocated ≥
 *     needed, `partial` iff 0 < allocated < needed, `missing` iff allocated
 *     === 0 (Req 11.3, 11.4).
 *
 * Matching and allocation (Req 11.1, 11.2, 11.6):
 *   - BOM lines are matched to inventory by CATEGORY, compared after name
 *     normalization (case- and whitespace-insensitive). The BOM line's own
 *     `category` is normalized the same way as each item's `category`.
 *   - A candidate item only contributes to a line when its unit is convertible
 *     to the line's unit (`convert` returns a number); cross-dimension or
 *     countable `unit` pairs (`convert` returns null) are skipped for that line
 *     (Req 11.6).
 *   - Inventory is a shared pool: an item's quantity consumed by one BOM line
 *     is not available to another. Allocation reuses `allocate`, so the total
 *     drawn from any item never exceeds that item's available quantity (CP4).
 *   - A covered or partial line names the company that supplied the first
 *     allocated item and lists every allocated item's id in `itemRefs`; a
 *     missing line names no company and has empty `itemRefs` (Req 11.2).
 *
 * Determinism (Req 11.1): BOM lines are processed and emitted in their given
 * order; candidate items within a category are consulted in a stable order
 * (sorted by item id). No object-key iteration order or randomness is relied
 * upon, so an identical BOM + inventory snapshot + `now` + `org` yields a
 * byte-identical report.
 */

/**
 * Normalize a name/category for matching: lower-case and collapse all runs of
 * whitespace to a single space, trimming the ends. Case- and
 * whitespace-insensitive so "  Gel  Stain " matches "gel stain".
 */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether an inventory item survives the hard filters for this run (Req 11.7,
 * 12.5, 14.4; CP1, CP5).
 *
 *   - Excluded when its expiry is ≤ `now` (lexical ISO comparison).
 *   - Excluded for a high_school_club org when `hsSafe === false`.
 */
function isEligible(item: InventoryItem, org: Organization, now: string): boolean {
  // CP5: expired (expiry earlier than or equal to the run date) items are out.
  if (item.expiry <= now) {
    return false;
  }
  // CP1: a high school club never sees an hs-unsafe item.
  if (org.type === "high_school_club" && item.hsSafe === false) {
    return false;
  }
  return true;
}

/**
 * Classify a coverage line from its needed and allocated quantities (CP8).
 *
 *   covered  iff allocated ≥ needed
 *   partial  iff 0 < allocated < needed
 *   missing  iff allocated === 0
 */
function classify(needed: number, allocated: number): CoverageStatus {
  if (allocated >= needed) {
    return "covered";
  }
  if (allocated > 0) {
    return "partial";
  }
  return "missing";
}

// A candidate inventory item with its running un-consumed quantity, tracked in
// the item's own native unit so allocation across lines stays exact.
interface Candidate {
  item: InventoryItem;
  remaining: number; // remaining quantity in the item's native unit
}

/**
 * Build a deterministic coverage report comparing `bom` to `inventory`.
 *
 * @param bom       the bill of materials to cover
 * @param inventory the inventory snapshot across all companies
 * @param org       the requesting organization (its `type` drives hs_safe
 *                  filtering for high_school_club)
 * @param now       the injected run date (ISO string); expiry is compared ≤ now
 * @returns a `CoverageReport` with one line per BOM line, in BOM line order
 */
export function buildCoverage(
  bom: BOM,
  inventory: InventoryItem[],
  org: Organization,
  now: string,
): CoverageReport {
  // Apply the expiry + hs_safe hard filters, then fix a stable candidate order
  // (by item id) so allocation and itemRefs are deterministic regardless of the
  // input array order.
  const eligible = inventory
    .filter((item) => isEligible(item, org, now))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Group candidates by normalized category. Each item keeps a running
  // `remaining` so quantity consumed by one BOM line is unavailable to the next.
  const byCategory = new Map<string, Candidate[]>();
  for (const item of eligible) {
    const key = normalize(item.category);
    const group = byCategory.get(key);
    const candidate: Candidate = { item, remaining: item.quantity };
    if (group === undefined) {
      byCategory.set(key, [candidate]);
    } else {
      group.push(candidate);
    }
  }

  const lines: CoverageLine[] = bom.lines.map((line) => {
    const needed = line.quantity;
    const candidates = byCategory.get(normalize(line.category)) ?? [];

    let allocated = 0;
    const itemRefs: ItemId[] = [];
    let supplyingCompanyId: CompanyId | undefined;

    // Draw from each candidate in the fixed (id-sorted) order until the line is
    // satisfied. Quantities are converted into the BOM line's unit; items whose
    // unit is not convertible to the line's unit are skipped (Req 11.6).
    for (const candidate of candidates) {
      if (allocated >= needed) {
        break;
      }
      if (candidate.remaining <= 0) {
        continue;
      }
      const availableInLineUnit = convert(
        candidate.remaining,
        candidate.item.unit,
        line.unit,
      );
      if (availableInLineUnit === null || availableInLineUnit <= 0) {
        continue; // cross-dimension / countable unit — cannot serve this line
      }

      // Allocate the single remaining demand (needed − allocated) against this
      // item's available quantity; `allocate` guarantees the draw never exceeds
      // what the item has (CP4).
      const [givenInLineUnit] = allocate(availableInLineUnit, [needed - allocated]);
      if (givenInLineUnit <= 0) {
        continue;
      }

      allocated += givenInLineUnit;
      itemRefs.push(candidate.item.id);
      if (supplyingCompanyId === undefined) {
        supplyingCompanyId = candidate.item.companyId;
      }

      // Convert the amount taken back into the item's native unit and subtract
      // it so the next BOM line sees only what is left. The round-trip is exact
      // within the same dimension (CP7).
      const consumedNative = convert(givenInLineUnit, line.unit, candidate.item.unit);
      candidate.remaining -= consumedNative ?? 0;
    }

    const status = classify(needed, allocated);
    const coverageLine: CoverageLine = {
      bomLineId: line.id,
      status,
      needed,
      allocated,
      itemRefs,
    };
    // A covered/partial line names its supplier; a missing line names none
    // (Req 11.2). `status === "missing"` ⇔ allocated === 0 ⇔ no itemRefs.
    if (status !== "missing" && supplyingCompanyId !== undefined) {
      coverageLine.supplyingCompanyId = supplyingCompanyId;
    }
    return coverageLine;
  });

  return { lines, runDate: now };
}
