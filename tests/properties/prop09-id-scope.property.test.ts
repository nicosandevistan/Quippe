import { describe, it } from "vitest";
import fc from "fast-check";

import { validateReferencedIds } from "@/lib/core/refs";

/**
 * Property 9: AI outputs reference only input IDs (Task 8.2).
 *
 * Validates: Requirements 3.3, 12.2, 19.6
 *
 * Exercises the pure `validateReferencedIds(referenced, allowed): boolean` from
 * `src/lib/core/refs.ts`. No I/O, no randomness beyond fast-check's generators,
 * no clock.
 *
 * The guarantee, stated as a biconditional: for every `allowed` set of IDs and
 * every `referenced` list of IDs,
 *
 *     validateReferencedIds(referenced, allowed) === true
 *       IFF every id in referenced is a member of allowed.
 *
 * In particular an empty `referenced` collection vacuously satisfies the check
 * and returns `true`.
 *
 * The test asserts the result against an independently computed oracle,
 * `referenced.every((id) => allowedSet.has(id))`, and deliberately shapes the
 * `referenced` generator so BOTH directions of the biconditional are exercised
 * with good coverage:
 *   - "clean" lists drawn only from `allowed` (expected true, including empty),
 *   - "tainted" lists that include at least one id guaranteed NOT in `allowed`
 *     (expected false).
 */

// --- Arbitraries ----------------------------------------------------------

// Short-ish ID strings. Kept to a small alphabet and bounded length so clean
// draws and injected out-of-scope IDs collide/diverge often, keeping both
// branches of the oracle well exercised.
const idArb = fc.string({ minLength: 1, maxLength: 6 });

// The `allowed` set as an array of IDs. May be empty (then every non-empty
// referenced list is out of scope) or contain duplicates (the validator
// normalizes to a Set internally; duplicates must not change the outcome).
const allowedArb = fc.array(idArb, { maxLength: 12 });

// A referenced list drawn ONLY from `allowed` (a subset with possible repeats
// and reordering). When `allowed` is empty this yields the empty list, which
// must still be accepted. Expected oracle result: true.
function cleanReferencedArb(allowed: readonly string[]): fc.Arbitrary<string[]> {
  if (allowed.length === 0) {
    return fc.constant<string[]>([]);
  }
  return fc.array(fc.constantFrom(...allowed), { maxLength: 12 });
}

// A referenced list guaranteed to contain at least one id NOT in `allowed`.
// We generate a tainting id that is provably outside the allowed set, mix it
// with an arbitrary number of clean ids, then shuffle so the out-of-scope id
// is not always first. Expected oracle result: false.
function taintedReferencedArb(allowed: readonly string[]): fc.Arbitrary<string[]> {
  const allowedSet = new Set(allowed);
  const outOfScopeId = idArb.filter((id) => !allowedSet.has(id));
  const cleanPart =
    allowed.length === 0
      ? fc.constant<string[]>([])
      : fc.array(fc.constantFrom(...allowed), { maxLength: 11 });

  return fc
    .tuple(outOfScopeId, cleanPart)
    .chain(([bad, clean]) => fc.shuffledSubarray([bad, ...clean], {
      minLength: clean.length + 1,
      maxLength: clean.length + 1,
    }));
}

const NUM_RUNS = 200;

describe("Property 9 (prop09): AI outputs reference only input IDs", () => {
  it("returns true IFF every referenced id is in the allowed set (oracle check)", () => {
    fc.assert(
      fc.property(
        allowedArb.chain((allowed) =>
          fc
            // Mix clean, tainted, and empty referenced lists under one allowed set.
            .oneof(
              cleanReferencedArb(allowed),
              taintedReferencedArb(allowed),
              fc.constant<string[]>([]),
            )
            .map((referenced) => ({ allowed, referenced })),
        ),
        ({ allowed, referenced }) => {
          const allowedSet = new Set(allowed);
          const oracle = referenced.every((id) => allowedSet.has(id));
          const actual = validateReferencedIds(referenced, allowed);

          if (actual !== oracle) {
            throw new Error(
              `validateReferencedIds(${JSON.stringify(referenced)}, ` +
                `${JSON.stringify(allowed)}) returned ${actual}; oracle expected ${oracle}`,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("accepts every clean subset of the allowed set (forward direction, including empty)", () => {
    fc.assert(
      fc.property(
        allowedArb.chain((allowed) =>
          cleanReferencedArb(allowed).map((referenced) => ({ allowed, referenced })),
        ),
        ({ allowed, referenced }) => {
          if (validateReferencedIds(referenced, allowed) !== true) {
            throw new Error(
              `expected true for in-scope referenced ${JSON.stringify(referenced)} ` +
                `against allowed ${JSON.stringify(allowed)}`,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("rejects any list containing an out-of-scope id (reverse direction)", () => {
    fc.assert(
      fc.property(
        allowedArb.chain((allowed) =>
          taintedReferencedArb(allowed).map((referenced) => ({ allowed, referenced })),
        ),
        ({ allowed, referenced }) => {
          if (validateReferencedIds(referenced, allowed) !== false) {
            throw new Error(
              `expected false for out-of-scope referenced ${JSON.stringify(referenced)} ` +
                `against allowed ${JSON.stringify(allowed)}`,
            );
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("accepts the empty referenced collection for any allowed set (vacuous truth)", () => {
    fc.assert(
      fc.property(allowedArb, (allowed) => {
        if (validateReferencedIds([], allowed) !== true) {
          throw new Error(
            `expected true for empty referenced against allowed ${JSON.stringify(allowed)}`,
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
