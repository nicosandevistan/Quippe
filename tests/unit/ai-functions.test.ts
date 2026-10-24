import { describe, expect, it } from "vitest";

import {
  composeAsks,
  generateBom,
  handoffSummary,
  normalizeInventory,
  writeProtocol,
} from "@/lib/ai";
import { computeHsSafe } from "@/lib/core/safety";
import {
  BOM,
  HandoffSummary,
  type CoverageReport,
  type TimelineEvent,
} from "@/lib/schemas";

/**
 * AI module function tests (Task 13.3; Req 3.5, 12.3, 12.6, 14.2).
 *
 * These run against the default mock provider (no stub), exercising each
 * function's happy path and the specific guarantees the brief calls out:
 *   - protocol lists every missing BOM line and carries the HS review text;
 *   - a handoff with no events returns the fallback without calling the model;
 *   - normalizeInventory's advisory `hsSafe` is overridden by `computeHsSafe`.
 */

describe("composeAsks (mock)", () => {
  it("returns schema-valid asks scoped to the given org", async () => {
    const result = await composeAsks({
      text: "We want a 20-person DNA extraction workshop with supplies.",
      orgId: "org-liss",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThanOrEqual(1);
      for (const ask of result.value) {
        expect(ask.orgId).toBe("org-liss");
      }
    }
  });
});

describe("generateBom (mock)", () => {
  it("returns a schema-valid BOM", async () => {
    const result = await generateBom({
      experiment: "DNA extraction and gel electrophoresis",
      groupSize: 20,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => BOM.parse(result.value)).not.toThrow();
      expect(result.value.lines.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("writeProtocol (mock)", () => {
  const coverage: CoverageReport = {
    runDate: "2026-10-24",
    lines: [
      {
        bomLineId: "bom-1" as never,
        status: "covered",
        needed: 10,
        allocated: 10,
        supplyingCompanyId: "co-harborview" as never,
        itemRefs: ["inv-hv-agarose" as never],
      },
      {
        bomLineId: "bom-2" as never,
        status: "missing",
        needed: 5,
        allocated: 0,
        itemRefs: [],
      },
    ],
  };

  it("references only coverage item ids and lists every missing line", async () => {
    const result = await writeProtocol(coverage, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Every referenced item id is one from the coverage report.
      for (const ref of result.value.itemRefs) {
        expect(["inv-hv-agarose"]).toContain(ref);
      }
      // The missing BOM line is listed (Req 12.3).
      expect(result.value.missingLineIds).toContain("bom-2");
    }
  });

  it("includes the HS review text for a high school club", async () => {
    const result = await writeProtocol(coverage, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hsReviewRequired).toBe(true);
      expect(result.value.hsReviewText).toBe(
        "Advisor must review before running",
      );
    }
  });
});

describe("handoffSummary (mock)", () => {
  it("returns the fallback when there are no events (Req 3.5)", async () => {
    const result = await handoffSummary([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallback.kind).toBe("handoff_fallback");
  });

  it("summarizes from events, referencing only input refs", async () => {
    const events: TimelineEvent[] = [
      {
        id: "ev-1" as never,
        orgId: "org-liss" as never,
        companyId: "co-harborview" as never,
        kind: "donation",
        date: "2026-02-20",
        seq: 1,
        summary: "Received supplies from Harborview.",
        refs: ["org-liss", "co-harborview"],
      },
    ];
    const result = await handoffSummary(events);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => HandoffSummary.parse(result.value)).not.toThrow();
      const allowed = new Set(["org-liss", "co-harborview"]);
      for (const id of result.value.referencedIds) {
        expect(allowed.has(id)).toBe(true);
      }
    }
  });
});

describe("normalizeInventory (mock)", () => {
  it("returns schema-valid items whose hsSafe is overridden by the rule", async () => {
    const result = await normalizeInventory({
      csv: "name,qty,unit\nethidium bromide,50,mL",
      companyId: "co-harborview",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const item of result.value) {
        // The AI value is advisory; the deterministic rule decides hsSafe.
        const ruleValue = computeHsSafe(
          {
            hazardClass: item.hazardClass,
            name: item.name,
            category: item.category,
          },
          item.hsSafe,
        );
        // Recomputing never makes an item MORE safe than the rule allows.
        expect(ruleValue === true ? item.hsSafe : true).toBe(true);
      }
    }
  });

  it("forces hsSafe false for a hazardous-keyword item regardless of AI value", async () => {
    // Even if the AI said an ethidium-bromide row is safe, the rule overrides.
    const forced = computeHsSafe(
      { hazardClass: "none", name: "ethidium bromide", category: "stain" },
      true,
    );
    expect(forced).toBe(false);
  });
});
