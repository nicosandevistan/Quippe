import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as getOrg } from "@/app/api/org/[id]/route";
import { POST as postHandoff } from "@/app/api/org/[id]/handoff/route";
import { getRepo } from "@/lib/data/repo";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import type { Account, AccountId, OrgId, Role } from "@/lib/schemas";

/**
 * Unit tests for the organization and handoff API routes
 * (Task 16.2; Req 2.5, 2.6, 3.4, 3.5).
 *
 * These exercise the live route handlers (`GET /api/org/[id]` and
 * `POST /api/org/[id]/handoff`) against the PROCESS-WIDE repo singleton
 * (`getRepo()`), which both routes read through. The routes are pure reads plus
 * (for handoff) a call into the AI module's `handoffSummary`, which uses the
 * MOCK provider by default — so every case here runs offline with no network
 * and no secret.
 *
 * Real seed ids used (from src/lib/data/seed.json):
 *   - acc-officer   club_officer bound to org-liss (the only officer account)
 *   - acc-member    club_member  bound to org-liss (read-only org view)
 *   - acc-advisor   club_advisor bound to org-hsbio (the seeded advisor)
 *   - org-liss      college club WITH 6 seeded timeline events (ev-liss-1..6) —
 *                   used for the sorted-order and member-read-only assertions
 *   - org-synbio    a seeded org that exists but has NO timeline events — used
 *                   for the empty-timeline and empty-timeline-handoff cases
 *   - org-nope      an id that does NOT exist in the seed — used for 404
 *
 * Reaching the 404 and empty-timeline paths (documented):
 *   The GET and handoff routes both check `session.orgId === id` BEFORE the
 *   repo org lookup, and an org-role account only ever views/acts on its OWN
 *   org. The seeded officer is bound to org-liss (which exists and has events),
 *   so with real accounts alone neither the 404 path (nonexistent org) nor the
 *   empty-timeline path (existing org with no events) is reachable. To reach
 *   them we mint a synthetic club_officer bound to the TARGET org by spying on
 *   the singleton repo's `getAccount` (exactly how the existing accept/decline
 *   advisor tests reach a mismatched advisor). All other repo methods stay
 *   real, so the org lookup and timeline read run against the genuine seed:
 *     - officer bound to "org-nope"   → GET/POST reaches the real repo lookup,
 *       which returns null → 404.
 *     - officer bound to "org-synbio" → session matches, org exists, timeline
 *       read returns [] → emptyTimeline true / handoff fallback.
 *   Every spy is restored after each test so no cross-test state leaks.
 *
 * Unknown-id handoff fallback (documented, not asserted at the route level):
 *   Forcing the bad-refs (`handoff_fallback` on an out-of-scope id) case would
 *   require the mock provider to echo an id that is NOT among the input events'
 *   refs. The mock deliberately echoes only the allowed ids the prompt
 *   declares, so it never fabricates an out-of-scope id and this sub-case is
 *   not reproducible through the route without editing src. That rejection is
 *   enforced by the AI wrapper's id-scope guard (`validateReferencedIds`),
 *   already unit-tested in tests/unit/ai-run.test.ts, and this route surfaces
 *   its typed fallback verbatim. Here we assert the other fallback trigger the
 *   route reaches deterministically: an empty timeline (Req 3.5).
 */

// --- Request helper ------------------------------------------------------

