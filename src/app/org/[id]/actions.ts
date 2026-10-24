"use server";

import type { HandoffSummary } from "@/lib/schemas";

/**
 * Handoff summary action — UI stand-in (Task 23.2; Req 3).
 *
 * TODO(api): call `POST /api/org/[id]/handoff` once Task 16 lands. That route
 * runs the AI `handoffSummary` over THIS org's timeline only and returns a
 * typed fallback on bad/empty refs (Req 3.4, 3.5). Until the route exists, this
 * action returns the typed fallback shape so the page can render the
 * "couldn't generate" state and the wiring is already in place.
 */

export const HANDOFF_FALLBACK_NOTE =
  "A handoff summary isn't available yet — the summary service isn't wired up in this build.";

export async function generateHandoffAction(
  _orgId: string,
): Promise<HandoffSummary> {
  // Typed fallback (Req 3.5): empty collections, no invented references.
  return {
    activeRelationships: [],
    contactsByRole: {},
    openAsks: [],
    whatWorked: [],
    referencedIds: [],
  };
}
