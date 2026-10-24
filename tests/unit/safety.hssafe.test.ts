import { describe, it, expect } from "vitest";

import {
  computeHsSafe,
  DEFAULT_HAZARDOUS_KEYWORDS,
  type HsSafeInput,
} from "@/lib/core/safety";

/**
 * Unit tests for the deterministic `computeHsSafe` rule edges (Task 4.4).
 *
 * `computeHsSafe(item, aiSuggestedHsSafe, keywords?)` is authoritative over any
 * AI suggestion. It returns `true` ONLY when the hazard class is exactly
 * `none`, no configured hazardous keyword matches the item's text, AND the AI
 * suggestion agrees (true). It collapses to `false` on any non-none/unknown
 * hazard class, a keyword hit, or AI/rule disagreement.
 *
 * Items are plain structural objects (no zod parsing) matching `HsSafeInput`.
 * Deterministic: no network, no randomness, no Date.now().
 *
 * Requirements: 14.2, 14.3.
 */

// A benign baseline the rule would classify as safe (none class, no keyword).
const benignItem: HsSafeInput = {
  hazardClass: "none",
  name: "Agarose",
  category: "reagent",
  notes: "Standard gel electrophoresis reagent.",
};

// --- Positive control: rule-safe AND AI agrees ⇒ true --------------------

describe("computeHsSafe positive control (Req 14.2)", () => {
  it("returns true for a none-class, benign item when AI agrees (true)", () => {
    expect(computeHsSafe(benignItem, true)).toBe(true);
  });
});

// --- AI/rule disagreement collapses to false (Req 14.2) ------------------

describe("computeHsSafe AI/rule disagreement (Req 14.2)", () => {
  it("collapses to false when the rule says safe but the AI suggests unsafe (false)", () => {
    // Rule result is safe (none class, no keyword) but AI disagrees ⇒ false.
    expect(computeHsSafe(benignItem, false)).toBe(false);
  });

  it("stays false when the rule says unsafe even if the AI suggests safe (true)", () => {
    // Rule result is unsafe (toxic class); AI can never make it safe ⇒ false.
    const unsafeItem: HsSafeInput = { ...benignItem, hazardClass: "toxic" };
    expect(computeHsSafe(unsafeItem, true)).toBe(false);
  });
});

// --- Missing/unknown hazard class ⇒ false (Req 14.3) ---------------------

describe("computeHsSafe unknown/missing hazard class (Req 14.3)", () => {
  it("returns false for hazardClass 'unknown' even with AI true and a benign name", () => {
    const unknownItem: HsSafeInput = { ...benignItem, hazardClass: "unknown" };
    expect(computeHsSafe(unknownItem, true)).toBe(false);
  });

  it("returns false for a missing hazard class even with AI true and a benign name", () => {
    // A row missing its hazard class (structurally undefined) must collapse to
    // false just like an explicit 'unknown' class (Req 14.3).
    const missing = {
      name: "Agarose",
      category: "reagent",
      notes: "No hazard class supplied.",
    } as unknown as HsSafeInput;
    expect(computeHsSafe(missing, true)).toBe(false);
  });
});

// --- Keyword hit forces false (Req 14.2 keyword override) ----------------

describe("computeHsSafe keyword hit overrides a none class (Req 14.2)", () => {
  it("returns false when the name contains a hazardous keyword despite class none and AI true", () => {
    // "Ethidium Bromide" matches the configured keyword list even though the
    // hazard class is mislabeled 'none' and the AI suggested safe.
    const mislabeled: HsSafeInput = {
      hazardClass: "none",
      name: "Ethidium Bromide",
      category: "stain",
      notes: "Mislabeled as safe.",
    };
    expect(computeHsSafe(mislabeled, true)).toBe(false);
  });

  it("matches a hazardous keyword case-insensitively in the notes field", () => {
    const hiddenInNotes: HsSafeInput = {
      hazardClass: "none",
      name: "Unlabeled bottle",
      category: "reagent",
      notes: "Contains PHENOL per the old label.",
    };
    expect(computeHsSafe(hiddenInNotes, true)).toBe(false);
  });
});

// --- Non-none hazard class ⇒ false regardless of AI suggestion -----------

describe("computeHsSafe non-none hazard class (Req 14.3)", () => {
  it("returns false for a 'corrosive' class regardless of the AI suggestion", () => {
    const corrosive: HsSafeInput = { ...benignItem, hazardClass: "corrosive" };
    expect(computeHsSafe(corrosive, true)).toBe(false);
    expect(computeHsSafe(corrosive, false)).toBe(false);
  });

  it("returns false for a 'toxic' class regardless of the AI suggestion", () => {
    const toxic: HsSafeInput = { ...benignItem, hazardClass: "toxic" };
    expect(computeHsSafe(toxic, true)).toBe(false);
    expect(computeHsSafe(toxic, false)).toBe(false);
  });
});

// --- Sanity: the keyword list is populated and lower-cased ---------------

describe("DEFAULT_HAZARDOUS_KEYWORDS", () => {
  it("is non-empty and includes the ethidium bromide entry", () => {
    expect(DEFAULT_HAZARDOUS_KEYWORDS.length).toBeGreaterThan(0);
    expect(DEFAULT_HAZARDOUS_KEYWORDS).toContain("ethidium bromide");
  });
});