/** Build a NextRequest carrying the session cookie for a given account id. */
function reqAs(
  accountId: string,
  url: string,
  method: "GET" | "POST" = "GET",
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${accountId}` },
  });
}

const OFFICER = "acc-officer";
const MEMBER = "acc-member";
const ADVISOR = "acc-advisor";

const ORG_LISS = "org-liss";
const ORG_SYNBIO = "org-synbio"; // exists in the seed, has no timeline events
const ORG_NOPE = "org-nope"; // does not exist in the seed

const ORG_BASE = "http://localhost/api/org";

/**
 * Make `readSession` resolve a synthetic club_officer bound to `orgId` by
 * spying on the singleton repo's `getAccount`. Every other repo method stays
 * real, so the org lookup and timeline read hit the genuine seed. Returns the
 * synthetic account id to use as the cookie value.
 */
function spyOfficerFor(orgId: string, accountId: string): string {
  const repo = getRepo();
  const account: Account = {
    id: accountId as AccountId,
    role: "club_officer" as Role,
    orgId: orgId as OrgId,
  };
  vi.spyOn(repo, "getAccount").mockImplementation(async (id) =>
    id === (accountId as AccountId) ? account : null,
  );
  return accountId;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- GET /api/org/[id] ---------------------------------------------------

describe("GET /api/org/[id]", () => {
  it("returns 404 for an org that does not exist (Req 2.6)", async () => {
    // A synthetic officer bound to the nonexistent org so the ownership check
    // passes and the route reaches the real repo lookup, which returns null.
    const account = spyOfficerFor(ORG_NOPE, "acc-officer-nope");
    const res = await getOrg(reqAs(account, `${ORG_BASE}/${ORG_NOPE}`), {
      params: { id: ORG_NOPE },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("reports an empty timeline for an existing org with no events (Req 2.5)", async () => {
    // org-synbio exists in the seed but has zero timeline events.
    const account = spyOfficerFor(ORG_SYNBIO, "acc-officer-synbio");
    const res = await getOrg(reqAs(account, `${ORG_BASE}/${ORG_SYNBIO}`), {
      params: { id: ORG_SYNBIO },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organization: { id: string };
      timeline: unknown[];
      emptyTimeline: boolean;
    };
    expect(body.organization.id).toBe(ORG_SYNBIO);
    expect(body.timeline).toEqual([]);
    expect(body.emptyTimeline).toBe(true);
  });

  it("returns the profile with a reverse-chron sorted timeline for the officer's own org (Req 2.1, 2.2, 2.4)", async () => {
    // acc-officer is really bound to org-liss (6 seeded events) — no spy.
    const res = await getOrg(reqAs(OFFICER, `${ORG_BASE}/${ORG_LISS}`), {
      params: { id: ORG_LISS },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organization: { id: string; name: string };
      timeline: { date: string; seq: number }[];
      emptyTimeline: boolean;
    };
    expect(body.organization.id).toBe(ORG_LISS);
    expect(body.organization.name).toBe("Latinos in STEM Society");
    expect(body.emptyTimeline).toBe(false);
    expect(body.timeline.length).toBeGreaterThanOrEqual(5);

    // Ordered by date descending, then seq ascending (sortTimeline contract).
    for (let i = 1; i < body.timeline.length; i++) {
      const prev = body.timeline[i - 1];
      const cur = body.timeline[i];
      if (prev.date === cur.date) {
        expect(prev.seq).toBeLessThanOrEqual(cur.seq);
      } else {
        expect(prev.date > cur.date).toBe(true);
      }
    }
  });

  it("allows a club member to read their own org (read-only view, Req 2.3)", async () => {
    // acc-member is bound to org-liss; the GET route is a pure read, so a
    // member may view the page (no mutation is exposed).
    const res = await getOrg(reqAs(MEMBER, `${ORG_BASE}/${ORG_LISS}`), {
      params: { id: ORG_LISS },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { organization: { id: string } };
    expect(body.organization.id).toBe(ORG_LISS);
  });

  it("denies viewing another org when the session org differs (403, Req 1.4/2.3)", async () => {
    // acc-member (org-liss) tries to read org-synbio → ownership scope denies.
    const res = await getOrg(reqAs(MEMBER, `${ORG_BASE}/${ORG_SYNBIO}`), {
      params: { id: ORG_SYNBIO },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not authorized|different organization/i);
  });
});

// --- POST /api/org/[id]/handoff ------------------------------------------

describe("POST /api/org/[id]/handoff", () => {
  it("returns the typed fallback on an empty timeline (Req 3.5)", async () => {
    // Synthetic officer bound to org-synbio (exists, no events). The AI module
    // returns the handoff_fallback without calling the model for zero events.
    const account = spyOfficerFor(ORG_SYNBIO, "acc-officer-synbio");
    const res = await postHandoff(
      reqAs(account, `${ORG_BASE}/${ORG_SYNBIO}/handoff`, "POST"),
      { params: { id: ORG_SYNBIO } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      summary: unknown;
      fallback: { kind: string };
    };
    expect(body.ok).toBe(false);
    expect(body.summary).toBeNull();
    expect(body.fallback.kind).toBe("handoff_fallback");
  });

  it("returns 404 when generating a handoff for a nonexistent org (Req 2.6)", async () => {
    const account = spyOfficerFor(ORG_NOPE, "acc-officer-nope");
    const res = await postHandoff(
      reqAs(account, `${ORG_BASE}/${ORG_NOPE}/handoff`, "POST"),
      { params: { id: ORG_NOPE } },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("generates a schema-valid summary from the org's own timeline (Req 3.1, 3.3)", async () => {
    // acc-officer (org-liss, 6 events) via the mock provider: referencedIds are
    // echoed only from the org's own event refs (CP9), proving the summary is
    // derived from this org's timeline alone.
    const ownRefs = new Set(
      (await getRepo().listTimelineEvents(ORG_LISS as OrgId)).flatMap(
        (e) => e.refs,
      ),
    );
    const res = await postHandoff(
      reqAs(OFFICER, `${ORG_BASE}/${ORG_LISS}/handoff`, "POST"),
      { params: { id: ORG_LISS } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      summary: { referencedIds: string[] } | null;
    };
    expect(body.ok).toBe(true);
    expect(body.summary).not.toBeNull();
    // Every referenced id is drawn from this org's own event refs (no leakage).
    for (const id of body.summary!.referencedIds) {
      expect(ownRefs.has(id)).toBe(true);
    }
  });

  it("denies handoff generation for a club member (not an officer, Req 3.1)", async () => {
    // acc-member (org-liss) cannot generate a handoff — officers only.
    const res = await postHandoff(
      reqAs(MEMBER, `${ORG_BASE}/${ORG_LISS}/handoff`, "POST"),
      { params: { id: ORG_LISS } },
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not permitted|club officer/i);
  });

  it("denies handoff generation for a club advisor (not an officer, Req 3.1)", async () => {
    // acc-advisor (org-hsbio) is a non-officer role → denied by the guard.
    const res = await postHandoff(
      reqAs(ADVISOR, `${ORG_BASE}/${"org-hsbio"}/handoff`, "POST"),
      { params: { id: "org-hsbio" } },
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not permitted|club officer/i);
  });
});
