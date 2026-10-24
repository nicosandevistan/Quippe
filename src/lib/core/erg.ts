import { keywordOverlap } from "./matching";

/**
 * Deterministic ERG-event fit for Open Bench (Task 7.2; Req 7.5).
 *
 * This module lives in the PURE core per structure.md: no I/O, no randomness,
 * no `Date.now()`. It imports only the keyword-overlap primitive from its
 * sibling core module `./matching` (a core→core import, like `coverage.ts`
 * importing `./capacity`). It never imports from `lib/ai` or `lib/data`.
 *
 * `ergFit` scores how well an `erg_event` offer fits an ask using ONLY three
 * texts (Req 7.5):
 *   - the organization's own mission statement,
 *   - the ask text, and
 *   - the ERG description.
 *
 * No other input participates — in particular no student personal-identity
 * attribute exists in the model and none is read here (Req 7.6, 7.8, 17.5).
 * The score is a keyword overlap in [0, 1]: the organization's intent (its
 * mission plus the specific ask) is treated as one "demand" bag of keywords and
 * compared against the ERG description. Identical inputs always yield an
 * identical score.
 */

/**
 * Compute an ERG-event fit score in [0, 1] from mission, ask, and ERG text
 * ONLY (Req 7.5).
 *
 * The organization's mission and the ask text are concatenated into a single
 * demand text — together they express what the organization is looking for —
 * and compared against the ERG's description via {@link keywordOverlap} (the
 * overlap coefficient over normalized token sets). Using the overlap
 * coefficient (intersection ÷ smaller set) keeps a short, focused ERG
 * description from being unfairly penalized against a long mission statement.
 *
 * The function is pure and deterministic and reads no input other than the
 * three texts it is given.
 *
 * @param orgMission     the organization's own mission statement
 * @param askText        the ask text (e.g. topic / request wording)
 * @param ergDescription the ERG's description — the only company-side text used
 * @returns a fit score in the range 0.0 to 1.0 inclusive
 */
export function ergFit(
  orgMission: string,
  askText: string,
  ergDescription: string,
): number {
  // The organization's demand is its mission plus the concrete ask; the supply
  // side is the ERG description. Only these three texts contribute (Req 7.5).
  const demandText = `${orgMission} ${askText}`;
  return keywordOverlap(demandText, ergDescription);
}
