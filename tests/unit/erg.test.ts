import { describe, it, expect } from "vitest";

import { ergFit } from "@/lib/core/erg";

/**
 * Unit tests for `ergFit` (src/lib/core/erg.ts; Task 7.2 / 7.4, Req 7.5).
 *
 * `ergFit` scores how well an `erg_event` offer fits an ask using ONLY three
 * texts — the organization's mission, the ask text, and the ERG description.
 * The treated "demand" is mission + ask; it is compared to the ERG description
 * via keyword overlap, yielding a score in [0, 1].
 *
 * These tests verify:
 *   - keyword overlap between (mission + ask) and ERG description drives the
 *     score: high overlap scores strictly higher than low overlap;
 *   - identical inputs are deterministic;
 *   - the score is always within [0, 1];
 *   - a shared-keyword case scores > 0 and a disjoint case scores exactly 0;
 *   - UNRELATED fields cannot influence the result because the function's
 *     signature accepts ONLY the three strings — there is no other input to
 *     perturb. The signature itself enforces the "mission/ask/ERG-only" rule.
 *
 * Requirements: 7.5.
 */

describe("ergFit — uses only mission, ask, and ERG-description text (Req 7.5)", () => {
  it("scores higher when (mission + ask) overlaps the ERG description more", () => {
    const mission = "advance accessible synthetic biology education for students";
    const ask = "we want a synthetic biology workshop on gene editing";

    // High-overlap ERG description shares many keywords with mission + ask.
    const highOverlapErg =
      "synthetic biology education workshop covering gene editing for students";
    // Low-overlap ERG description shares almost nothing.
    const lowOverlapErg = "quarterly finance and accounting networking mixer";

    const high = ergFit(mission, ask, highOverlapErg);
    const low = ergFit(mission, ask, lowOverlapErg);

    expect(high).toBeGreaterThan(low);
  });

  it("is deterministic: identical inputs yield an identical score", () => {
    const mission = "support women in STEM outreach";
    const ask = "seeking a STEM outreach speaker for an event";
    const erg = "women in STEM employee resource group running outreach events";

    const first = ergFit(mission, ask, erg);
    const second = ergFit(mission, ask, erg);

    expect(second).toBe(first);
  });

  it("always returns a score within [0, 1]", () => {
    const cases: Array<[string, string, string]> = [
      ["mission one", "ask one", "erg one"],
      [
        "advance accessible synthetic biology education",
        "synthetic biology workshop",
        "synthetic biology education workshop",
      ],
      ["alpha beta", "gamma delta", "epsilon zeta"],
      ["", "", ""],
      ["shared keyword here", "another shared keyword", "keyword shared"],
    ];
    for (const [mission, ask, erg] of cases) {
      const score = ergFit(mission, ask, erg);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("scores > 0 when the ERG description shares keywords with mission/ask", () => {
    const mission = "promote robotics and engineering clubs";
    const ask = "need mentors for a robotics competition";
    const erg = "robotics engineering mentorship group";

    expect(ergFit(mission, ask, erg)).toBeGreaterThan(0);
  });

  it("scores exactly 0 when the ERG description is keyword-disjoint", () => {
    // No shared token (length >= 2) across the two sides.
    const mission = "biology chemistry physics";
    const ask = "genomics proteomics";
    const erg = "accounting marketing logistics";

    expect(ergFit(mission, ask, erg)).toBe(0);
  });

  it("depends only on the three text inputs (signature enforces no other field)", () => {
    // The function accepts exactly (orgMission, askText, ergDescription). There
    // is no fourth parameter — no org id, no student identity, no company field
    // — so no "unrelated field" exists to change. We document that invariant by
    // showing that two calls whose ONLY differences are in those three texts
    // are what move the score, and that holding the three texts fixed pins the
    // result (already covered by the determinism test). Here we additionally
    // confirm that varying the mission text alone changes the computed overlap,
    // proving the mission text genuinely participates.
    const ask = "robotics competition mentoring";
    const erg = "robotics engineering mentorship group";

    const relevantMission = "promote robotics and engineering mentoring";
    const irrelevantMission = "quarterly bake sale fundraiser logistics";

    const scoreRelevant = ergFit(relevantMission, ask, erg);
    const scoreIrrelevant = ergFit(irrelevantMission, ask, erg);

    // A mission that overlaps the ERG description raises the score relative to
    // one that does not — confirming the mission text is actually read.
    expect(scoreRelevant).toBeGreaterThan(scoreIrrelevant);
  });
});
