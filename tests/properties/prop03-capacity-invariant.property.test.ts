import { describe, it } from "vitest";
import fc from "fast-check";

import { canAccept } from "@/lib/core/capacity";

/**
 * Property 3: accepted group size never exceeds offer capacity (Task 5.2).
 *
 * Validates: Requirements 6.7, 18.1
 *
 * Exercises the pure `canAccept(offer | capacity, acceptedGroupSizesInPeriod,
 * newGroupSize): boolean` from `src/lib/core/capacity.ts`, which returns true
 * iff `sum(acceptedGroupSizesInPeriod) + newGroupSize <= capacity`. No I/O, no
 * randomness beyond fast-check's generators, no clock.
 *
 * `canAccept` is the single gate every accept attempt passes through. To model
 * the real accept loop, we FOLD it over a sequence of accept attempts:
 *   - maintain a running list `acceptedSoFar` of the group sizes already
 *     accepted for the offer in the period;
 *   - for each attempt, call `canAccept(capacity, acceptedSoFar, attempt)`;
 *   - if it returns true, append the attempt to `acceptedSoFar`.
 *
 * Two invariants are asserted at EVERY step of the fold:
 *   1. Never exceeds. After every accepted attempt,
 *          sum(acceptedSoFar) <= capacity.
 *   2. Refuses exactly on overflow. For every attempt (accepted or not),
 *          canAccept(...) === (sum(acceptedSoFar) + attempt <= capacity),
 *      i.e. the gate returns false iff appending the attempt would push the
 *      accepted total over capacity.
 */

// --- Arbitraries ----------------------------------------------------------

// Offer capacity: positive integer in the schema's offer-capacity range
// (1..10000 per Req 4.5 / tasks 2.2).
const capacity = fc.integer({ min: 1, max: 10000 });

// A sequence of accept attempts, each a positive group size (Ask groupSize is
// 1..500 per the schema; we allow up to 600 so some attempts genuinely
// overflow even against large capacities and small accumulated totals). An
// empty sequence is valid (no attempts) and the invariants hold vacuously.
const acceptAttempts = fc.array(fc.integer({ min: 1, max: 600 }), {
  minLength: 0,
  maxLength: 50,
});

const sum = (xs: number[]): number => xs.reduce((acc, x) => acc + x, 0);

const NUM_RUNS = 200;

describe("Property 3 (prop03): accepted group size never exceeds offer capacity", () => {
  it("folds canAccept so the accepted total never exceeds capacity and refuses exactly on overflow", () => {
    fc.assert(
      fc.property(capacity, acceptAttempts, (cap, attempts) => {
        const acceptedSoFar: number[] = [];

        for (const attempt of attempts) {
          const before = sum(acceptedSoFar);
          const wouldFit = before + attempt <= cap;
          const decision = canAccept(cap, acceptedSoFar, attempt);

          // Invariant 2: the gate refuses exactly when the attempt would
          // overflow capacity — accepted or not, the boolean must match the
          // overflow condition.
          if (decision !== wouldFit) {
            throw new Error(
              `canAccept(${cap}, [sum=${before}], ${attempt}) returned ${decision}; ` +
                `expected ${wouldFit} (sum ${before} + ${attempt} ${
                  wouldFit ? "<=" : ">"
                } ${cap})`,
            );
          }

          if (decision) {
            acceptedSoFar.push(attempt);

            // Invariant 1: after every accepted attempt the running accepted
            // total stays at or below capacity.
            const after = sum(acceptedSoFar);
            if (after > cap) {
              throw new Error(
                `accepted total ${after} exceeds capacity ${cap} after accepting ${attempt}`,
              );
            }
          }
        }

        // Final guard: the fully folded accepted total is within capacity.
        const total = sum(acceptedSoFar);
        if (total > cap) {
          throw new Error(
            `final accepted total ${total} exceeds capacity ${cap}`,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
