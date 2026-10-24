import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as acceptAsk } from "@/app/api/asks/[id]/accept/route";
import { POST as declineAsk } from "@/app/api/asks/[id]/decline/route";
import { POST as approveAsk } from "@/app/api/asks/[id]/approve/route";
import { POST as rejectAsk } from "@/app/api/asks/[id]/reject/route";
import { GET as advisorQueue } from "@/app/api/advisor/queue/route";
import { getRepo } from "@/lib/data/repo";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import type {
  Account,
  AccountId,
  Ask,
  AskId,
  OfferId,
  OrgId,
} from "@/lib/schemas";

/**
 * Unit tests for the accept/decline and advisor-approval API routes
 * (Task 18.3; Req 6.3, 6.7, 9.3, 9.4, 9.5; Property 3).
 *
 * These exercise the live route handlers against the PROCESS-WIDE repo
 * singleton (`getRepo()`), which the routes read and mutate. To stay robust to
 * that shared, order-dependent store the tests:
 *   - mint a UNIQUE ask id (`crypto.randomUUID`) per case and seed it via
 *     `repo.saveAsk`, so cases never collide;
 *   - assert status via follow-up `repo.getAsk` reads;
 *   - assert timeline writes via BEFORE/AFTER deltas of
 *     `repo.listTimelineEvents` rather than absolute counts;
 *   - restore all spies after every test.
 *
 * Real seed ids used (from src/lib/data/seed.json):
 *   - acc-liaison     company_liaison bound to co-harborview (the only usable
 *                     liaison account; co-harborview owns the off-hv-* offers)
 *   - acc-advisor     club_advisor bound to org-hsbio (the seeded advisor)
 *   - co-harborview   company owning off-hv-tour (lab_tour, capacity 20),
 *                     off-hv-speaker (speaker, capacity 50), off-hv-supplies
 *   - co-tidepool     owns off-tp-supplies (used for the cross-company case)
 *   - org-liss        the org the accepted/declined asks belong to
 *   - org-hsbio       the advisor's own org (advisor-scoped queue + approve)
 *   - org-synbio      a DIFFERENT org (advisor org-mismatch + queue scoping)
 *
 * off-hv-tour.capacity is 20, which drives the capacity-edge case: a matched
 * ask with groupSize 21 can never fit, so the accept is refused with no state
 * change and no timeline event — independent of any prior commitments in the
 * shared store.
 *
 * The seed defines a real advisor only for org-hsbio. To act as a DIFFERENT
 * org's advisor (org-synbio) we spy on the singleton's `getAccount` to resolve
 * a synthetic advisor bound to org-synbio; all other repo methods stay real.
 */

// --- Request helpers -----------------------------------------------------

/** Build a NextRequest carrying the session cookie for a given account id. */
function reqAs(
  accountId: string,
  url: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${accountId}`,
  };
  const method = init?.method ?? "GET";
  const hasBody = init?.body !== undefined;
  if (hasBody) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
  });
}

const LIAISON = "acc-liaison";
const ADVISOR = "acc-advisor";

const ORG_LISS = "org-liss" as OrgId;
const ORG_HSBIO = "org-hsbio" as OrgId;
const ORG_SYNBIO = "org-synbio" as OrgId;

const OFF_HV_TOUR = "off-hv-tour" as OfferId; // capacity 20
const OFF_HV_SPEAKER = "off-hv-speaker" as OfferId; // capacity 50
const OFF_TP_SUPPLIES = "off-tp-supplies" as OfferId; // another company's offer

/** Seed a fresh ask with a unique id and the given overrides, return its id. */
async function seedAsk(overrides: Partial<Ask> & { status: Ask["status"] }) {
  const id = `ask-test-${crypto.randomUUID()}` as AskId;
  const ask: Ask = {
    id,
    orgId: ORG_LISS,
    type: "lab_tour",
    groupSize: 5,
    preferredDates: ["2027-02-10"],
    deliveryMode: "in_person",
    topic: "molecular biology lab tour",
    needsSupplies: false,
    ...overrides,
  };
  await getRepo().saveAsk(ask);
  return id;
}

/**
 * Count the timeline events that reference a given ask id across both the org
 * and company timelines. Dual accept/decline events carry the ask id in their
 * `refs`, so this isolates THIS ask's events from the shared store regardless
 * of what other tests wrote.
 */
async function eventsForAsk(orgId: OrgId, askId: string) {
  const events = await getRepo().listTimelineEvents(orgId);
  return events.filter((e) => e.refs.includes(askId));
}

/**
 * Make `readSession` resolve a synthetic club_advisor bound to `orgId` by
 * spying on the singleton repo's `getAccount`. All other repo methods stay
 * real. Returns the account id to use as the cookie value.
 */
function spyAdvisorFor(orgId: OrgId, accountId: string): string {
  const repo = getRepo();
  const account: Account = {
    id: accountId as AccountId,
    role: "club_advisor",
    orgId,
  };
  vi.spyOn(repo, "getAccount").mockImplementation(async (id) =>
    id === (accountId as AccountId) ? account : null,
  );
  return accountId;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- accept/decline: matched-only transition (Req 6.3) -------------------

describe("POST /api/asks/[id]/accept and /decline (matched-only)", () => {
  it("rejects accepting an ask whose status is not matched, leaving it unchanged (409, Req 6.3)", async () => {
    // An `open` ask is not acceptable: only `matched` may be accepted.
    const askId = await seedAsk({ status: "open" });
    const before = await eventsForAsk(ORG_LISS, askId);

    const res = await acceptAsk(
      reqAs(LIAISON, `http://test/api/asks/${askId}/accept`, {
        method: "POST",
        body: { offerId: OFF_HV_TOUR },
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/matched/i);

    // Unchanged: status still `open`, no timeline event written for the ask.
    const ask = await getRepo().getAsk(askId);
    expect(ask?.status).toBe("open");
    const after = await eventsForAsk(ORG_LISS, askId);
    expect(after.length).toBe(before.length);
  });

  it("rejects declining an ask whose status is not matched, leaving it unchanged (409, Req 6.3)", async () => {
    const askId = await seedAsk({ status: "open" });
    const before = await eventsForAsk(ORG_LISS, askId);

    const res = await declineAsk(
      reqAs(LIAISON, `http://test/api/asks/${askId}/decline`, {
        method: "POST",
        body: { offerId: OFF_HV_TOUR },
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/matched/i);

    const ask = await getRepo().getAsk(askId);
    expect(ask?.status).toBe("open");
    const after = await eventsForAsk(ORG_LISS, askId);
    expect(after.length).toBe(before.length);
  });
});

