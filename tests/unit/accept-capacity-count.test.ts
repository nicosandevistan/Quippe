import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as acceptAsk } from "@/app/api/asks/[id]/accept/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { getRepo } from "@/lib/data/repo";
import type { Ask, AskId, OrgId } from "@/lib/schemas";

/**
 * Capacity counting on accept (Task 26.1; Req 6.6, 6.7, 18.1; Property 3).
 *
 * Every accept writes two timeline events that both carry the orgId (the org
 * copy `ev-org-` and the company copy `ev-co-`). The capacity gate must count
 * each accepted ask ONCE. When it counted both copies, a 25-person accept on
 * off-hv-tour (capacity 30) used up 50 seats and a following 5-person ask was
 * wrongly refused.
 *
 * This file has its own module state, so it starts from a fresh seed: nothing
 * is committed against off-hv-tour before the first accept below.
 */

const LIAISON = "acc-liaison"; // company_liaison @ co-harborview
const OFF_HV_TOUR = "off-hv-tour"; // lab_tour, capacity 30
const ORG_LISS = "org-liss" as OrgId;

async function seedMatchedTour(groupSize: number): Promise<AskId> {
  const id = `ask-cap-${crypto.randomUUID()}` as AskId;
  const ask: Ask = {
    id,
    orgId: ORG_LISS,
    type: "lab_tour",
    groupSize,
    preferredDates: ["2027-02-10"],
    deliveryMode: "in_person",
    topic: "molecular biology lab tour",
    needsSupplies: false,
    status: "matched",
  };
  await getRepo().saveAsk(ask);
  return id;
}

function accept(askId: string) {
  return acceptAsk(
    new NextRequest(`http://test/api/asks/${askId}/accept`, {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${LIAISON}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ offerId: OFF_HV_TOUR }),
    }),
    { params: { id: askId } },
  );
}

async function eventsForAsk(askId: string) {
  return (await getRepo().listTimelineEvents(ORG_LISS)).filter((e) =>
    e.refs.includes(askId),
  );
}

describe("POST /api/asks/[id]/accept counts each accepted ask once", () => {
  it("fills off-hv-tour to exactly 30 (25 + 5), then refuses one more person", async () => {
    const big = await seedMatchedTour(25);
    const bigRes = await accept(big);
    expect(bigRes.status).toBe(200);
    expect((await bigRes.json()).ask.status).toBe("accepted");

    // 25 of 30 seats used: a 5-person group still fits.
    const five = await seedMatchedTour(5);
    const fiveRes = await accept(five);
    expect(fiveRes.status).toBe(200);
    expect((await fiveRes.json()).ask.status).toBe("accepted");

    // 30 of 30 seats used: even 1 more person is refused, unchanged.
    const one = await seedMatchedTour(1);
    const oneRes = await accept(one);
    expect(oneRes.status).toBe(409);
    expect(String((await oneRes.json()).error)).toMatch(/capacity/i);
    expect((await getRepo().getAsk(one))?.status).toBe("matched");
    expect(await eventsForAsk(one)).toEqual([]);
  });
});
