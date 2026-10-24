/**
 * Visual-refresh tests for the supplies page (docs/design/supplies.html; see
 * .kiro/steering/design.md). These cover the parts the mockup adds on top of
 * the existing flow:
 *   - the coverage bar: one segment per item, coloured by status, with a text
 *     alternative;
 *   - the "Covered by" column: company initials badges;
 *   - amber (needed / needed-bg) rows for missing items.
 *
 * Rendered to static HTML (`renderToStaticMarkup`, node environment, no new
 * deps). These assert data→markup mapping and accessibility, not pixels, and
 * use only data the page already has (coverage rows + the company-name map).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BOM, CoverageReport } from "@/lib/schemas";
import { coverageRows } from "@/app/supplies/supplies-api";
import {
  barSegments,
  companyInitials,
  companyShortName,
} from "@/app/supplies/supplies-display";
import { CoverageBar, CoverageTable } from "@/app/supplies/SuppliesViews";

type LineId = BOM["lines"][number]["id"];
type CovLine = CoverageReport["lines"][number];

/** Four lines across two suppliers plus a missing one, like the mockup. */
const BOM_FIXTURE: BOM = {
  lines: [
    {
      id: "bom-a" as LineId,
      item: "Microcentrifuge tubes, 1.5 mL",
      category: "consumable",
      quantity: 50,
      unit: "unit",
      purpose: "sample tubes",
    },
    {
      id: "bom-b" as LineId,
      item: "Agarose",
      category: "reagent",
      quantity: 10,
      unit: "g",
      purpose: "cast gels",
    },
    {
      id: "bom-c" as LineId,
      item: "DNA ladder and loading dye",
      category: "reagent",
      quantity: 1,
      unit: "unit",
      purpose: "size reference",
    },
    {
      id: "bom-d" as LineId,
      item: "Isopropyl alcohol, 91%",
      category: "reagent",
      quantity: 500,
      unit: "mL",
      purpose: "precipitate DNA",
    },
  ],
};
const COVERAGE_FIXTURE: CoverageReport = {
  runDate: "2027-01-01",
  lines: [
    {
      bomLineId: "bom-a" as CovLine["bomLineId"],
      status: "covered",
      needed: 50,
      allocated: 50,
      supplyingCompanyId: "co-harborview" as CovLine["supplyingCompanyId"],
      itemRefs: ["inv-hv-tubes" as CovLine["itemRefs"][number]],
    },
    {
      bomLineId: "bom-b" as CovLine["bomLineId"],
      status: "covered",
      needed: 10,
      allocated: 10,
      supplyingCompanyId: "co-harborview" as CovLine["supplyingCompanyId"],
      itemRefs: ["inv-hv-agarose" as CovLine["itemRefs"][number]],
    },
    {
      bomLineId: "bom-c" as CovLine["bomLineId"],
      status: "covered",
      needed: 1,
      allocated: 1,
      supplyingCompanyId: "co-tidepool" as CovLine["supplyingCompanyId"],
      itemRefs: ["inv-tp-ladder" as CovLine["itemRefs"][number]],
    },
    {
      bomLineId: "bom-d" as CovLine["bomLineId"],
      status: "missing",
      needed: 500,
      allocated: 0,
      itemRefs: [],
    },
  ],
};
const NAMES = {
  "co-harborview": "Harborview Therapeutics",
  "co-tidepool": "Tidepool Biosciences",
};

const ROWS = coverageRows(BOM_FIXTURE, COVERAGE_FIXTURE, NAMES);

describe("companyInitials", () => {
  it("takes the first letters of the first two words, uppercased", () => {
    expect(companyInitials("Harborview Therapeutics")).toBe("HT");
    expect(companyInitials("Tidepool Biosciences")).toBe("TB");
  });
  it("handles a single word and blank input", () => {
    expect(companyInitials("Harborview")).toBe("HA");
    expect(companyInitials("   ")).toBe("?");
  });
});

describe("companyShortName", () => {
  it("shows the first word of a multi-word name", () => {
    expect(companyShortName("Harborview Therapeutics")).toBe("Harborview");
    expect(companyShortName("Tidepool Biosciences")).toBe("Tidepool");
  });
});

describe("barSegments", () => {
  it("produces exactly one segment per coverage row, in order", () => {
    const segments = barSegments(ROWS);
    expect(segments).toHaveLength(ROWS.length);
    expect(segments.map((s) => s.bomLineId)).toEqual(
      ROWS.map((r) => r.bomLineId),
    );
    expect(segments.map((s) => s.status)).toEqual([
      "covered",
      "covered",
      "covered",
      "missing",
    ]);
  });
  it("tints distinct suppliers in appearance order and leaves missing untinted", () => {
    const segments = barSegments(ROWS);
    // First supplier (Harborview) dark, next supplier (Tidepool) grey.
    expect(segments[0]!.tint).toBe("ink");
    expect(segments[1]!.tint).toBe("ink");
    expect(segments[2]!.tint).toBe("muted");
    expect(segments[3]!.tint).toBeUndefined();
  });
});

describe("CoverageBar", () => {
  it("renders one segment per item with a text alternative", () => {
    const summary = "3 of 4 items covered, 0 partly covered, 1 missing.";
    const html = renderToStaticMarkup(
      <CoverageBar rows={ROWS} summary={summary} />,
    );
    // role=img with a label summarising counts: a screen reader hears the
    // numbers, not ten decorative segments.
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${summary}"`);
    // One <span> segment per row.
    const segmentCount = (html.match(/<span[^>]*class="h-2/g) ?? []).length;
    expect(segmentCount).toBe(ROWS.length);
    // Status carries the colour: filled for covered, amber ring for missing.
    expect(html).toContain("bg-ink");
    expect(html).toContain("bg-muted");
    expect(html).toContain("ring-needed");
  });
});

describe("CoverageTable (visual refresh)", () => {
  const html = renderToStaticMarkup(<CoverageTable rows={ROWS} />);
  it("shows company initials badges in the Covered by column", () => {
    expect(html).toContain(">HT<");
    expect(html).toContain(">TB<");
    expect(html).toContain("Harborview");
    expect(html).toContain("Tidepool");
  });
  it("gives missing items the amber needed-bg row and needed text", () => {
    // The missing row gets the warm needed-bg background.
    expect(html).toContain("bg-needed-bg");
    // and names the status in amber text, never colour alone.
    expect(html).toContain("text-needed");
    expect(html).toContain("Still needed");
  });
  it("uses sentence-case, token colours, and no middle-dot separators", () => {
    expect(html).not.toContain("·");
    // Covered rows are not painted amber.
    const coveredRowCount = (html.match(/class="align-top "/g) ?? []).length;
    expect(coveredRowCount).toBe(3);
  });
});
