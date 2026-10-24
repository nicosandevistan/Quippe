import type { TimelineEvent } from "@/lib/schemas";

/**
 * Pure timeline ordering for Quippe (Req 2.4).
 *
 * This module lives in the deterministic core: no I/O, no randomness, no clock.
 * It imports only the `TimelineEvent` type from the schema layer.
 *
 * `sortTimeline(events)` returns a sorted COPY of `events` in reverse
 * chronological order: by `date` DESCENDING, then by `seq` ASCENDING for
 * same-date events. Dates are the schema's ISO date strings (e.g.
 * "2025-02-14"), compared lexically — ISO ordering matches chronological
 * ordering.
 *
 * Determinism and purity:
 *   - The input array is never mutated (we sort a shallow copy).
 *   - The comparator imposes a total order on distinct events via the
 *     (date, seq) tie-break, so the result is identical on repeated calls —
 *     no reliance on the engine's sort stability for correctness.
 */
export function sortTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    // Primary key: date descending. Later dates sort first.
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    // Secondary key: seq ascending. Same-date events keep a stable, total
    // order by their sequence number.
    return a.seq - b.seq;
  });
}
