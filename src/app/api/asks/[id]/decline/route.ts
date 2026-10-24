import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";
import { type AskId, type CompanyId, type OfferId } from "@/lib/schemas";

import { requireRole } from "../../../_lib/guard";
import {
  AcceptDeclineBody,
  buildDualTimelineEvents,
  isAcceptable,
} from "../../../_lib/accept-decline";

/**
 * Decline a matched ask (Task 18.1; Req 6.2, 6.3, 6.5, 18.3).
 *
 * `POST /api/asks/[id]/decline` mirrors the accept route but has no capacity
 * gate — declining never commits demand against an offer:
 *
 *   authorize (company liaison) → parse body (offerId) → load ask
 *   → matched-only transition → load offer + ownership check
 *   → set status `declined` → write ONE org + ONE company timeline event.
 *
 * Per Req 6.5 a decline, like an accept, records one event on the
 * organization's timeline and one on the company's timeline (dual events). The
 * handler is thin and delegates event construction to `_lib`.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // 1) Only the company liaison declines a matched ask (Req 6, 1.4).
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

  // 2) Parse the JSON body and the offer the ask was matched to.
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
        error: "An offerId is required to decline a matched ask.",
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

  // 4) Matched-only transition (Req 6.2, 6.3). Any other status is rejected
  //    with the ask left unchanged.
  if (!isAcceptable(ask)) {
    return NextResponse.json(
      {
        error:
          "This ask is not in a state that can be declined. Only a matched ask can be declined.",
      },
      { status: 409 },
    );
  }

  // 5) Confirm the named offer belongs to the acting company (Req 6.2).
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
          "That offer belongs to another company. You can only decline asks against your own company's offers, and the ask was left unchanged.",
      },
      { status: 403 },
    );
  }

  // 6) Set the ask to `declined` (Req 6.2).
  const updated = await repo.setAskStatus(askId, "declined");

  // 7) Write EXACTLY ONE event to the org timeline and ONE to the company
  //    timeline (Req 6.5, 18.3).
  const org = await repo.getOrganization(ask.orgId);
  const company = await repo.getCompany(companyId as CompanyId);
  const date = new Date().toISOString().slice(0, 10);
  const { orgEvent, companyEvent } = buildDualTimelineEvents({
    kind: "declined",
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
