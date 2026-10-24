import type { Offer } from "@/lib/schemas";

/**
 * Pure capacity and allocation logic for Open Bench (Req 6.6, 6.7, 18.1, 18.2;
 * CP3, CP4).
 *
 * This module lives in the deterministic core: no I/O, no randomness, no clock.
 * It imports only the `Offer` type from the schema layer.
 *
 * Two guarantees are enforced here:
 *   - CP3 (Property 3): the summed group size of accepted asks for an offer in
 *     a period never exceeds the offer's capacity. `canAccept` is the single
 *     gate every accept attempt passes through, so folding it over a sequence
 *     of accepts keeps the accepted total ≤ capacity at every step and refuses
 *     exactly the accept that would overflow.
 *   - CP4 (Property 4): the total quantity `allocate` hands out across demands
 *     never exceeds the available quantity, and no single demand receives more
 *     than it asked for.
 */

// Accept either a full Offer (read its capacity) or a plain capacity number.
// Routes pass the Offer; the capacity-only form keeps the function easy to
// exercise directly in property tests.
type CapacitySource = Offer | number;

function capacityOf(source: CapacitySource): number {
  return typeof source === "number" ? source : source.capacity;
}

/**
 * Decide whether accepting a new group keeps an offer within capacity.
 *
 * Returns `true` iff the summed accepted group size for the offer's period,
 * plus the new group, stays at or below the offer's capacity:
 *
 *     sum(acceptedGroupSizesInPeriod) + newGroupSize ≤ capacity
 *
 * This is the invariant gate for Req 6.6/6.7 and 18.1 (CP3). Accepting is
 * refused exactly when the sum would overflow capacity; the caller leaves the
 * ask status unchanged and writes no timeline event on a refusal.
 *
 * @param offer the offer being accepted against (or a plain capacity number)
 * @param acceptedGroupSizesInPeriod group sizes of asks already accepted for
 *        this offer in the applicable period
 * @param newGroupSize the group size of the ask being accepted
 * @returns `true` if the accept keeps the accepted total ≤ capacity
 */
export function canAccept(
  offer: CapacitySource,
  acceptedGroupSizesInPeriod: number[],
  newGroupSize: number,
): boolean {
  const capacity = capacityOf(offer);
  const alreadyAccepted = acceptedGroupSizesInPeriod.reduce(
    (sum, groupSize) => sum + groupSize,
    0,
  );
  return alreadyAccepted + newGroupSize <= capacity;
}

/**
 * Greedily allocate a non-negative `available` quantity across `demands`.
 *
 * Returns an array the same length as `demands`, where each entry is the
 * quantity allocated to that demand. Allocation proceeds in order: each demand
 * receives `min(remaining, demand)` and the remaining quantity shrinks by that
 * amount. Consequently:
 *   - the sum of allocations is ≤ `available` (CP4, Req 18.2); and
 *   - no demand receives more than it asked for.
 *
 * A demand is never allocated more than the quantity still available, so once
 * `available` is exhausted the remaining demands receive 0.
 *
 * @param available the non-negative quantity to distribute
 * @param demands per-demand non-negative requested quantities
 * @returns per-demand allocations, same length as `demands`, summing ≤ available
 */
export function allocate(available: number, demands: number[]): number[] {
  let remaining = available;
  return demands.map((demand) => {
    const given = Math.min(remaining, demand);
    remaining -= given;
    return given;
  });
}
