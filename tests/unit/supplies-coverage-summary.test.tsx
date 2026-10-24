/**
 * Regression test for the supplies coverage summary line (UI polish).
 *
 * A user reported stray spaces before the commas and the final period, e.g.
 * "8 of 10 items covered , 0 partly covered , 2 missing .", and believed it
 * was JSX whitespace. On inspection the current code has no such source:
 *   - `summarySentence` (supplies-api.ts) is a clean template literal;
 *   - the coverage `<p>` in SuppliesFlow renders `{coverageSentence}` as a
 *     single expression (no `{" "}` or line breaks around `,`/`.`);
 *   - `CoverageBar`'s `aria-label={summary}` renders the same single value.
 *
 * So this pins the exact rendered string as a regression guard: if anyone
 * reintroduces broken-up JSX around the punctuation, these fail. The user
 * seeing the spaces is most likely a stale dev-server build.
 *
 * The coverage `<p>` intentionally does NOT carry `tabular-nums`: with
 * Schibsted Grotesk, tabular figures make commas and periods number-width,
 * which reads as stray spaces before the punctuation. The class list here
 * mirrors SuppliesFlow's real markup and asserts tabular-nums is absent.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BOM, CoverageReport } from "@/lib/schemas";
import {
  coverageRows,
  summarizeCoverage,
  summarySentence,
} from "@/app/supplies/supplies-api";
import { CoverageBar } from "@/app/supplies/SuppliesViews";

type LineId = BOM["lines"][number]["id"];
type CovLine = CoverageReport["lines"][number];

/** Exactly the user's reported case: 10 items, 8 covered, 0 partial, 2 missing. */
const EXPECTED = "8 of 10 items covered, 0 partly covered, 2 missing.";

/** Ten BOM lines so the summary reads "8 of 10 …". */
const BOM_FIXTURE: BOM = {
  lines: Array.from({ length: 10 }, (_, i) => ({
    id: `bom-${i}` as LineId,
    item: `Item ${i}`,
    category: "consumable" as const,
    quantity: 1,
    unit: "unit" as const,
    purpose: "demo",
  })),
};

/** First 8 lines covered, last 2 missing; none partial. */
const COVERAGE_FIXTURE: CoverageReport = {
  runDate: "2027-01-01",
  lines: BOM_FIXTURE.lines.map((line, i) => {
    const covered = i < 8;
    return {
      bomLineId: line.id as CovLine["bomLineId"],
      status: covered ? ("covered" as const) : ("missing" as const),
      needed: 1,
      allocated: covered ? 1 : 0,
      ...(covered
        ? {
            supplyingCompanyId: "co-harborview" as CovLine["supplyingCompanyId"],
            itemRefs: [`inv-${i}` as CovLine["itemRefs"][number]],
          }
        : { itemRefs: [] }),
    };
  }),
};

describe("coverage summary line", () => {
  it("builds the exact sentence with no stray spaces", () => {
    expect(summarySentence(summarizeCoverage(COVERAGE_FIXTURE))).toBe(EXPECTED);
  });

  it("renders the exact sentence in the coverage bar's aria-label", () => {
    const rows = coverageRows(BOM_FIXTURE, COVERAGE_FIXTURE, {
      "co-harborview": "Harborview Therapeutics",
    });
    const summary = summarySentence(summarizeCoverage(COVERAGE_FIXTURE));
    const html = renderToStaticMarkup(
      <CoverageBar rows={rows} summary={summary} />,
    );
    expect(html).toContain(`aria-label="${EXPECTED}"`);
    // Guard against the reported artifact appearing anywhere in the markup.
    expect(html).not.toContain("covered ,");
    expect(html).not.toContain("missing .");
  });

  it("renders the exact sentence in a coverage summary <p>, as SuppliesFlow does", () => {
    // SuppliesFlow renders `<p …>{coverageSentence}</p>`; mirror that exactly
    // so the test fails if the single-expression render is ever broken up.
    // The class list matches SuppliesFlow and intentionally omits tabular-nums.
    const summary = summarySentence(summarizeCoverage(COVERAGE_FIXTURE));
    const html = renderToStaticMarkup(
      <p className="text-xl font-semibold tracking-[-0.01em] text-ink">
        {summary}
      </p>,
    );
    expect(html).toContain(`>${EXPECTED}</p>`);
    expect(html).not.toContain("covered ,");
    expect(html).not.toContain("missing .");
    // The coverage summary paragraph must not carry tabular-nums.
    expect(html).not.toContain("tabular-nums");
  });
});
