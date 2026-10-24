import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as acceptAsk } from "@/app/api/asks/[id]/accept/route";
import { POST as postHandoff } from "@/app/api/org/[id]/handoff/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { mockProvider } from "@/lib/ai/provider";
import { getRepo } from "@/lib/data/repo";
import type { Ask, AskId, OrgId } from "@/lib/schemas";

/**
 * The handoff summary is built from the org's own records once each
 * (Task 26.1; Req 3.1, 3.2).
 *
 * An accept writes an org copy (`ev-org-`) and a company copy (`ev-co-`) of
 * the outcome, both carrying the orgId. The handoff route must drop the
 * company copy before prompting the model. The spy below calls through to the
 * real mock provider and records the prompt it received.
 */

const ORG_LISS = "org-liss" as OrgId;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/org/[id]/handoff excludes company-copy events", () => {
  it("prompts with the ev-org- copy of an accept and never the ev-co- copy", async () => {
    const askId = `ask-handoff-${crypto.randomUUID()}` as AskId;
    const ask: Ask = {
      id: askId,
      orgId: ORG_LISS,
      type: "speaker",
      groupSize: 3,
      preferredDates: ["2027-01-28"],
      deliveryMode: "virtual",
      topic: "careers in therapeutics",
      needsSupplies: false,
      status: "matched",
    };
    await getRepo().saveAsk(ask);

    const acceptRes = await acceptAsk(
      new NextRequest(`http://test/api/asks/${askId}/accept`, {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=acc-liaison`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ offerId: "off-hv-speaker" }),
      }),
      { params: { id: askId } },
    );
    expect(acceptRes.status).toBe(200);
    const stored = (await getRepo().listTimelineEvents(ORG_LISS)).filter((e) =>
      e.refs.includes(askId),
    );
    const orgCopy = stored.find((e) => e.id.startsWith("ev-org-"));
    const companyCopy = stored.find((e) => e.id.startsWith("ev-co-"));
    expect(orgCopy).toBeDefined();
    expect(companyCopy).toBeDefined();

    const spy = vi.spyOn(mockProvider, "complete");
    const res = await postHandoff(
      new NextRequest(`http://test/api/org/${ORG_LISS}/handoff`, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=acc-officer` },
      }),
      { params: { id: ORG_LISS } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(spy).toHaveBeenCalledTimes(1);
    const prompt = spy.mock.calls[0][0].prompt;
    expect(prompt).toContain(orgCopy!.id);
    expect(prompt).not.toContain(companyCopy!.id);
    expect(prompt).not.toContain(companyCopy!.summary);
    expect(prompt).not.toContain("ev-co-");
  });
});
