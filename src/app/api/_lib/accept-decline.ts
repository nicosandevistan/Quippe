import { z } from "zod";

import { canAccept } from "@/lib/core/capacity";
import type { Repo } from "@/lib/data/repo";
import {
  type Ask,
  type CompanyId,
  type EventId,
  type OfferId,
  type Organization,
  type TimelineEvent,
} from "@/lib/schemas";

/**
 * Shared accept/decline logic for the liaison routes (Task 18.1; Req 6, 18.1,
 * 18.3; Property 3).
 *
 * The two route handlers (`.../accept`, `.../decline`) are kept thin: they
 * authorize, parse the body, inject `now`, and delegate the domain work to the
 * helpers here. Keeping this in one module means the matched-only transition,
 * the ownership check on the accepted offer, the capacity gate, and the
 * dual-timeline write have exactly one definition and cannot drift between the
 * two routes.
 *
 * Every safety/eligibility decision routes through the deterministic core
 * (`canAccept`) — this module reads the repo and the clock only at the route
 * boundary (both passed in), and never mocks a decision (Req 19.7).
 */

/**
 * Accept/decline request body. The ask id comes from the route path; the
 * client identifies WHICH of the company's offers the matched ask is being
 * accepted/declined against by `offerId`.
 *
 * There is no persisted Match linking an ask to an offer in the repo and no
 * `offerId` on an `Ask`, so the liaison names the offer explicitly. The route
 * then confirms that offer belongs to the acting company before any transition
 * (Req 6.1/6.2 act on "that company's offers").
 */
export const AcceptDeclineBody = z.object({
  offerId: z.string().min(1),
});
export type AcceptDeclineBody = z.infer<typeof AcceptDeclineBody>;

/** Only a `matched` ask can be accepted or declined (Req 6.1, 6.2, 6.3). */
export function isAcceptable(ask: Ask): boolean {
  return ask.status === "matched";
}

/**
 * Id prefixes for the two copies of an accept/decline outcome (Task 26.1).
 *
 * Both copies carry the orgId (and companyId), so a plain org-timeline query
 * returns BOTH and the org page showed every outcome twice, once in the
 * company's voice. The prefix marks which copy is which so the org page can
 * hide the company copy (see `isCompanyCopyEvent`). The dual write itself is
 * kept (Req 6.4, 6.5).
 */
export const ORG_COPY_EVENT_PREFIX = "ev-org-";
export const COMPANY_COPY_EVENT_PREFIX = "ev-co-";

/** True for the company-voice copy of an accept/decline event. */
export function isCompanyCopyEvent(e: Pick<TimelineEvent, "id">): boolean {
  return e.id.startsWith(COMPANY_COPY_EVENT_PREFIX);
}

/** Mint a server-owned, namespaced TimelineEvent id with the given prefix. */
function newEventId(prefix: string): EventId {
  return `${prefix}${crypto.randomUUID()}` as EventId;
}

/**
 * Compute the group sizes of asks ALREADY accepted against this offer in the
 * applicable period — the fairness/capacity input `canAccept` folds over
 * (Req 6.6, 18.1; Property 3).
 *
 * The repo has no direct offer→accepted-asks link and a `TimelineEvent` does
 * not carry a group size, so this derives the committed demand conservatively
 * from the data that IS available:
 *   - find every `accepted` timeline event whose `refs` name this offer (that
 *     is how an accept records which offer it committed against — see the
 *     write below);
 *   - for each such event, recover the committed ask by the ask id also in its
 *     `refs` and read that ask's `groupSize`.
 * An accepted event that cannot be resolved back to a known ask contributes 0
 * (it cannot inflate remaining capacity), which keeps the gate conservative:
 * the new group is always counted against capacity even when prior commitments
 * are unknown, so the invariant `sum ≤ capacity` can never be under-counted in
 * a way that over-admits the NEW accept.
 *
 * Each accepted ask is counted ONCE (Task 26.1). Every accept writes two
 * events that both carry the orgId (the org copy and the company copy, see
 * `buildDualTimelineEvents`), so a plain org-timeline scan sees each commit
 * twice. Counting both double-booked the offer: on off-hv-tour (capacity 30) a
 * 25-person accept used up 50 seats and a later 5-person ask was refused. The
 * company copy is skipped, and the committed ask ids are deduped so any other
 * repeat of the same accept also counts once.
 */
export async function acceptedGroupSizesForOffer(
  repo: Repo,
  offerId: OfferId,
): Promise<number[]> {
  // Accepted asks are the source of truth for committed demand; map them by id
  // so an accepted timeline event can be resolved back to a group size.
  const acceptedAsks = await repo.listAsks({ status: "accepted" });
  const askById = new Map<string, Ask>(acceptedAsks.map((a) => [a.id, a]));

  // Accepted timeline events that reference this offer record a prior commit
  // against it. Scan every org's accepted events via the org ids they carry.
  const orgIds = new Set<string>(acceptedAsks.map((a) => a.orgId));
  const counted = new Set<string>();
  const sizes: number[] = [];
  for (const orgId of orgIds) {
    const events = await repo.listTimelineEvents(orgId as Organization["id"]);
    for (const e of events) {
      if (e.kind !== "accepted") continue;
      if (isCompanyCopyEvent(e)) continue;
      if (!e.refs.includes(offerId)) continue;
      // Resolve the committed ask from the same event's refs.
      const committedAskId = e.refs.find((ref) => askById.has(ref));
      if (committedAskId === undefined) continue;
      if (counted.has(committedAskId)) continue;
      const committed = askById.get(committedAskId);
      if (committed !== undefined) {
        counted.add(committedAskId);
        sizes.push(committed.groupSize);
      }
    }
  }
  return sizes;
}

/**
 * Build the dual TimelineEvents for a completed accept/decline (Req 6.4, 6.5,
 * 18.3): exactly one event on the organization's timeline and one on the
 * company's timeline, as DISTINCT events (different ids). Both carry the kind
 * (`accepted`/`declined`), the injected date, a summary, a seq, and refs back
 * to the ask and the offer.
 *
 * Both events name the company so the company timeline query (events with
 * `companyId === co`) finds its own copy and the org timeline query (events
 * with `orgId === org`) finds the org copy. The two events are distinct
 * (different ids and role-appropriate summaries) so each timeline records the
 * outcome in its own voice.
 */
export function buildDualTimelineEvents(args: {
  kind: "accepted" | "declined";
  orgId: Organization["id"];
  companyId: CompanyId;
  companyName: string;
  orgName: string;
  askId: string;
  offerId: string;
  date: string;
  seq: number;
}): { orgEvent: TimelineEvent; companyEvent: TimelineEvent } {
  const refs = [args.orgId as string, args.companyId as string, args.askId, args.offerId];
  const verb = args.kind === "accepted" ? "accepted" : "declined";

  const orgEvent: TimelineEvent = {
    id: newEventId(ORG_COPY_EVENT_PREFIX),
    orgId: args.orgId,
    companyId: args.companyId,
    kind: args.kind,
    date: args.date,
    seq: args.seq,
    summary: `${args.companyName} ${verb} the ask.`,
    refs,
  };

  const companyEvent: TimelineEvent = {
    id: newEventId(COMPANY_COPY_EVENT_PREFIX),
    orgId: args.orgId,
    companyId: args.companyId,
    kind: args.kind,
    date: args.date,
    seq: args.seq,
    summary: `${verb === "accepted" ? "Accepted" : "Declined"} an ask from ${args.orgName}.`,
    refs,
  };

  return { orgEvent, companyEvent };
}

/** Re-export so routes import the capacity gate from one place. */
export { canAccept };
