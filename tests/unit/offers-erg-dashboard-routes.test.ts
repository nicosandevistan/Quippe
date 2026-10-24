import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as createOffer } from "@/app/api/offers/route";
import { PUT as editOffer } from "@/app/api/offers/[id]/route";
import { POST as createErg } from "@/app/api/ergs/route";
import { GET as getDashboard } from "@/app/api/company/[id]/dashboard/route";
import { getRepo } from "@/lib/data/repo";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import type {
  Account,
  AccountId,
  Ask,
  AskId,
  CompanyId,
  OfferId,
  OrgId,
} from "@/lib/schemas";

/**
 * Unit tests for the offers, ERG, and liaison-dashboard API routes
 * (Task 17.3; Req 4.2, 4.4, 4.6, 5.2, 5.4, 5.5, 5.6, 7.2, 7.4; Property 2).
 *
 * These exercise the live route handlers against the PROCESS-WIDE repo
 * singleton (`getRepo()`), which POST/PUT mutate. So the tests:
 *   - assert via response status and body, and via deltas / follow-up reads,
 *     never assuming the store is pristine across tests;
 *   - use unique field values where identity matters;
 *   - for "rejected → unchanged" cases, assert an error status AND confirm a
 *     follow-up read shows the resource unchanged.
 *
 * Real seed ids used (from src/lib/data/seed.json):
 *   - acc-liaison       company_liaison bound to co-harborview (the only
 *                       usable liaison account; co-harborview HAS ERGs)
 *   - co-harborview     company owning off-hv-* offers, with ERGs
 *   - co-tidepool       owns off-tp-* offers (used for cross-company edit)
 *   - co-granite        has NO ERG (used for the erg_event gate + empty state)
 *   - off-tp-supplies   a co-tidepool offer edited by a co-harborview liaison
 *   - ask-liss-tour     the single seeded ask (org-liss lab_tour, matched)
 *
 * The seed defines no liaison account for co-tidepool / co-granite, so to act
 * as a company that lacks an ERG (and as a company with no matches) we spy on
 * the singleton's `getAccount` to resolve a synthetic co-granite liaison.
 * Everything else — offers, ERGs, inventory, matching — runs against the real
 * seeded store, so the gate and empty-state are exercised for real.
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
  // NextRequest wraps a standard Request and exposes `.cookies`, which is what
  // `readSession` reads; the cookie header seeds that cookie jar.
  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
  });
}

/** A valid supplies offer body (the route owns id + companyId). */
function validOfferBody(notes: string) {
  return {
    type: "supplies",
    capacity: 10,
    availableDates: ["2027-05-01"],
    deliveryMode: "in_person",
    city: "Boston",
    notes,
  };
}

const LIAISON = "acc-liaison";
const HARBORVIEW = "co-harborview" as CompanyId;
const GRANITE = "co-granite" as CompanyId;

/**
 * Make `readSession` resolve a synthetic company_liaison bound to `companyId`
 * by spying on the singleton repo's `getAccount`. All other repo methods stay
 * real. The returned account id is used as the cookie value.
 */
