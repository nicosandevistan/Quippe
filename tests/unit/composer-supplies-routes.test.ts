import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as composeRoute } from "@/app/api/asks/compose/route";
import { POST as confirmRoute } from "@/app/api/asks/confirm/route";
import { POST as bomRoute } from "@/app/api/supplies/bom/route";
import { POST as coverageRoute } from "@/app/api/supplies/coverage/route";
import { POST as protocolRoute } from "@/app/api/supplies/protocol/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { getRepo } from "@/lib/data/repo";
import type {
  Account,
  AccountId,
  Ask,
  BOM,
  CoverageReport,
  OrgId,
} from "@/lib/schemas";

/**
 * Unit tests for the ask-composer and supplies API routes
 * (Task 19.3; Req 8.2, 8.8, 9.1, 10.2, 11.2, 12.2, 12.4, 12.6).
 *
 * These exercise the live route handlers against the PROCESS-WIDE repo
 * singleton (`getRepo()`). The routes read inventory/orgs from the genuine
 * seed and (for confirm) write asks into the shared store. To stay robust to
 * that shared, order-dependent store the tests:
 *   - mint UNIQUE ids (`crypto.randomUUID`) for any ask they persist, so cases
 *     never collide;
 *   - assert "nothing persisted" via a BEFORE/AFTER delta of `listAsks`;
 *   - assert "ask saved" via a follow-up `getAsk` / `listAsks` read;
 *   - restore all spies after every test.
 *
 * The AI module runs against its MOCK provider by default (offline, no
 * network, no secret), returning schema-valid canned output: composeAsks → one
 * draft ask, generateBom → a 2-line BOM, writeProtocol → a protocol echoing
 * only the in-scope item ids and the missing-line ids the prompt declared.
 *
 * Real seed ids used (src/lib/data/seed.json):
 *   - acc-officer   club_officer bound to org-liss (college_club, NOT HS)
 *   - org-liss      the officer's college club
 *   - org-hsbio     a high_school_club (its seeded account is an ADVISOR, so a
 *                   synthetic club_officer bound to org-hsbio is minted via a
 *                   getAccount spy to exercise HS in-person gating and HS
 *                   hs_safe coverage filtering)
 * Hazardous (hsSafe === false) seed item ids — must NEVER appear in an HS
 * org's coverage itemRefs: inv-hv-etbr, inv-hv-phenol, inv-tp-acrylamide,
 * inv-tp-methanol, inv-gr-bleach.
 */

// --- Request helper ------------------------------------------------------

