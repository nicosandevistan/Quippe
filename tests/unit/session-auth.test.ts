import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/session/route";
import { requireRole } from "@/app/api/_lib/guard";
import { landingFor, SESSION_COOKIE } from "@/app/api/_lib/session";
import { createRepoFromSeed } from "@/lib/data/repo";
import { Role, type AccountId } from "@/lib/schemas";

/**
 * Session and authorization unit tests (Task 15.2; Req 1.1, 1.4, 1.5, 1.6).
 *
 * These exercise the thin session route and the shared role guard directly as
 * App Router handlers: we build a NextRequest (URL, method, JSON body, cookies)
 * and assert on `response.status` and the parsed JSON body. Session resolution
 * reads from the repo's seeded demo accounts (one per role), which are frozen,
 * so no cross-test state leaks.
 */

const BASE_URL = "http://localhost/api/session";

/** The seeded demo account ids, by role (from seed.json; Req 1.1). */
const ACCOUNT_BY_ROLE: Record<Role, string> = {
  club_officer: "acc-officer",
  club_advisor: "acc-advisor",
  club_member: "acc-member",
  company_liaison: "acc-liaison",
  erg_lead: "acc-erglead",
};

/** A GET request to the session route. */
function getRequest(): NextRequest {
  return new NextRequest(new URL(BASE_URL), { method: "GET" });
}

