/**
 * Small, pure presentation-only text helpers for the UI. These live outside
 * `src/lib` on purpose: they format text for display and make no business,
 * safety, or eligibility decisions, and they are never sent to the API.
 *
 * No React, no I/O — just string in, string out — so they are trivial to unit
 * test.
 */

/** True when the character ends a sentence already (".", "!" or "?"). */
function endsSentence(text: string): boolean {
  const last = text[text.length - 1];
  return last === "." || last === "!" || last === "?";
}

/**
 * Capitalize the first letter of a string, leaving the rest exactly as given.
 * A string whose first character is not a letter (or an empty string) is
 * returned unchanged. Leading whitespace is trimmed first so the first visible
 * character is the one capitalized.
 */
export function sentenceCase(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed === "") return trimmed;
  return trimmed[0]!.toUpperCase() + trimmed.slice(1);
}

/**
 * Render a list of free-text match reasons as readable sentences: each reason
 * is trimmed, its first letter capitalized, and a period added unless it
 * already ends with ".", "!" or "?". Empty reasons (after trimming) are
 * skipped. The results are joined with a single space.
 */
export function formatReasons(reasons: string[]): string {
  return reasons
    .map((reason) => reason.trim())
    .filter((reason) => reason !== "")
    .map((reason) => {
      const cased = sentenceCase(reason);
      return endsSentence(cased) ? cased : `${cased}.`;
    })
    .join(" ");
}