/** Build a NextRequest carrying the session cookie and (optional) JSON body. */
function reqAs(
  accountId: string,
  url: string,
  body?: unknown,
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${accountId}`,
  };
  const hasBody = body !== undefined;
  if (hasBody) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
}

const OFFICER = "acc-officer"; // club_officer @ org-liss (college_club)
const ORG_LISS = "org-liss" as OrgId;
const ORG_HSBIO = "org-hsbio" as OrgId; // high_school_club

/** Inventory item ids that are hs_safe === false in the seed. */
const HAZARDOUS_ITEM_IDS = [
  "inv-hv-etbr",
  "inv-hv-phenol",
  "inv-tp-acrylamide",
  "inv-tp-methanol",
  "inv-gr-bleach",
];

/**
 * Mint a synthetic club_officer bound to `orgId` by spying on the singleton
 * repo's `getAccount` (same technique the existing accept/decline/advisor
 * tests use to reach a cross-org advisor). Every other repo method stays real,
 * so the org lookup, inventory read, and ask save all hit the genuine seed.
 * Returns the account id to use as the cookie value.
 */
function spyOfficerFor(orgId: OrgId, accountId: string): string {
  const repo = getRepo();
  const account: Account = {
    id: accountId as AccountId,
    role: "club_officer",
    orgId,
  };
  vi.spyOn(repo, "getAccount").mockImplementation(async (id) =>
    id === (accountId as AccountId) ? account : null,
  );
  return accountId;
}

/** A valid confirmed-ask input: the Ask schema minus id/orgId/status. */
function confirmedAskInput(overrides: Partial<Omit<Ask, "id" | "orgId" | "status">> = {}) {
  return {
    type: "lab_tour" as const,
    groupSize: 10,
    preferredDates: ["2027-02-10"],
    deliveryMode: "in_person" as const,
    topic: "molecular biology lab tour",
    needsSupplies: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- compose: length validation + nothing persisted (Req 8.2, 8.8) -------

describe("POST /api/asks/compose", () => {
  it("rejects empty text with 400 and RETAINS the submitted text (Req 8.2)", async () => {
    const res = await composeRoute(
      reqAs(OFFICER, "http://test/api/asks/compose", { text: "" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    // The entered text is echoed back so the UI can keep it (Req 8.2).
    expect(body.text).toBe("");
    expect(typeof body.error).toBe("string");
  });

  it("rejects over-length text (5001 chars) with 400 and retains the text (Req 8.2)", async () => {
    const tooLong = "a".repeat(5001);
    const res = await composeRoute(
      reqAs(OFFICER, "http://test/api/asks/compose", { text: tooLong }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.text).toBe(tooLong); // full retained input
    expect(String(body.error)).toMatch(/5000/);
  });

  it("returns drafts for valid text and persists NOTHING (Req 8.3, 8.8)", async () => {
    // Nothing-submitted invariant: the org's ask count must be unchanged.
    const before = (await getRepo().listAsks({ orgId: ORG_LISS })).length;

    const res = await composeRoute(
      reqAs(OFFICER, "http://test/api/asks/compose", {
        text: "We need surplus pipette tips and agarose for a DNA extraction workshop.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.drafts)).toBe(true);
    expect(body.drafts.length).toBeGreaterThanOrEqual(1); // mock yields ≥1 draft

    // NOTHING persisted: compose only drafts for review (Req 8.8).
    const after = (await getRepo().listAsks({ orgId: ORG_LISS })).length;
    expect(after).toBe(before);
  });
});

// --- confirm: nothing-submitted + save + HS in-person gate ---------------

describe("POST /api/asks/confirm", () => {
  it("rejects an empty confirmed list with 400 and submits nothing (Req 8.8)", async () => {
    const before = (await getRepo().listAsks({ orgId: ORG_LISS })).length;

    const res = await confirmRoute(
      reqAs(OFFICER, "http://test/api/asks/confirm", { asks: [] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");

    const after = (await getRepo().listAsks({ orgId: ORG_LISS })).length;
    expect(after).toBe(before); // nothing submitted
  });

  it("saves a confirmed college-org ask as status `open` and persists it (Req 8.8, 9.1)", async () => {
    // A unique topic lets us find exactly the ask this case saved in the shared
    // store, independent of any seeded or previously-saved asks.
    const topic = `confirm-open-${crypto.randomUUID()}`;
    const res = await confirmRoute(
      reqAs(OFFICER, "http://test/api/asks/confirm", {
        asks: [confirmedAskInput({ topic })],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.asks.length).toBe(1);
    const saved: Ask = body.asks[0];
    // Non-HS org ⇒ the gate opens the ask (Req 9.1).
    expect(saved.status).toBe("open");
    expect(saved.orgId).toBe(ORG_LISS);
    expect(saved.id.length).toBeGreaterThan(0); // server-minted id

    // Persisted: a follow-up read finds the saved ask.
    const found = await getRepo().getAsk(saved.id);
    expect(found?.status).toBe("open");
    expect(found?.topic).toBe(topic);
  });

  it("holds an in-person HIGH-SCHOOL ask at pending_advisor_approval (Req 9.1)", async () => {
    // org-hsbio is a high_school_club but its seeded account is an advisor, so
    // mint a synthetic club_officer bound to org-hsbio to reach the HS gate.
    const hsOfficer = spyOfficerFor(ORG_HSBIO, "acc-officer-hsbio-test");
    const topic = `confirm-hs-${crypto.randomUUID()}`;

    const res = await confirmRoute(
      reqAs(hsOfficer, "http://test/api/asks/confirm", {
        asks: [
          confirmedAskInput({ topic, deliveryMode: "in_person" }),
        ],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const saved: Ask = body.asks[0];
    // In-person HS ask ⇒ held for advisor review, hidden from companies.
    expect(saved.status).toBe("pending_advisor_approval");
    expect(saved.orgId).toBe(ORG_HSBIO);

    const found = await getRepo().getAsk(saved.id);
    expect(found?.status).toBe("pending_advisor_approval");
  });
});

// --- bom: range validation (Req 10.2) ------------------------------------

describe("POST /api/supplies/bom", () => {
  it("rejects an empty experiment with a per-field error (Req 10.2)", async () => {
    const res = await bomRoute(
      reqAs(OFFICER, "http://test/api/supplies/bom", {
        experiment: "",
        groupSize: 10,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.experiment).toBeTruthy();
  });

  it("rejects an over-length experiment (2001 chars) with a per-field error (Req 10.2)", async () => {
    const res = await bomRoute(
      reqAs(OFFICER, "http://test/api/supplies/bom", {
        experiment: "x".repeat(2001),
        groupSize: 10,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors.experiment).toBeTruthy();
  });

  it("rejects groupSize 0, 501, and a non-integer with per-field errors (Req 10.2)", async () => {
    for (const groupSize of [0, 501, 2.5]) {
      const res = await bomRoute(
        reqAs(OFFICER, "http://test/api/supplies/bom", {
          experiment: "gel electrophoresis of PCR products",
          groupSize,
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.fieldErrors.groupSize).toBeTruthy();
    }
  });

  it("returns a BOM for valid experiment + groupSize (Req 10.1)", async () => {
    const res = await bomRoute(
      reqAs(OFFICER, "http://test/api/supplies/bom", {
        experiment: "gel electrophoresis of PCR products",
        groupSize: 20,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.bom.lines)).toBe(true);
    expect(body.bom.lines.length).toBeGreaterThanOrEqual(1); // mock 2-line BOM
  });
});

// --- coverage: classification + HS hs_safe filter (Req 11.2; Property 1) --

/**
 * A BOM crafted against the genuine seed inventory to force all three coverage
 * classes against co-harborview's non-expired stock:
 *   - covered: agarose powder (reagent) — seed has 500 g at inv-hv-agarose
 *   - partial: TBE buffer (buffer) — seed has only 5 L at inv-hv-tbe
 *   - missing: a category nothing supplies
 */
function classifyingBom(): BOM {
  return {
    lines: [
      {
        id: "bom-cov" as BOM["lines"][number]["id"],
        item: "agarose powder",
        category: "reagent",
        quantity: 10,
        unit: "g",
        purpose: "cast gels",
      },
      {
        id: "bom-part" as BOM["lines"][number]["id"],
        item: "TBE buffer 10x",
        category: "buffer",
        quantity: 999,
        unit: "L",
        purpose: "running buffer",
      },
      {
        id: "bom-miss" as BOM["lines"][number]["id"],
        item: "unobtainium widget",
        category: "nonexistent-category",
        quantity: 5,
        unit: "unit",
        purpose: "there is nothing like this in inventory",
      },
    ],
  };
}

describe("POST /api/supplies/coverage", () => {
  it("classifies each BOM line covered/partial/missing for a college org (Req 11.2)", async () => {
    const res = await coverageRoute(
      reqAs(OFFICER, "http://test/api/supplies/coverage", classifyingBom()),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const coverage: CoverageReport = body.coverage;
    expect(coverage.lines.length).toBe(3);

    const byLine = Object.fromEntries(
      coverage.lines.map((l) => [l.bomLineId, l]),
    );
    expect(byLine["bom-cov"].status).toBe("covered");
    expect(byLine["bom-cov"].supplyingCompanyId).toBeTruthy();
    expect(byLine["bom-part"].status).toBe("partial");
    expect(byLine["bom-miss"].status).toBe("missing");
    // Missing line names no supplying company and refs no item (Req 11.2).
    expect(byLine["bom-miss"].supplyingCompanyId).toBeUndefined();
    expect(byLine["bom-miss"].itemRefs).toEqual([]);
  });

  it("never references an hs_safe === false item for a HIGH-SCHOOL org (Req 12.5; Property 1)", async () => {
    const hsOfficer = spyOfficerFor(ORG_HSBIO, "acc-officer-hsbio-cov-test");
    const res = await coverageRoute(
      reqAs(hsOfficer, "http://test/api/supplies/coverage", classifyingBom()),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const coverage: CoverageReport = body.coverage;

    // No hazardous (hsSafe=false) seed item id may appear in ANY line's refs.
    const allRefs = coverage.lines.flatMap((l) => l.itemRefs as string[]);
    for (const hazardousId of HAZARDOUS_ITEM_IDS) {
      expect(allRefs).not.toContain(hazardousId);
    }
  });
});

// --- protocol: success + missing-lines; fallback path (Req 12.3, 12.4) ---

/** A CoverageReport with a covered line (in-scope item) and a missing line. */
function coverageWithMissing(): CoverageReport {
  return {
    runDate: "2027-01-01",
    lines: [
      {
        bomLineId: "bom-cov" as CoverageReport["lines"][number]["bomLineId"],
        status: "covered",
        needed: 10,
        allocated: 10,
        supplyingCompanyId:
          "co-harborview" as CoverageReport["lines"][number]["supplyingCompanyId"],
        itemRefs: [
          "inv-hv-agarose" as CoverageReport["lines"][number]["itemRefs"][number],
        ],
      },
      {
        bomLineId: "bom-miss" as CoverageReport["lines"][number]["bomLineId"],
        status: "missing",
        needed: 5,
        allocated: 0,
        itemRefs: [],
      },
    ],
  };
}

describe("POST /api/supplies/protocol", () => {
  it("drafts a protocol for a valid coverage report and lists the missing line (Req 12.3)", async () => {
    const coverage = coverageWithMissing();
    const res = await protocolRoute(
      reqAs(OFFICER, "http://test/api/supplies/protocol", { coverage }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const protocol = body.protocol;
    expect(Array.isArray(protocol.steps)).toBe(true);
    expect(protocol.steps.length).toBeGreaterThanOrEqual(1);

    // Every missing BOM line must be listed (Req 12.3). The handler/module
    // falls back if one is omitted, so a successful protocol listing it proves
    // the missing-line guarantee holds.
    expect(protocol.missingLineIds).toContain("bom-miss");

    // id-scope (Req 12.2, Property 9): itemRefs ⊆ the coverage report's item
    // ids. The mock echoes only the in-scope ids the prompt declared. The
    // reject-and-fallback path for an out-of-scope id is covered directly by
    // the AI-wrapper tests (Task 12.2); here we assert the success path keeps
    // refs in scope.
    const allowed = new Set(
      coverage.lines.flatMap((l) => l.itemRefs as string[]),
    );
    for (const ref of protocol.itemRefs as string[]) {
      expect(allowed.has(ref)).toBe(true);
    }
    // A college org requires no advisor review text (Req 12.6).
    expect(protocol.hsReviewRequired).toBe(false);
  });

  it("sets the HS advisor-review text for a high_school_club org (Req 12.6)", async () => {
    const hsOfficer = spyOfficerFor(ORG_HSBIO, "acc-officer-hsbio-proto-test");
    const res = await protocolRoute(
      reqAs(hsOfficer, "http://test/api/supplies/protocol", {
        coverage: coverageWithMissing(),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.protocol.hsReviewRequired).toBe(true);
    expect(String(body.protocol.hsReviewText)).toMatch(/advisor/i);
  });

  it("rejects an invalid coverage report body with 400 (Req 12.1)", async () => {
    const res = await protocolRoute(
      reqAs(OFFICER, "http://test/api/supplies/protocol", {
        coverage: { lines: "not-an-array" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });
});
