import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as postSession } from "@/app/api/session/route";
import { POST as composeRoute } from "@/app/api/asks/compose/route";
import { POST as confirmRoute } from "@/app/api/asks/confirm/route";
import { POST as bomRoute } from "@/app/api/supplies/bom/route";
import { POST as coverageRoute } from "@/app/api/supplies/coverage/route";
import { POST as protocolRoute } from "@/app/api/supplies/protocol/route";
import { GET as dashboardRoute } from "@/app/api/company/[id]/dashboard/route";
import { POST as acceptRoute } from "@/app/api/asks/[id]/accept/route";
import { GET as advisorQueueRoute } from "@/app/api/advisor/queue/route";
import { POST as approveRoute } from "@/app/api/asks/[id]/approve/route";
import { GET as orgRoute } from "@/app/api/org/[id]/route";
import { POST as handoffRoute } from "@/app/api/org/[id]/handoff/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import type { Ask, BOM, CoverageReport } from "@/lib/schemas";

/**
 * The PROJECT_BRIEF.md §10 demo script, end to end through the real route
 * handlers (Task 26.1). Offline: the AI module runs on its mock provider.
 *
 * The steps run in order and share state (one `describe`, ordered `it`s), and
 * this file has its own module state, so the repo starts from a fresh seed.
 * Every assertion message names its demo step so a failure points at the
 * broken step.
 */

const SCRIPT_TEXT =
  "We're a 25-person first-gen club. We want to run a DNA extraction and gel electrophoresis workshop, visit a real lab, and meet people in industry who share our background.";

const LIAISON = "acc-liaison"; // company_liaison @ co-harborview
const ADVISOR = "acc-advisor"; // club_advisor @ org-hsbio
const HAZARDOUS_ITEM_IDS = [
  "inv-hv-etbr",
  "inv-hv-phenol",
  "inv-tp-acrylamide",
  "inv-tp-methanol",
  "inv-gr-bleach",
  "inv-hv-ethanol",
];

