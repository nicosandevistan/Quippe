import { describe, it } from "vitest";
import fc from "fast-check";

import { allocate } from "@/lib/core/capacity";

/**
 * Property 4: allocated inventory quantity never exceeds available (Task 5.3).
 *
 * Validates: Requirements 18.2
 *
 * Exercises the pure `allocate(available: number, demands: number[]): number[]`
 * from `src/lib/core/capacity.ts`. No I/O, no randomness beyond fast-check's
 * generators, no clock.
 *
 * For every non-negative `available` quantity and every sequence of
 * non-negative `demands`, `allocate(available, demands)`:
 *   1. returns an array the SAME length as `demands`;
 *   2. whose SUM is ≤ `available` (within a tiny float epsilon); and
 *   3. where each allocation is ≥ 0 and ≤ its corresponding demand.
 */

// --- Arbitraries ----------------------------------------------------------

// Non-negative, finite available quantities. A mix of integers and doubles is
// achieved by drawing doubles in [0, 1e6]; fast-check shrinks toward 0.
const available = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

// A single non-negative, finite demand.
const demand = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

// A demand sequence: 0..50 non-negative demands. Empty arrays are included so
// the same-length guarantee is exercised at the boundary.
const demands = fc.array(demand, { minLength: 0, maxLength: 50 });

// Summing doubles accumulates rounding error. Scale a tiny epsilon by the
// magnitudes involved so the ≤-available check stays meaningful without
// weakening the property for exact (integer-like) inputs.
const EPSILON = 1e-9;
const NUM_RUNS = 200;

describe("Property 4 (prop04): allocated inventory quantity never exceeds available", () => {
  it("allocates same-length, per-demand-bounded quantities summing ≤ available", () => {
    fc.assert(
      fc.property(available, demands, (avail, ds) => {
        const result = allocate(avail, ds);

        // 1. Same length as demands.
        if (result.length !== ds.length) {
          throw new Error(
            `allocate(${avail}, [${ds}]) returned length ${result.length}; expected ${ds.length}`,
          );
        }

        // 3. Each allocation is ≥ 0 and ≤ its corresponding demand.
        let sum = 0;
        let demandTotal = 0;
        for (let i = 0; i < result.length; i++) {
          const given = result[i];
          const want = ds[i];
          if (given < 0) {
            throw new Error(
              `allocation[${i}] = ${given} is negative for demand ${want}`,
            );
          }
          // Allow a tiny epsilon scaled by the demand magnitude for float math.
          if (given > want + EPSILON * (1 + Math.abs(want))) {
            throw new Error(
              `allocation[${i}] = ${given} exceeds its demand ${want}`,
            );
          }
          sum += given;
          demandTotal += want;
        }

        // 2. Sum of allocations ≤ available (within a tiny float epsilon
        //    scaled by the magnitudes in play).
        const tolerance = EPSILON * (1 + Math.abs(avail) + Math.abs(demandTotal));
        if (sum > avail + tolerance) {
          throw new Error(
            `sum of allocations ${sum} exceeds available ${avail} ` +
              `(difference ${sum - avail} > tolerance ${tolerance})`,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