function spyLiaisonFor(companyId: CompanyId, accountId: string): string {
  const repo = getRepo();
  const account: Account = {
    id: accountId as AccountId,
    role: "company_liaison",
    companyId,
  };
  vi.spyOn(repo, "getAccount").mockImplementation(async (id) =>
    id === (accountId as AccountId) ? account : null,
  );
  return accountId;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- POST /api/offers ----------------------------------------------------

describe("POST /api/offers", () => {
  it("rejects an invalid offer type with per-field errors (Req 4.2)", async () => {
    const res = await createOffer(
      reqAs(LIAISON, "http://test/api/offers", {
        method: "POST",
        body: { ...validOfferBody("x"), type: "not_a_real_type" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.type).toBeDefined();
  });

  it("rejects an out-of-bounds capacity with per-field errors (Req 4.6)", async () => {
    // capacity 0 is below the 1..10000 bound.
    const resLow = await createOffer(
      reqAs(LIAISON, "http://test/api/offers", {
        method: "POST",
        body: { ...validOfferBody("x"), capacity: 0 },
      }),
    );
    expect(resLow.status).toBe(400);
    const low = await resLow.json();
    expect(low.fieldErrors?.capacity).toBeDefined();

    // capacity 10001 is above the bound.
    const resHigh = await createOffer(
      reqAs(LIAISON, "http://test/api/offers", {
        method: "POST",
        body: { ...validOfferBody("x"), capacity: 10001 },
      }),
    );
    expect(resHigh.status).toBe(400);
    const high = await resHigh.json();
    expect(high.fieldErrors?.capacity).toBeDefined();
  });

  it("rejects notes longer than 2000 chars with per-field errors (Req 4.6)", async () => {
    const res = await createOffer(
      reqAs(LIAISON, "http://test/api/offers", {
        method: "POST",
        body: { ...validOfferBody("y"), notes: "a".repeat(2001) },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors?.notes).toBeDefined();
  });

  it("creates a valid offer for a company liaison (201) and binds companyId from the session (Req 4.1)", async () => {
    // A client-supplied companyId is ignored; the offer is owned by the
    // session's company (co-harborview).
    const notes = `valid-offer-${crypto.randomUUID()}`;
    const res = await createOffer(
      reqAs(LIAISON, "http://test/api/offers", {
        method: "POST",
        body: { ...validOfferBody(notes), companyId: "co-tidepool" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.offer).toBeDefined();
    expect(body.offer.companyId).toBe("co-harborview");
    expect(body.offer.id).toMatch(/^off-/);
    expect(body.offer.notes).toBe(notes);

    // Delta check: the created offer is now readable under co-harborview.
    const offers = await getRepo().listOffers({ companyId: HARBORVIEW });
    expect(offers.some((o) => o.id === body.offer.id)).toBe(true);
  });

  it("rejects an erg_event offer for a company with no ERG (400, Req 7.4)", async () => {
    // co-granite has no ERG in the seed; act as a co-granite liaison.
    const acct = spyLiaisonFor(GRANITE, "acc-liaison-granite-test");
    const before = await getRepo().listOffers({ companyId: GRANITE });

    const res = await createOffer(
      reqAs(acct, "http://test/api/offers", {
        method: "POST",
        body: {
          type: "erg_event",
          capacity: 10,
          availableDates: ["2027-05-01"],
          deliveryMode: "virtual",
          city: "Worcester",
          notes: "erg event without an erg should be rejected",
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/ERG/i);

    // Unchanged: no offer was persisted for co-granite.
    const after = await getRepo().listOffers({ companyId: GRANITE });
    expect(after.length).toBe(before.length);
  });
});

// --- PUT /api/offers/[id] ------------------------------------------------

describe("PUT /api/offers/[id]", () => {
  it("rejects a cross-company edit (403) and leaves the offer unchanged (Req 4.4)", async () => {
    // co-harborview liaison tries to edit off-tp-supplies, owned by co-tidepool.
    const targetId = "off-tp-supplies" as OfferId;
    const before = (await getRepo().listOffers()).find(
      (o) => o.id === targetId,
    );
    expect(before).toBeDefined();

    const res = await editOffer(
      reqAs(LIAISON, `http://test/api/offers/${targetId}`, {
        method: "PUT",
        body: { ...validOfferBody("hijacked notes"), capacity: 999 },
      }),
      { params: { id: targetId } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not authorized|unchanged|another/i);

    // Unchanged: a follow-up read shows the original offer intact.
    const after = (await getRepo().listOffers()).find((o) => o.id === targetId);
    expect(after).toEqual(before);
    expect(after?.companyId).toBe("co-tidepool");
    expect(after?.notes).not.toBe("hijacked notes");
  });
});

// --- POST /api/ergs ------------------------------------------------------

describe("POST /api/ergs", () => {
  it("rejects out-of-bounds ERG fields with per-field errors (Req 7.2)", async () => {
    const res = await createErg(
      reqAs(LIAISON, "http://test/api/ergs", {
        method: "POST",
        body: {
          name: "", // below min length 1
          description: "d".repeat(2001), // above max 2000
          topics: [], // below min 1
          capacityPerSemester: 0, // below min 1
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeDefined();
    expect(body.fieldErrors.name).toBeDefined();
    expect(body.fieldErrors.description).toBeDefined();
    expect(body.fieldErrors.topics).toBeDefined();
    expect(body.fieldErrors.capacityPerSemester).toBeDefined();
  });

  it("creates a valid ERG (201)", async () => {
    const name = `Test ERG ${crypto.randomUUID()}`;
    const res = await createErg(
      reqAs(LIAISON, "http://test/api/ergs", {
        method: "POST",
        body: {
          name,
          description: "A valid employee resource group for testing.",
          topics: ["mentorship", "outreach"],
          capacityPerSemester: 25,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.erg).toBeDefined();
    expect(body.erg.id).toMatch(/^erg-/);
    expect(body.erg.companyId).toBe("co-harborview");
    expect(body.erg.name).toBe(name);
  });
});

// --- GET /api/company/[id]/dashboard -------------------------------------

describe("GET /api/company/[id]/dashboard", () => {
  it("excludes pending_advisor_approval / rejected asks from matches (Property 2, Req 5.6)", async () => {
    // Seed a pending ask and a rejected ask that would otherwise match
    // co-harborview's lab_tour offer, then confirm neither appears.
    const repo = getRepo();
    const pendingId = `ask-pending-${crypto.randomUUID()}` as AskId;
    const rejectedId = `ask-rejected-${crypto.randomUUID()}` as AskId;
    const base = {
      orgId: "org-liss" as OrgId,
      type: "lab_tour" as const,
      groupSize: 10,
      preferredDates: ["2027-02-10"],
      deliveryMode: "in_person" as const,
      topic: "molecular biology lab tour",
      needsSupplies: false,
    };
    const pending: Ask = {
      ...base,
      id: pendingId,
      status: "pending_advisor_approval",
    };
    const rejected: Ask = { ...base, id: rejectedId, status: "rejected" };
    await repo.saveAsk(pending);
    await repo.saveAsk(rejected);

    const res = await getDashboard(
      reqAs(LIAISON, `http://test/api/company/${HARBORVIEW}/dashboard`),
      { params: { id: HARBORVIEW } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const askIds: string[] = body.matches.map(
      (m: { askId: string }) => m.askId,
    );
    expect(askIds).not.toContain(pendingId);
    expect(askIds).not.toContain(rejectedId);
  });

  it("sorts matches by score descending with a stable tie-break (Req 5.2)", async () => {
    const res = await getDashboard(
      reqAs(LIAISON, `http://test/api/company/${HARBORVIEW}/dashboard`),
      { params: { id: HARBORVIEW } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const matches: Array<{ askId: string; score: number }> = body.matches;
    // Non-increasing scores across the returned array.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
    }
    // Repeated loads of identical data produce identical ordering (Req 5.2).
    const res2 = await getDashboard(
      reqAs(LIAISON, `http://test/api/company/${HARBORVIEW}/dashboard`),
      { params: { id: HARBORVIEW } },
    );
    const body2 = await res2.json();
    expect(body2.matches.map((m: { askId: string }) => m.askId)).toEqual(
      matches.map((m) => m.askId),
    );
  });

  it("surfaces reasons and the noReasons flag per match (Req 5.3, 5.4)", async () => {
    // Seed a virtual speaker ask that matches off-hv-speaker (speaker, virtual,
    // capacity 50, 2027-01-28, no minAge; virtual skips the distance filter),
    // so the dashboard produces at least one real match carrying reasons.
    const matchId = `ask-speaker-${crypto.randomUUID()}` as AskId;
    const matchAsk: Ask = {
      id: matchId,
      orgId: "org-synbio" as OrgId,
      type: "speaker",
      groupSize: 10,
      preferredDates: ["2027-01-28"],
      deliveryMode: "virtual",
      topic: "careers in therapeutics research",
      needsSupplies: false,
      status: "open",
    };
    await getRepo().saveAsk(matchAsk);

    const res = await getDashboard(
      reqAs(LIAISON, `http://test/api/company/${HARBORVIEW}/dashboard`),
      { params: { id: HARBORVIEW } },
    );
    const body = await res.json();
    expect(body.matches.length).toBeGreaterThan(0);
    for (const m of body.matches as Array<{
      reasons: string[];
      noReasons: boolean;
    }>) {
      expect(Array.isArray(m.reasons)).toBe(true);
      // noReasons is the explicit "no reasons available" indicator (Req 5.4).
      expect(m.noReasons).toBe(m.reasons.length === 0);
    }
  });

  it("returns the empty-state for a company with no matches (Req 5.5)", async () => {
    // co-granite offers only supplies + speaker; the single seeded ask is a
    // lab_tour, so nothing matches. Act as a co-granite liaison.
    const acct = spyLiaisonFor(GRANITE, "acc-liaison-granite-dash");
    const res = await getDashboard(
      reqAs(acct, `http://test/api/company/${GRANITE}/dashboard`),
      { params: { id: GRANITE } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.empty).toBe(true);
    expect(body.matches).toEqual([]);
  });

  it("denies a liaison hitting another company's dashboard (403)", async () => {
    // acc-liaison is bound to co-harborview; requesting co-granite's dashboard
    // is an ownership violation.
    const res = await getDashboard(
      reqAs(LIAISON, `http://test/api/company/${GRANITE}/dashboard`),
      { params: { id: GRANITE } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(String(body.error)).toMatch(/another|not authorized|unchanged/i);
  });
});