// --- accept: capacity gate (Req 6.7, 18.1; Property 3) -------------------

describe("POST /api/asks/[id]/accept (capacity gate)", () => {
  it("refuses a capacity-exceeding accept with NO status change and NO timeline event (409, Req 6.7, Property 3)", async () => {
    // off-hv-tour has capacity 20; a matched ask of groupSize 21 can never fit
    // regardless of prior commitments, so this is a robust capacity-edge case.
    const askId = await seedAsk({
      status: "matched",
      groupSize: 21,
      orgId: ORG_LISS,
    });
    const before = await eventsForAsk(ORG_LISS, askId);

    const res = await acceptAsk(
      reqAs(LIAISON, `http://test/api/asks/${askId}/accept`, {
        method: "POST",
        body: { offerId: OFF_HV_TOUR },
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/capacity/i);

    // NO status change: the ask is still `matched`.
    const ask = await getRepo().getAsk(askId);
    expect(ask?.status).toBe("matched");

    // NO timeline event: the ask has exactly as many referencing events as
    // before the refused accept (zero new org or company events).
    const after = await eventsForAsk(ORG_LISS, askId);
    expect(after.length).toBe(before.length);
  });
});

// --- accept success: dual timeline events (Req 6.4, 18.3) ----------------

describe("POST /api/asks/[id]/accept (success)", () => {
  it("accepts a matched ask, sets status accepted, and writes exactly one org + one company event (Req 6.4, 18.3)", async () => {
    // Use off-hv-speaker (capacity 50) with a tiny group so the accept fits
    // even if other cases committed against it in the shared store.
    const askId = await seedAsk({
      status: "matched",
      groupSize: 3,
      orgId: ORG_LISS,
    });
    const before = await eventsForAsk(ORG_LISS, askId);
    expect(before.length).toBe(0);

    const res = await acceptAsk(
      reqAs(LIAISON, `http://test/api/asks/${askId}/accept`, {
        method: "POST",
        body: { offerId: OFF_HV_SPEAKER },
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ask.status).toBe("accepted");
    // Response names the two distinct timeline events it wrote.
    expect(Array.isArray(body.timelineEvents)).toBe(true);
    expect(body.timelineEvents.length).toBe(2);
    expect(body.timelineEvents[0]).not.toBe(body.timelineEvents[1]);

    // Status persisted as accepted.
    const ask = await getRepo().getAsk(askId);
    expect(ask?.status).toBe("accepted");

    // Exactly two new events reference this ask: distinct ids, both kind
    // "accepted". Both carry the org id (org timeline) AND the company id
    // (company timeline), so each timeline query finds its copy.
    const after = await eventsForAsk(ORG_LISS, askId);
    expect(after.length - before.length).toBe(2);
    const added = after.filter((e) => !before.some((b) => b.id === e.id));
    expect(added.length).toBe(2);
    expect(new Set(added.map((e) => e.id)).size).toBe(2);
    for (const e of added) {
      expect(e.kind).toBe("accepted");
      expect(e.orgId).toBe(ORG_LISS);
      expect(e.companyId).toBe("co-harborview");
    }
    // The response ids are exactly the two added events.
    expect(new Set(body.timelineEvents)).toEqual(
      new Set(added.map((e) => e.id)),
    );
  });

  it("writes dual events on a successful decline too (Req 6.5, 18.3)", async () => {
    const askId = await seedAsk({
      status: "matched",
      groupSize: 3,
      orgId: ORG_LISS,
    });
    const before = await eventsForAsk(ORG_LISS, askId);

    const res = await declineAsk(
      reqAs(LIAISON, `http://test/api/asks/${askId}/decline`, {
        method: "POST",
        body: { offerId: OFF_HV_SPEAKER },
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ask.status).toBe("declined");

    const after = await eventsForAsk(ORG_LISS, askId);
    const added = after.filter((e) => !before.some((b) => b.id === e.id));
    expect(added.length).toBe(2);
    expect(new Set(added.map((e) => e.id)).size).toBe(2);
    for (const e of added) {
      expect(e.kind).toBe("declined");
    }
  });
});

// --- advisor approve/reject: pending-only by matching org ----------------

describe("POST /api/asks/[id]/approve and /reject (advisor)", () => {
  it("approves a pending ask on the advisor's own org → open (Req 9.3)", async () => {
    const askId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_HSBIO,
    });

    const res = await approveAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/approve`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ask.status).toBe("open");
    expect((await getRepo().getAsk(askId))?.status).toBe("open");
  });

  it("rejects a pending ask on the advisor's own org → rejected (Req 9.5)", async () => {
    const askId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_HSBIO,
    });

    const res = await rejectAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/reject`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ask.status).toBe("rejected");
    expect((await getRepo().getAsk(askId))?.status).toBe("rejected");
  });

  it("refuses approve from a non-pending status, leaving it unchanged (409, Req 9.3)", async () => {
    const askId = await seedAsk({ status: "open", orgId: ORG_HSBIO });

    const res = await approveAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/approve`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/unchanged|awaiting/i);
    expect((await getRepo().getAsk(askId))?.status).toBe("open");
  });

  it("refuses reject from a non-pending status, leaving it unchanged (409, Req 9.5)", async () => {
    const askId = await seedAsk({ status: "matched", orgId: ORG_HSBIO });

    const res = await rejectAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/reject`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(409);
    expect((await getRepo().getAsk(askId))?.status).toBe("matched");
  });

  it("denies a mismatched advisor approving a pending ask on a DIFFERENT org, unchanged (403, Req 9.4)", async () => {
    // The seeded advisor (acc-advisor) belongs to org-hsbio; the pending ask
    // lives on org-synbio, so approve must be denied with no change.
    const askId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_SYNBIO,
    });

    const res = await approveAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/approve`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not authorized|another|unchanged/i);
    expect((await getRepo().getAsk(askId))?.status).toBe(
      "pending_advisor_approval",
    );
  });

  it("denies a mismatched advisor rejecting a pending ask on a DIFFERENT org, unchanged (403, Req 9.4)", async () => {
    const askId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_SYNBIO,
    });

    const res = await rejectAsk(
      reqAs(ADVISOR, `http://test/api/asks/${askId}/reject`, {
        method: "POST",
      }),
      { params: { id: askId } },
    );
    expect(res.status).toBe(403);
    expect((await getRepo().getAsk(askId))?.status).toBe(
      "pending_advisor_approval",
    );
  });
});