/** A POST request with a JSON body selecting `accountId`. */
function selectRequest(body: unknown): NextRequest {
  return new NextRequest(new URL(BASE_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * A request that carries a signed-in session for `accountId`, via the Cookie
 * header — exactly how the guard reads the session off the request.
 */
function requestWithSession(accountId: string): NextRequest {
  return new NextRequest(new URL("http://localhost/api/anything"), {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${accountId}` },
  });
}

describe("GET /api/session — one account per role is offered (Req 1.1)", () => {
  it("returns exactly one account for each role with no duplicates", async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      accounts: Array<{ id: string; role: Role }>;
    };

    // Exactly one account per role: the multiset of roles equals the Role enum.
    const roles = body.accounts.map((a) => a.role).sort();
    const expected = [...Role.options].sort();
    expect(roles).toEqual(expected);

    // No duplicates: the set of roles equals the full Role enum.
    expect(new Set(roles)).toEqual(new Set(Role.options));
    expect(body.accounts).toHaveLength(Role.options.length);
  });

  it("reports no current session when the request has no cookie", async () => {
    const res = await GET(getRequest());
    const body = (await res.json()) as { current: unknown };
    expect(body.current).toBeNull();
  });
});

describe("POST /api/session — selecting binds role + landing (Req 1.3, 1.6)", () => {
  it("binds role and landing and sets the session cookie for a valid account", async () => {
    // Pick the officer account; landing is derived from the account bindings.
    const accountId = ACCOUNT_BY_ROLE.club_officer;
    const res = await POST(selectRequest({ accountId }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      accountId: string;
      role: Role;
      landing: string;
    };
    expect(body.accountId).toBe(accountId);
    expect(body.role).toBe("club_officer");

    // Landing must match landingFor for the resolved session.
    const resolved = await createRepoFromSeed().getAccount(
      accountId as AccountId,
    );
    expect(resolved).not.toBeNull();
    const expectedLanding = landingFor({
      accountId: resolved!.id,
      role: resolved!.role,
      orgId: resolved!.orgId,
      companyId: resolved!.companyId,
      ergId: resolved!.ergId,
    });
    expect(body.landing).toBe(expectedLanding);
    // Officer lands on their own org page.
    expect(body.landing).toBe("/org/org-liss");

    // The session cookie is set to the chosen account id.
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe(accountId);
  });

  it("returns a landing consistent with landingFor for every role", async () => {
    for (const role of Role.options) {
      const accountId = ACCOUNT_BY_ROLE[role];
      const res = await POST(selectRequest({ accountId }));
      expect(res.status, `role ${role}`).toBe(200);

      const body = (await res.json()) as {
        accountId: string;
        role: Role;
        landing: string;
      };
      const acc = await createRepoFromSeed().getAccount(accountId as AccountId);
      const expectedLanding = landingFor({
        accountId: acc!.id,
        role: acc!.role,
        orgId: acc!.orgId,
        companyId: acc!.companyId,
        ergId: acc!.ergId,
      });
      expect(body.role, `role ${role}`).toBe(role);
      expect(body.landing, `landing for ${role}`).toBe(expectedLanding);
      expect(res.cookies.get(SESSION_COOKIE)?.value, `cookie for ${role}`).toBe(
        accountId,
      );
    }
  });

  it("reselecting a different account replaces the session (Req 1.6)", async () => {
    // First sign in as the officer.
    const first = await POST(
      selectRequest({ accountId: ACCOUNT_BY_ROLE.club_officer }),
    );
    const firstBody = (await first.json()) as { role: Role; landing: string };
    expect(firstBody.role).toBe("club_officer");
    expect(first.cookies.get(SESSION_COOKIE)?.value).toBe(
      ACCOUNT_BY_ROLE.club_officer,
    );

    // Then reselect the liaison: the new role/landing is returned and the
    // cookie now carries the new account id (old session replaced).
    const second = await POST(
      selectRequest({ accountId: ACCOUNT_BY_ROLE.company_liaison }),
    );
    const secondBody = (await second.json()) as { role: Role; landing: string };
    expect(secondBody.role).toBe("company_liaison");
    expect(secondBody.landing).toBe("/company/co-harborview");
    expect(second.cookies.get(SESSION_COOKIE)?.value).toBe(
      ACCOUNT_BY_ROLE.company_liaison,
    );
    // The replacement cookie is not the old officer account.
    expect(second.cookies.get(SESSION_COOKIE)?.value).not.toBe(
      ACCOUNT_BY_ROLE.club_officer,
    );
  });

  it("rejects an unknown account with 404 and sets no session cookie (Req 1.5)", async () => {
    const res = await POST(selectRequest({ accountId: "acc-nobody" }));
    expect(res.status).toBe(404);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects an invalid body with 400", async () => {
    const res = await POST(selectRequest({ notAccountId: 1 }));
    expect(res.status).toBe(400);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});

describe("requireRole — out-of-role action denied, data unchanged (Req 1.4, 1.5)", () => {
  it("denies a wrong-role request with 403 and a role-appropriate message", async () => {
    // Signed in as a club officer, acting on a liaison-only action.
    const req = requestWithSession(ACCOUNT_BY_ROLE.club_officer);
    const result = await requireRole(req, ["company_liaison"]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected denial");
    expect(result.response.status).toBe(403);

    const body = (await result.response.json()) as { error: string };
    // Role-appropriate: the message names the signed-in role and the role the
    // action needs, in human-readable form.
    expect(body.error).toContain("club officer");
    expect(body.error).toContain("company liaison");
  });

  it("names multiple allowed roles in the denial message", async () => {
    const req = requestWithSession(ACCOUNT_BY_ROLE.club_member);
    const result = await requireRole(req, ["club_officer", "company_liaison"]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected denial");
    const body = (await result.response.json()) as { error: string };
    expect(body.error).toContain("club member");
    expect(body.error).toContain("club officer");
    expect(body.error).toContain("company liaison");
  });

  it("returns 401 when there is no session", async () => {
    const req = new NextRequest(new URL("http://localhost/api/anything"), {
      method: "POST",
    });
    const result = await requireRole(req, ["company_liaison"]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected denial");
    expect(result.response.status).toBe(401);
  });

  it("allows an in-role request and returns the resolved session", async () => {
    const req = requestWithSession(ACCOUNT_BY_ROLE.company_liaison);
    const result = await requireRole(req, ["company_liaison"]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected allow");
    expect(result.session.role).toBe("company_liaison");
    expect(result.session.accountId).toBe(ACCOUNT_BY_ROLE.company_liaison);
  });

  it("leaves application data unchanged on denial (Req 1.5)", async () => {
    // A denied guard never touches the repo, so the store is identical before
    // and after. Assert that by comparing repo counts around the call.
    const repo = createRepoFromSeed();
    const before = {
      accounts: (await repo.listDemoAccounts()).length,
      offers: (await repo.listOffers()).length,
      asks: (await repo.listAsks()).length,
    };

    const req = requestWithSession(ACCOUNT_BY_ROLE.club_officer);
    const result = await requireRole(req, ["company_liaison"]);
    expect(result.ok).toBe(false);

    const after = {
      accounts: (await repo.listDemoAccounts()).length,
      offers: (await repo.listOffers()).length,
      asks: (await repo.listAsks()).length,
    };
    expect(after).toEqual(before);
  });
});
