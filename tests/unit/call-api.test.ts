import { describe, expect, it } from "vitest";
import { GET as orgRoute } from "@/app/api/org/[id]/route";
import { GET as sessionRoute, POST as postSession } from "@/app/api/session/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { callApi } from "@/app/_lib/call-api";

/**
 * `callApi` runs the real route handlers in-process with the cookies it is
 * given (Task 26.1). These tests pass `cookieHeader` explicitly because there
 * is no ambient Next request in Vitest.
 */

const OFFICER_COOKIE = `${SESSION_COOKIE}=acc-officer`;

describe("callApi", () => {
  it("GET /api/session reports the signed-in officer and their landing page", async () => {
    const res = await callApi<{
      accounts: Array<{ id: string; label: string | null }>;
      current: { accountId: string; role: string; landing: string } | null;
    }>(sessionRoute, { path: "/api/session", cookieHeader: OFFICER_COOKIE });
    expect(res.status).toBe(200);
    expect(res.json?.current).toEqual({
      accountId: "acc-officer",
      role: "club_officer",
      landing: "/org/org-liss",
    });
    expect(res.json?.accounts.find((a) => a.id === "acc-officer")?.label).toBeTruthy();
  });

  it("GET /api/session with no cookie has no current session", async () => {
    const res = await callApi<{ current: unknown }>(sessionRoute, {
      path: "/api/session",
      cookieHeader: "",
    });
    expect(res.status).toBe(200);
    expect(res.json?.current).toBeNull();
  });

  it("passes params and cookies to GET /api/org/[id]: the officer gets their org", async () => {
    const res = await callApi<{ organization: { id: string }; timeline: unknown[] }>(
      orgRoute,
      {
        path: "/api/org/org-liss",
        params: { id: "org-liss" },
        cookieHeader: OFFICER_COOKIE,
      },
    );
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.json?.organization.id).toBe("org-liss");
    expect(Array.isArray(res.json?.timeline)).toBe(true);
  });

  it("GET /api/org/[id] with no cookie is 401", async () => {
    const res = await callApi(orgRoute, {
      path: "/api/org/org-liss",
      params: { id: "org-liss" },
      cookieHeader: "",
    });
    expect(res.status).toBe(401);
    expect(res.ok).toBe(false);
  });

  it("sends a JSON body and exposes the response's Set-Cookie", async () => {
    const res = await callApi<{ landing: string }>(postSession, {
      method: "POST",
      path: "/api/session",
      body: { accountId: "acc-liaison" },
      cookieHeader: "",
    });
    expect(res.status).toBe(200);
    expect(res.json?.landing).toBe("/company/co-harborview");
    const cookie = res.response.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe("acc-liaison");
    expect(cookie?.httpOnly).toBe(true);
  });
});
