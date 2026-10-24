import { describe, expect, it } from "vitest";

import { buildCoverage } from "@/lib/core/coverage";
import type { BOM, InventoryItem, Organization } from "@/lib/schemas";

/**
 * Coverage name matching (Task 26.1; F6 / Req 11 "name normalization").
 *
 * Within a category, `buildCoverage` tries items in order of name similarity
 * to the BOM line's `item`, then by item id. Before the fix it used item-id
 * order only, so "P1000 pipette tips" was filled with Granite's inoculation
 * loops (`inv-gr-loops` sorts before `inv-tp-tips`).
 */

const NOW = "2026-10-24";

const org = {
  id: "org-liss",
  type: "college_club",
  name: "Latinos in STEM Society",
  school: "Commonwealth State University",
  city: "Boston",
  size: 25,
  mission: "A college club.",
  underResourced: true,
  ageYears: 18,
} as Organization;

function item(id: string, companyId: string, name: string, quantity: number): InventoryItem {
  return {
    id,
    companyId,
    name,
    category: "plasticware",
    quantity,
    unit: "unit",
    expiry: "2029-01-01",
    hazardClass: "none",
    hsSafe: true,
  } as InventoryItem;
}

const loops = item("inv-gr-loops", "co-granite", "Inoculation loops (disposable)", 2000);
const tips = item("inv-tp-tips", "co-tidepool", "P1000 pipette tips", 3200);

function bom(quantity: number): BOM {
  return {
    lines: [
      {
        id: "bom-tips",
        item: "P1000 pipette tips",
        category: "plasticware",
        quantity,
        unit: "unit",
        purpose: "liquid handling",
      },
    ],
  } as BOM;
}

describe("buildCoverage name matching (Task 26.1)", () => {
  it("fills a P1000 pipette tips line from inv-tp-tips, not inv-gr-loops", () => {
    const report = buildCoverage(bom(300), [loops, tips], org, NOW);
    expect(report.lines[0].status).toBe("covered");
    expect(report.lines[0].itemRefs).toEqual(["inv-tp-tips"]);
    expect(report.lines[0].supplyingCompanyId).toBe("co-tidepool");
  });

  it("still falls back to a same-category item with no name overlap once better matches run out", () => {
    // Needs more tips than inv-tp-tips holds, so the loops fill the remainder.
    const report = buildCoverage(bom(4000), [loops, tips], org, NOW);
    expect(report.lines[0].status).toBe("covered");
    expect(report.lines[0].itemRefs).toEqual(["inv-tp-tips", "inv-gr-loops"]);
  });

  it("returns an identical report across repeated calls and input orders", () => {
    const a = buildCoverage(bom(300), [loops, tips], org, NOW);
    const b = buildCoverage(bom(300), [tips, loops], org, NOW);
    const c = buildCoverage(bom(300), [loops, tips], org, NOW);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
});
