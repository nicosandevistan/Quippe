/**
 * Referenced-ID scope validator for Quippe (Req 3.3, 12.2, 19.6; CP9).
 *
 * This module lives in the deterministic core: no I/O, no randomness, no clock.
 * It imports nothing — it compares plain string IDs.
 *
 * `validateReferencedIds(referenced, allowed)` returns `true` iff EVERY
 * referenced ID is present in the `allowed` set. This underpins Property 9
 * ("AI outputs reference only input IDs"): the AI wrapper calls it to reject any
 * handoff summary or adapted protocol that cites an identifier it was never
 * given, and returns the typed fallback instead.
 *
 * Inputs may be arrays or sets of string IDs on either side; IDs are compared
 * as plain strings (branded IDs are strings at runtime, so no namespace mixing
 * is possible with the raw values). An empty `referenced` collection vacuously
 * satisfies the check and returns `true`.
 *
 * Pure and deterministic: inputs are never mutated and the same inputs always
 * yield the same result.
 */
export function validateReferencedIds(
  referenced: Iterable<string>,
  allowed: Iterable<string>,
): boolean {
  // Normalize the allowed side into a Set for O(1) membership checks. If it is
  // already a Set we still build a fresh one so the input is never relied upon
  // to stay a particular type and is never mutated.
  const allowedSet = allowed instanceof Set ? allowed : new Set<string>(allowed);

  for (const id of referenced) {
    if (!allowedSet.has(id)) {
      return false;
    }
  }

  return true;
}