function req(
  cookieValue: string | null,
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue !== null) headers.cookie = `${SESSION_COOKIE}=${cookieValue}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://test${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface DashboardEntry {
  askId: string;
  reasons: string[];
  offer: { id: string };
}

// Shared state across the ordered steps.
let officer = "";
let drafts: Ask[] = [];
const confirmed: Partial<Record<Ask["type"], Ask>> = {};
let bom: BOM;
let collegeCoverage: CoverageReport;
const acceptedAskIds: string[] = [];

describe("demo path (PROJECT_BRIEF.md §10)", () => {
  it("step 1: the officer signs in and lands on their org page", async () => {
    const res = await postSession(
      req(null, "/api/session", "POST", { accountId: "acc-officer" }),
    );
    expect(res.status, "step 1: sign-in status").toBe(200);
    const body = await res.json();
    expect(body.landing, "step 1: landing").toBe("/org/org-liss");
    const cookie = res.cookies.get(SESSION_COOKIE)?.value;
    expect(cookie, "step 1: response sets the session cookie").toBeTruthy();
    expect(
      res.headers.get("set-cookie") ?? "",
      "step 1: Set-Cookie header names quippe_session",
    ).toContain(`${SESSION_COOKIE}=`);
    officer = cookie!;
  });

  it("step 2: the script text composes into supplies, lab tour, and ERG drafts", async () => {
    const res = await composeRoute(
      req(officer, "/api/asks/compose", "POST", { text: SCRIPT_TEXT }),
    );
    expect(res.status, "step 2: compose status").toBe(200);
    const body = await res.json();
    expect(body.ok, "step 2: compose ok").toBe(true);
    drafts = body.drafts;
    expect(
      drafts.map((d) => d.type),
      "step 2: draft types",
    ).toEqual(["supplies", "lab_tour", "erg_event"]);
  });

  it("step 3: confirming each draft saves it as matched", async () => {
    for (const draft of drafts) {
      // The confirmed ask is the draft's fields minus id/orgId/status, which
      // the server owns.
      const fields = Object.fromEntries(
        Object.entries(draft).filter(
          ([key]) => !["id", "orgId", "status"].includes(key),
        ),
      );
      const res = await confirmRoute(
        req(officer, "/api/asks/confirm", "POST", { asks: [fields] }),
      );
      expect(res.status, `step 3: confirm ${draft.type} status`).toBe(201);
      const body = await res.json();
      expect(body.asks.length, `step 3: confirm ${draft.type} count`).toBe(1);
      const saved: Ask = body.asks[0];
      expect(saved.status, `step 3: ${draft.type} saved as matched`).toBe(
        "matched",
      );
      expect(saved.orgId, `step 3: ${draft.type} org`).toBe("org-liss");
      confirmed[saved.type] = saved;
    }
    expect(Object.keys(confirmed).sort(), "step 3: all three saved").toEqual(
      ["erg_event", "lab_tour", "supplies"],
    );
  });

  it("step 4: coverage shows 8 covered across two companies, 2 missing, and an adapted protocol", async () => {
    const bomRes = await bomRoute(
      req(officer, "/api/supplies/bom", "POST", {
        experiment: "DNA extraction and gel electrophoresis",
        groupSize: 25,
      }),
    );
    expect(bomRes.status, "step 4: bom status").toBe(200);
    bom = (await bomRes.json()).bom;
    expect(bom.lines.length, "step 4: bom line count").toBe(10);

    const covRes = await coverageRoute(
      req(officer, "/api/supplies/coverage", "POST", { bom }),
    );
    expect(covRes.status, "step 4: coverage status").toBe(200);
    const covBody = await covRes.json();
    collegeCoverage = covBody.coverage;
    const covered = collegeCoverage.lines.filter((l) => l.status === "covered");
    const missing = collegeCoverage.lines.filter((l) => l.status === "missing");
    expect(covered.length, "step 4: covered count").toBe(8);
    expect(missing.length, "step 4: missing count").toBe(2);
    const supplierNames = new Set(
      collegeCoverage.lines
        .map((l) => l.supplyingCompanyId)
        .filter((id) => id !== undefined)
        .map((id) => covBody.companyNames[id as string]),
    );
    expect(supplierNames, "step 4: supplying companies").toEqual(
      new Set(["Harborview Therapeutics", "Tidepool Biosciences"]),
    );

    const protoRes = await protocolRoute(
      req(officer, "/api/supplies/protocol", "POST", {
        coverage: collegeCoverage,
      }),
    );
    expect(protoRes.status, "step 4: protocol status").toBe(200);
    const protoBody = await protoRes.json();
    expect(protoBody.ok, "step 4: protocol ok").toBe(true);
    const protocol = protoBody.protocol;
    for (const line of missing) {
      expect(
        protocol.missingLineIds,
        `step 4: protocol lists missing line ${line.bomLineId}`,
      ).toContain(line.bomLineId);
    }
    const coverageRefs = new Set(
      collegeCoverage.lines.flatMap((l) => l.itemRefs as string[]),
    );
    for (const ref of protocol.itemRefs as string[]) {
      expect(
        coverageRefs.has(ref),
        `step 4: protocol itemRef ${ref} is in the coverage report`,
      ).toBe(true);
    }
    expect(protocol.hsReviewRequired, "step 4: no HS review").toBe(false);
  });

  it("step 5: the liaison sees the tour with reasons and the ERG offer, then accepts both", async () => {
    const tour = confirmed.lab_tour!;
    const erg = confirmed.erg_event!;

    const dashRes = await dashboardRoute(
      req(LIAISON, "/api/company/co-harborview/dashboard", "GET"),
      { params: { id: "co-harborview" } },
    );
    expect(dashRes.status, "step 5: dashboard status").toBe(200);
    const matches: DashboardEntry[] = (await dashRes.json()).matches;
    const tourEntry = matches.find((m) => m.askId === tour.id);
    expect(tourEntry, "step 5: dashboard shows the tour ask").toBeDefined();
    expect(
      tourEntry!.reasons.length,
      "step 5: tour ask has reasons",
    ).toBeGreaterThan(0);
    const ergEntry = matches.find((m) => m.askId === erg.id);
    expect(ergEntry, "step 5: dashboard shows the ERG ask").toBeDefined();
    expect(ergEntry!.offer.id, "step 5: ERG ask fits the ERG offer").toBe(
      "off-hv-erg",
    );
    expect(
      matches.map((m) => m.askId),
      "step 5: the pending HS ask is hidden before approval",
    ).not.toContain("ask-hsbio-supplies");

    for (const [label, ask, entry] of [
      ["tour", tour, tourEntry!],
      ["ERG", erg, ergEntry!],
    ] as const) {
      const res = await acceptRoute(
        req(LIAISON, `/api/asks/${ask.id}/accept`, "POST", {
          offerId: entry.offer.id,
        }),
        { params: { id: ask.id } },
      );
      expect(res.status, `step 5: accept ${label} status`).toBe(200);
      expect(
        (await res.json()).ask.status,
        `step 5: ${label} ask accepted`,
      ).toBe("accepted");
      acceptedAskIds.push(ask.id);
    }
  });

  it("step 6: the advisor approves the in-person request and hazardous items never appear", async () => {
    const queueRes = await advisorQueueRoute(
      req(ADVISOR, "/api/advisor/queue", "GET"),
    );
    expect(queueRes.status, "step 6: queue status").toBe(200);
    const queue: Ask[] = (await queueRes.json()).asks;
    const pending = queue.find((a) => a.id === "ask-hsbio-supplies");
    expect(pending, "step 6: queue holds ask-hsbio-supplies").toBeDefined();
    expect(pending!.deliveryMode, "step 6: pending ask is in person").toBe(
      "in_person",
    );

    const approveRes = await approveRoute(
      req(ADVISOR, "/api/asks/ask-hsbio-supplies/approve", "POST"),
      { params: { id: "ask-hsbio-supplies" } },
    );
    expect(approveRes.status, "step 6: approve status").toBe(200);
    expect(
      (await approveRes.json()).ask.status,
      "step 6: approved ask is matched",
    ).toBe("matched");

    const covRes = await coverageRoute(
      req(ADVISOR, "/api/supplies/coverage", "POST", { bom }),
    );
    expect(covRes.status, "step 6: HS coverage status").toBe(200);
    const hsCoverage: CoverageReport = (await covRes.json()).coverage;
    const allRefs = hsCoverage.lines.flatMap((l) => l.itemRefs as string[]);
    for (const hazardous of HAZARDOUS_ITEM_IDS) {
      expect(allRefs, `step 6: no hazardous item ${hazardous}`).not.toContain(
        hazardous,
      );
    }
    const etbrLine = bom.lines.find((l) => /ethidium bromide/i.test(l.item));
    expect(etbrLine, "step 6: BOM has an ethidium bromide line").toBeDefined();
    expect(
      hsCoverage.lines.find((l) => l.bomLineId === etbrLine!.id)?.status,
      "step 6: ethidium bromide line is missing for the HS club",
    ).toBe("missing");

    const protoRes = await protocolRoute(
      req(ADVISOR, "/api/supplies/protocol", "POST", { coverage: hsCoverage }),
    );
    expect(protoRes.status, "step 6: HS protocol status").toBe(200);
    const protoBody = await protoRes.json();
    expect(protoBody.ok, "step 6: HS protocol ok").toBe(true);
    expect(
      protoBody.protocol.hsReviewRequired,
      "step 6: HS review required",
    ).toBe(true);
    expect(protoBody.protocol.hsReviewText, "step 6: HS review text").toBe(
      "Advisor must review before running",
    );
  });

  it("step 7: the officer's timeline shows everything once, and the handoff summary generates", async () => {
    const orgRes = await orgRoute(req(officer, "/api/org/org-liss", "GET"), {
      params: { id: "org-liss" },
    });
    expect(orgRes.status, "step 7: org status").toBe(200);
    const timeline: { id: string; kind: string; refs: string[] }[] = (
      await orgRes.json()
    ).timeline;

    for (const ask of Object.values(confirmed)) {
      const askEvents = timeline.filter(
        (e) => e.kind === "ask" && e.refs.includes(ask!.id),
      );
      expect(
        askEvents.length,
        `step 7: one "ask" event for the ${ask!.type} ask`,
      ).toBe(1);
    }
    for (const askId of acceptedAskIds) {
      const accepted = timeline.filter(
        (e) => e.kind === "accepted" && e.refs.includes(askId),
      );
      expect(accepted.length, `step 7: one "accepted" event for ${askId}`).toBe(
        1,
      );
    }
    expect(
      timeline.filter((e) => e.id.startsWith("ev-co-")),
      "step 7: no company-copy events on the org timeline",
    ).toEqual([]);

    const handoffRes = await handoffRoute(
      req(officer, "/api/org/org-liss/handoff", "POST"),
      { params: { id: "org-liss" } },
    );
    expect(handoffRes.status, "step 7: handoff status").toBe(200);
    const handoff = await handoffRes.json();
    expect(handoff.ok, "step 7: handoff ok").toBe(true);
    const orgRefs = new Set(timeline.flatMap((e) => e.refs));
    for (const id of handoff.summary.referencedIds as string[]) {
      expect(orgRefs.has(id), `step 7: referenced id ${id} is an org ref`).toBe(
        true,
      );
    }
  });
});
