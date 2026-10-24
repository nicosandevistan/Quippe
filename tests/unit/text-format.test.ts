/**
 * Unit tests for the presentation-only text helpers in
 * `src/components/text-format.ts` (UI polish: match reasons + ask-title
 * casing). These are pure string functions, so no rendering is needed.
 */
import { describe, expect, it } from "vitest";
import { formatReasons, sentenceCase } from "@/components/text-format";

describe("sentenceCase", () => {
  it("capitalizes the first letter of a lowercase string", () => {
    expect(sentenceCase("pcr basics")).toBe("Pcr basics");
  });
  it("leaves an already-capitalized string unchanged", () => {
    expect(sentenceCase("PCR basics")).toBe("PCR basics");
  });
  it("only touches the first letter, leaving the rest exactly as typed", () => {
    expect(sentenceCase("careers in bioTech")).toBe("Careers in bioTech");
  });
  it("returns an empty string unchanged", () => {
    expect(sentenceCase("")).toBe("");
  });
  it("trims leading whitespace before capitalizing", () => {
    expect(sentenceCase("  pcr basics")).toBe("Pcr basics");
  });
  it("leaves a non-letter first character unchanged", () => {
    expect(sentenceCase("3D printing")).toBe("3D printing");
    expect(sentenceCase("“quoted” topic")).toBe("“quoted” topic");
  });
  it("returns an empty string for whitespace-only input", () => {
    expect(sentenceCase("   ")).toBe("");
  });
});

describe("formatReasons", () => {
  it("capitalizes a lowercase reason and ends it with a period", () => {
    expect(formatReasons(["same topic area"])).toBe("Same topic area.");
  });
  it("leaves an already-capitalized reason capitalized", () => {
    expect(formatReasons(["Same topic area"])).toBe("Same topic area.");
  });
  it("does not add a period when the reason already ends with one", () => {
    expect(formatReasons(["Dates line up."])).toBe("Dates line up.");
  });
  it("respects '!' and '?' as sentence endings", () => {
    expect(formatReasons(["great fit!", "why not?"])).toBe(
      "Great fit! Why not?",
    );
  });
  it("trims trailing and leading spaces around a reason", () => {
    expect(formatReasons(["  near the campus  "])).toBe("Near the campus.");
  });
  it("skips empty and whitespace-only reasons", () => {
    expect(formatReasons(["", "  ", "within range"])).toBe("Within range.");
  });
  it("returns an empty string when there are no usable reasons", () => {
    expect(formatReasons([])).toBe("");
    expect(formatReasons(["", "   "])).toBe("");
  });
  it("joins multiple reasons as sentences with a single space", () => {
    expect(
      formatReasons(["same topic area", "dates line up", "In the right unit"]),
    ).toBe("Same topic area. Dates line up. In the right unit.");
  });
});
