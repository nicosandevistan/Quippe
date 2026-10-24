/**
 * Fit label for a 0..1 match score on the company dashboard, matching
 * docs/design/company-dashboard.html (see .kiro/steering/design.md).
 *
 * The mockup shows a three-bar meter next to a word: "Strong", "Good", or
 * "Fair". This is the single source of that mapping so the label, the number
 * of lit bars, and the screen-reader text can never drift apart. It is a pure
 * function of the score and makes no safety, eligibility, or matching
 * decision — the score it reads is already decided by the matching engine.
 *
 * Thresholds (inclusive lower bound):
 *   score >= 0.75  -> "Strong"  (3 bars)
 *   score >= 0.5   -> "Good"    (2 bars)
 *   else           -> "Fair"    (1 bar)
 */
export type FitLabel = "Strong" | "Good" | "Fair";

/** The word for a 0..1 score: Strong (>= 0.75), Good (>= 0.5), else Fair. */
export function fitLabel(score: number): FitLabel {
  if (score >= 0.75) return "Strong";
  if (score >= 0.5) return "Good";
  return "Fair";
}

/** How many of the three meter bars are lit for a score: 3 / 2 / 1. */
export function fitBars(score: number): 1 | 2 | 3 {
  const label = fitLabel(score);
  return label === "Strong" ? 3 : label === "Good" ? 2 : 1;
}

/** "Strong fit" / "Good fit" / "Fair fit", as the mockup displays it. */
export function fitPhrase(score: number): string {
  return `${fitLabel(score)} fit`;
}