// --- advisor queue scoping (Req 9.5, 9.6) --------------------------------

describe("GET /api/advisor/queue", () => {
  it("returns only the advisor's own org pending asks (Req 9.5, 9.6)", async () => {
    // Seed a pending ask on the advisor's org (org-hsbio) and one on a
    // different org (org-synbio). Only the hsbio one may appear.
    const mineId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_HSBIO,
    });
    const othersId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_SYNBIO,
    });
    // An open ask on the advisor's org must NOT appear (queue is pending-only).
    const openMineId = await seedAsk({ status: "open", orgId: ORG_HSBIO });

    const res = await advisorQueue(
      reqAs(ADVISOR, "http://test/api/advisor/queue"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.asks.map((a: { id: string }) => a.id);

    expect(ids).toContain(mineId);
    expect(ids).not.toContain(othersId);
    expect(ids).not.toContain(openMineId);
    // Every returned ask is pending and belongs to the advisor's org.
    for (const a of body.asks as Ask[]) {
      expect(a.status).toBe("pending_advisor_approval");
      expect(a.orgId).toBe(ORG_HSBIO);
    }
  });

  it("scopes to the acting advisor's own org when a different advisor asks (Req 9.5)", async () => {
    // A synthetic advisor bound to org-synbio sees its own org's pending asks
    // only — never org-hsbio's.
    const synAdvisor = spyAdvisorFor(ORG_SYNBIO, "acc-advisor-synbio-test");
    const synId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_SYNBIO,
    });
    const hsbioId = await seedAsk({
      status: "pending_advisor_approval",
      orgId: ORG_HSBIO,
    });

    const res = await advisorQueue(
      reqAs(synAdvisor, "http://test/api/advisor/queue"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids: string[] = body.asks.map((a: { id: string }) => a.id);
    expect(ids).toContain(synId);
    expect(ids).not.toContain(hsbioId);
    for (const a of body.asks as Ask[]) {
      expect(a.orgId).toBe(ORG_SYNBIO);
    }
  });
});
