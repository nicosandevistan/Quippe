import { describe, it } from "vitest";
import fc from "fast-check";

import { convert } from "@/lib/core/units";
import type { Unit } from "@/lib/schemas";

/**
 * Property 7: unit conversions round-trip within tolerance (Task 3.2).
 *
 * Validates: Requirements 11.5
 *
 * Exercises the pure `convert(quantity, from, to): number | null` from
 * `src/lib/core/units.ts`. No I/O, no randomness beyond fast-check's
 * generators, no clock.
 *
 * Two guarantees:
 *   1. Same-dimension round-trip. For every positive finite quantity q and
 *      every SAME-DIMENSION unit pair (both volume, or both mass — the
 *      countable `unit` excluded), converting q from A→B and back B→A returns
 *      q within RELATIVE tolerance 0.0001:
 *          |back - q| <= 0.0001 * |q|
 *      Neither leg may return the non-convertible signal `null`.
 *   2. Non-convertible pairs. For every CROSS-DIMENSION pair (one volume unit
 *      and one mass unit) and for ANY pair involving the countable `unit`,
 *      `convert` returns `null`.
 */

// --- Unit groups by dimension --------------------------------------------

const VOLUME_UNITS = ["uL", "mL", "L"] as const;
const MASS_UNITS = ["mg", "g"] as const;
const COUNT_UNIT = "unit" as const;

// --- Arbitraries ----------------------------------------------------------

// Positive, finite quantities. Bounded away from 0 (min 1e-6) and below 1e9 so
// the relative tolerance stays meaningful and float math does not degenerate.
const positiveQuantity = fc.double({
  min: 1e-6,
  max: 1e9,
  noNaN: true,
  noDefaultInfinity: true,
});

// A same-dimension unit pair: both volume OR both mass (order arbitrary, and
// A === B is allowed). The countable `unit` is never included.
const sameDimensionPair = fc.oneof(
  fc.tuple(fc.constantFrom(...VOLUME_UNITS), fc.constantFrom(...VOLUME_UNITS)),
  fc.tuple(fc.constantFrom(...MASS_UNITS), fc.constantFrom(...MASS_UNITS)),
) as fc.Arbitrary<[Unit, Unit]>;

// A cross-dimension pair: one volume unit paired with one mass unit, in either
// order. Always non-convertible.
const crossDimensionPair = fc.oneof(
  fc.tuple(fc.constantFrom(...VOLUME_UNITS), fc.constantFrom(...MASS_UNITS)),
  fc.tuple(fc.constantFrom(...MASS_UNITS), fc.constantFrom(...VOLUME_UNITS)),
) as fc.Arbitrary<[Unit, Unit]>;

// Any pair that touches the countable `unit`: unit→X, X→unit, unit→unit, where
// X ranges over every unit. Always non-convertible.
const anyUnit = fc.constantFrom<Unit>(...VOLUME_UNITS, ...MASS_UNITS, COUNT_UNIT);
const unitInvolvedPair = fc.oneof(
  fc.tuple(fc.constant<Unit>(COUNT_UNIT), anyUnit),
  fc.tuple(anyUnit, fc.constant<Unit>(COUNT_UNIT)),
) as fc.Arbitrary<[Unit, Unit]>;

const RELATIVE_TOLERANCE = 0.0001;
const NUM_RUNS = 200;

describe("Property 7 (prop07): unit conversions round-trip within tolerance", () => {
  it("round-trips same-dimension conversions within relative tolerance 0.0001", () => {
    fc.assert(
      fc.property(positiveQuantity, sameDimensionPair, (q, [from, to]) => {
        const forward = convert(q, from, to);
        // Same-dimension convertible pairs never signal non-convertible.
        if (forward === null) {
          throw new Error(
            `convert(${q}, ${from}, ${to}) returned null for a same-dimension pair`,
          );
        }

        const back = convert(forward, to, from);
        if (back === null) {
          throw new Error(
            `convert(${forward}, ${to}, ${from}) returned null for a same-dimension pair`,
          );
        }

        // q is guaranteed non-zero (min 1e-6), so relative tolerance is safe.
        const withinTolerance = Math.abs(back - q) <= RELATIVE_TOLERANCE * Math.abs(q);
        if (!withinTolerance) {
          throw new Error(
            `round-trip ${from}->${to}->${from} of ${q} produced ${back} ` +
              `(|${back} - ${q}| = ${Math.abs(back - q)} > ${RELATIVE_TOLERANCE * Math.abs(q)})`,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the non-convertible signal (null) for cross-dimension pairs", () => {
    fc.assert(
      fc.property(positiveQuantity, crossDimensionPair, (q, [from, to]) => {
        const result = convert(q, from, to);
        if (result !== null) {
          throw new Error(
            `convert(${q}, ${from}, ${to}) returned ${result}; expected null for a cross-dimension pair`,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns the non-convertible signal (null) for any pair involving `unit`", () => {
    fc.assert(
      fc.property(positiveQuantity, unitInvolvedPair, (q, [from, to]) => {
        const result = convert(q, from, to);
        if (result !== null) {
          throw new Error(
            `convert(${q}, ${from}, ${to}) returned ${result}; expected null for a pair involving \`unit\``,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
