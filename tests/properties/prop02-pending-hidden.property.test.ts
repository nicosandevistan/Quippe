import { describe, it } from "vitest";
import fc from "fast-check";

import { visibleToCompany } from "@/lib/core/safety";
import { AskStatus } from "@/lib/schemas";

/**
 * Property 2: pending approval asks are hidden from companies (Task 4.3).
 *
 * `visibleToCompany` (src/lib/core/safety.ts) is the single company-facing
 * visibility gate: it returns `false` for `pending_advisor_approval` and
 * `rejected` asks, and `true` for every other status. This property exercises
 * that gate across the full `AskStatus` enum and asserts both halves of the
 * guarantee:
 *   - hidden-status asks are never visible AND never survive a company-facing
 *     filter built from `visibleToCompany`, and
 *   - company-visible asks are always visible AND always survive that filter.
 *
 * The function reads only `ask.status`, so the generated ask carries just an
 * `id` (to make each element distinct and realistic) and a `status`. No
 * network, no randomness beyond fast-check, no Date.now().
 *
 * Validates: Requirements 5.6, 9.2
 */

// The statuses hidden from every company-facing view/query (CP2).
const HIDDEN_STATUSES = ["pending_advisor_approval", "rejected"] as const;

// All AskStatus values, drawn straight from the zod enum definition so the
// generator can never drift from the schema.
const ALL_ASK_STATUSES = AskStatus.options;

// A minimal ask arbitrary: an id string plus a status drawn from the full
// AskStatus enum. Other Ask fields are omitted because visibleToCompany only
// reads `status` (its parameter type is Pick<Ask, "status">).
const askArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  status: fc.constantFrom(...ALL_ASK_STATUSES),
});

const isHidden = (status: string): boolean =>
  (HIDDEN_STATUSES as readonly string[]).includes(status);

describe("Property 2 (prop02): pending approval asks are hidden from companies", () => {
  it("hidden-status asks are never visible and never survive a company filter", () => {
    fc.assert(
      fc.property(fc.array(askArb, { maxLength: 30 }), (asks) => {
        // Per-ask: visibleToCompany is false exactly for hidden statuses and
        // true for every company-visible status.
        for (const ask of asks) {
          const visible = visibleToCompany(ask);
          if (isHidden(ask.status)) {
            if (visible !== false) return false;
          } else if (visible !== true) {
            return false;
          }
        }

        // Filter-level: apply visibleToCompany as the company-facing filter
        // predicate over the generated list. No hidden-status ask may survive,
        // and every company-visible ask must survive.
        const surviving = asks.filter((ask) => visibleToCompany(ask));

        // No surviving ask carries a hidden status.
        if (surviving.some((ask) => isHidden(ask.status))) return false;

        // Every company-visible ask in the input survives the filter.
        const expectedSurvivors = asks.filter((ask) => !isHidden(ask.status));
        if (surviving.length !== expectedSurvivors.length) return false;

        return true;
      }),
      { numRuns: 200 },
    );
  });

  it("every hidden status individually resolves to not-visible", () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 12 }),
          status: fc.constantFrom(...HIDDEN_STATUSES),
        }),
        (ask) => visibleToCompany(ask) === false,
      ),
      { numRuns: 200 },
    );
  });

  it("every company-visible status individually resolves to visible", () => {
    const visibleStatuses = ALL_ASK_STATUSES.filter((s) => !isHidden(s));
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 12 }),
          status: fc.constantFrom(...visibleStatuses),
        }),
        (ask) => visibleToCompany(ask) === true,
      ),
      { numRuns: 200 },
    );
  });
});
