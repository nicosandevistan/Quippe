import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";
import { type AskId, type CompanyId, type OfferId } from "@/lib/schemas";

import { requireRole } from "../../../_lib/guard";
import {
  AcceptDeclineBody,
  acceptedGroupSizesForOffer,
  buildDualTimelineEvents,
  canAccept,
  isAcceptable,
} from "../../../_lib/accept-decline";

/**
 * Accept a matched ask (Task 18.1; Req 6.1, 6.3, 6.4, 6.6, 6.7, 18.1, 18.3;
 * Property 3).
 *
 * `POST /api/asks/[id]/accept` is ordered so NOTHING changes unless every gate
 * passes:
 *
 *   authorize (company liaison) → parse body (offerId) → load ask
 *   → matched-only transition → load offer + ownership check
 *   → capacity gate (canAccept) → set status `accepted`
 *   → write ONE org + ONE company timeline event.
 *
 * The run date is injected here at the boundary; the deterministic core
 * (`canAccept`) receives it implicitly via the group-size data and stays pure.
 * A capacity-exceeding accept returns 409 with NO status change and NO timeline
 * event (Req 6.7, Property 3). The handler is thin: it reads the repo and clock
 * and delegates the capacity decision and event construction to `_lib`.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // 1) Only the company liaison accepts a matched ask (Req 6, 1.4).
  const auth = await requireRole(req, "company_liaison");
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const companyId = session.companyId ?? null;
  if (companyId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with a company." },
      { status: 403 },
    );
  }

  // 2) Parse the JSON body and the offer being accepted against.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }
  const body = AcceptDeclineBody.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      {
        error: "An offerId is required to accept a matched ask.",
        fieldErrors: body.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const repo = getRepo();
  const askId = params.id as AskId;
  const offerId = body.data.offerId as OfferId;

  // 3) Load the ask. A missing ask is a 404 with nothing changed.
  const ask = await repo.getAsk(askId);
  if (ask === null) {
    return NextResponse.json(
      { error: "That ask does not exist." },
      { status: 404 },
    );
  }

  // 4) Matched-only transition (Req 6.1, 6.3). Any other status is rejected
  //    with the ask left unchanged.
  if (!isAcceptable(ask)) {
    return NextResponse.json(
      {
        error:
          "This ask is not in a state that can be accepted. Only a matched ask can be accepted.",
      },
      { status: 409 },
    );
  }

  // 5) Load the offer being accepted against and confirm it belongs to the
  //    acting company — a liaison accepts against their OWN company's offers
  //    (Req 6.1).
  const offer = (await repo.listOffers()).find((o) => o.id === offerId);
  if (offer === undefined) {
    return NextResponse.json(
      { error: "That offer does not exist." },
      { status: 404 },
    );
  }
  if (offer.companyId !== companyId) {
    return NextResponse.json(
      {
        error:
          "That offer belongs to another company. You can only accept asks against your own company's offers, and the ask was left unchanged.",
      },
      { status: 403 },
    );
  }

  // 6) Capacity gate (Req 6.6, 6.7, 18.1; Property 3). Compute the group sizes
  //    already committed against this offer and ask the deterministic core
  //    whether the new group still fits. On refusal: NO status change, NO
  //    timeline event.
  const committed = await acceptedGroupSizesForOffer(repo, offerId);
  if (!canAccept(offer, committed, ask.groupSize)) {
    return NextResponse.json(
      {
        error:
          "Accepting this ask would exceed the offer's capacity. The ask was left unchanged.",
      },
      { status: 409 },
    );
  }

  // 7) Success: set the ask to `accepted` (Req 6.1).
  const updated = await repo.setAskStatus(askId, "accepted");

  // 8) Resolve names for the timeline summaries, then write EXACTLY ONE event
  //    to the org timeline and ONE to the company timeline (Req 6.4, 18.3).
  const org = await repo.getOrganization(ask.orgId);
  const company = await repo.getCompany(companyId as CompanyId);
  const date = new Date().toISOString().slice(0, 10);
  const { orgEvent, companyEvent } = buildDualTimelineEvents({
    kind: "accepted",
    orgId: ask.orgId,
    companyId,
    companyName: company?.name ?? "The company",
    orgName: org?.name ?? "an organization",
    askId,
    offerId,
    date,
    seq: 1,
  });
  await repo.addTimelineEvent(orgEvent);
  await repo.addTimelineEvent(companyEvent);

  return NextResponse.json({
    ask: updated,
    timelineEvents: [orgEvent.id, companyEvent.id],
  });
}
