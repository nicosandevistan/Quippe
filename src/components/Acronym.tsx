/**
 * Explain an acronym on first use (Task 22.1; product.md principle 5,
 * design.md accessibility cross-cut).
 *
 * Renders the acronym with its expansion attached two ways:
 * - visually as a parenthetical the FIRST time it appears, and
 * - always via the native `<abbr title>` tooltip, which assistive tech reads.
 *
 * "First use" is tracked per expansion within a single render pass using a
 * module-level set keyed by the acronym text. Because a server component
 * renders top-to-bottom once per request, the first `<Acronym>` for a given
 * term shows the parenthetical and later ones show just the term with the
 * tooltip. Call `resetAcronyms()` at the top of a page if you want the
 * parenthetical to re-appear per page.
 */

const seen = new Set<string>();

/** Reset first-use tracking (call at the top of a page render). */
export function resetAcronyms(): void {
  seen.clear();
}

export interface AcronymProps {
  /** The acronym itself, e.g. "BOM". */
  term: string;
  /** The plain-language expansion, e.g. "bill of materials". */
  expansion: string;
}

export function Acronym({ term, expansion }: AcronymProps) {
  const isFirst = !seen.has(term);
  if (isFirst) seen.add(term);

  return (
    <abbr title={expansion} className="cursor-help underline decoration-dotted">
      {term}
      {isFirst ? (
        <span className="font-normal text-gray-600"> ({expansion})</span>
      ) : null}
    </abbr>
  );
}
