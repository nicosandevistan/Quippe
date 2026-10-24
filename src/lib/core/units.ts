import type { Unit } from "@/lib/schemas";

/**
 * Pure unit conversion for Open Bench (Req 11.5, 11.6; CP7).
 *
 * This module lives in the deterministic core: no I/O, no randomness, no clock.
 * It imports only the `Unit` type from the schema layer.
 *
 * Units fall into three dimensions:
 *   - volume: uL, mL, L
 *   - mass:   mg, g
 *   - count:  unit  (dimensionless / non-convertible)
 *
 * Conversion only makes sense within a single dimension. `convert` returns
 * `null` whenever the two units cannot be meaningfully related:
 *   - cross-dimension pairs (e.g. mL -> g)            -> null (Req 11.6)
 *   - any pair involving the countable `unit`          -> null (even unit -> unit)
 *
 * To keep round-trips tight (Property 7: round-trip within relative tolerance
 * 0.0001), every convertible unit is expressed as an exact integer count of a
 * canonical base unit for its dimension, and conversion is a single
 * multiply-then-divide through that base:
 *
 *     result = quantity * (factorFrom / factorTo)
 *
 * Exact factors (base = uL for volume, mg for mass):
 *   1 mL = 1000 uL,  1 L = 1000 mL = 1,000,000 uL
 *   1 g  = 1000 mg
 *
 * Because the factors are exact integers, same-unit conversions within a real
 * dimension (e.g. mL -> mL) return the quantity unchanged (factor ratio === 1).
 */

// Dimension tags. `unit` (count) is intentionally absent: it has no base and no
// factor, so it is never convertible.
type Dimension = "volume" | "mass";

// How many canonical base units one of each convertible unit represents.
//   volume base = uL
//   mass   base = mg
const FACTORS: Readonly<Record<Exclude<Unit, "unit">, number>> = {
  // volume (base: uL)
  uL: 1,
  mL: 1000,
  L: 1_000_000,
  // mass (base: mg)
  mg: 1,
  g: 1000,
};

// Which dimension each convertible unit belongs to.
const DIMENSIONS: Readonly<Record<Exclude<Unit, "unit">, Dimension>> = {
  uL: "volume",
  mL: "volume",
  L: "volume",
  mg: "mass",
  g: "mass",
};

// A convertible unit is any Unit other than the countable `unit`.
function isConvertible(u: Unit): u is Exclude<Unit, "unit"> {
  return u !== "unit";
}

/**
 * Convert `quantity` from one unit to another.
 *
 * Returns the converted amount when `from` and `to` share a dimension
 * (volume or mass). Returns `null` for cross-dimension pairs and for any pair
 * involving the non-convertible `unit`.
 *
 * @param quantity the amount expressed in `from` units
 * @param from     the source unit
 * @param to       the target unit
 * @returns the amount expressed in `to` units, or `null` if non-convertible
 */
export function convert(quantity: number, from: Unit, to: Unit): number | null {
  // Any pair touching the countable `unit` is non-convertible (Req 11.6),
  // including unit -> unit.
  if (!isConvertible(from) || !isConvertible(to)) {
    return null;
  }

  // Cross-dimension pairs (e.g. mL -> g) are non-convertible (Req 11.6).
  if (DIMENSIONS[from] !== DIMENSIONS[to]) {
    return null;
  }

  // Same dimension: scale through the canonical base. When from === to the
  // factor ratio is exactly 1, so the quantity is returned unchanged.
  return (quantity * FACTORS[from]) / FACTORS[to];
}
