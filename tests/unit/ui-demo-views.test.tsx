import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AdvisorResultMessage,
  advisorResultText,
} from "@/components/AdvisorResultMessage";
import {
  DashboardEntryView,
  scorePhrase,
  type DashboardEntry,
} from "@/components/DashboardEntryView";
import {
  HANDOFF_FALLBACK_NOTE,
  HandoffSummaryView,
} from "@/components/HandoffSummaryView";
import { navLinksFor } from "@/components/nav-links";
import { rowsFromCsv } from "@/app/company/[id]/company-types";

/**
 * Role navigation and the presentational pieces added to wire the demo flow
 * through the API (Task 26.1): plain-language text, real buttons and lists,
 * and a status region where results appear.
 */

const hrefs = (links: { href: string }[]) => links.map((l) => l.href);
const labels = (links: { label: string }[]) => links.map((l) => l.label);

describe("navLinksFor", () => {
  it("club officer: club, create asks, plan supplies, switch account", () => {
    const links = navLinksFor({ role: "club_officer", orgId: "org-liss" });
    expect(labels(links)).toEqual([
      "Our club",
      "Create asks",
      "Plan supplies",
      "Switch account",
    ]);
    expect(hrefs(links)).toEqual(["/org/org-liss", "/asks/new", "/supplies", "/login"]);
  });

  it("club member: club and switch account only", () => {
    const links = navLinksFor({ role: "club_member", orgId: "org-liss" });
    expect(hrefs(links)).toEqual(["/org/org-liss", "/login"]);
    expect(labels(links)).toEqual(["Our club", "Switch account"]);
  });

  it("club advisor: approval queue, club supplies, switch account", () => {
    const links = navLinksFor({ role: "club_advisor", orgId: "org-hsbio" });
    expect(labels(links)).toEqual(["Approval queue", "Club supplies", "Switch account"]);
    expect(hrefs(links)).toEqual(["/advisor", "/supplies", "/login"]);
  });

  it("company liaison and ERG lead: company dashboard and switch account", () => {
    for (const role of ["company_liaison", "erg_lead"] as const) {
      const links = navLinksFor({ role, companyId: "co-harborview" });
      expect(labels(links)).toEqual(["Company dashboard", "Switch account"]);
      expect(hrefs(links)).toEqual(["/company/co-harborview", "/login"]);
    }
  });

  it("nobody signed in: no links", () => {
    expect(navLinksFor(null)).toEqual([]);
  });
});

const entry: DashboardEntry = {
  askId: "ask-1",
  orgId: "org-liss",
  orgName: "Latinos in STEM Society",
  offerId: "off-1",
  score: 0.82,
  reasons: ["Topic fits your lab tour", "Within 10 km"],
  noReasons: false,
  matchedOfferIds: ["off-1"],
  ask: {
    id: "ask-1",
    type: "lab_tour",
    topic: "Visit a working biotech lab",
    groupSize: 25,
    deliveryMode: "in_person",
    preferredDates: [],
    status: "matched",
  },
  offer: { id: "off-1", type: "lab_tour", notes: "" },
};

describe("DashboardEntryView", () => {
  it("phrases scores in plain words with the number", () => {
    expect(scorePhrase(0.82)).toBe("Strong match (score 0.82)");
    expect(scorePhrase(0.7)).toMatch(/^Strong match/);
    expect(scorePhrase(0.4)).toMatch(/^Good match/);
    expect(scorePhrase(0.39)).toMatch(/^Possible match/);
  });

  it("shows the ask, reasons as a list, and Accept/Decline buttons for the liaison", () => {
    const html = renderToStaticMarkup(<DashboardEntryView entry={entry} canDecide />);
    expect(html).toContain("Latinos in STEM Society");
    expect(html).toContain("Visit a working biotech lab");
    expect(html).toContain("Group of 25");
    expect(html).toContain("In person");
    expect(html).toContain("Strong match");
    expect(html).toContain("lab tour offer");
    expect(html).toMatch(/<ul[^>]*><li>Topic fits your lab tour<\/li>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Accept<\/button>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Decline<\/button>/);
    expect(html).toContain('role="status"');
  });

  it("is read-only for the ERG lead and shows the status instead", () => {
    const html = renderToStaticMarkup(
      <DashboardEntryView entry={entry} canDecide={false} />,
    );
    expect(html).not.toContain(">Accept<");
    expect(html).toContain("Status: Matched");
  });

  it("says when there are no reasons, and shows a decided ask's status", () => {
    const html = renderToStaticMarkup(
      <DashboardEntryView
        entry={{ ...entry, reasons: [], noReasons: true }}
        canDecide
        result={{ kind: "done", status: "accepted" }}
      />,
    );
    expect(html).toContain("No reasons available");
    expect(html).not.toContain(">Accept<");
    expect(html).toContain("Status: Accepted");
    expect(html).toMatch(/role="status"[^>]*>.*This ask is now accepted/);
  });

  it("shows the API's error text in the status region and keeps the buttons", () => {
    const html = renderToStaticMarkup(
      <DashboardEntryView
        entry={entry}
        canDecide
        result={{ kind: "error", message: "Accepting this ask would exceed the offer's capacity." }}
      />,
    );
    expect(html).toMatch(/role="status"[^>]*>.*exceed the offer&#x27;s capacity/);
    expect(html).toContain(">Accept<");
  });
});

describe("AdvisorResultMessage", () => {
  it("uses plain language for each outcome", () => {
    expect(advisorResultText("approve", "open")).toBe("Approved. Companies can now see it.");
    expect(advisorResultText("approve", "matched")).toBe(
      "Approved. Companies can now see it. It already matches an offer.",
    );
    expect(advisorResultText("reject", "rejected")).toBe("Rejected. Companies won't see it.");
  });

  it("announces the result in a status region that is present before any result", () => {
    expect(renderToStaticMarkup(<AdvisorResultMessage result={null} />)).toContain(
      'role="status"',
    );
    const html = renderToStaticMarkup(
      <AdvisorResultMessage result={{ kind: "done", decision: "approve", status: "matched" }} />,
    );
    expect(html).toMatch(/role="status"[^>]*><p[^>]*>Approved\. Companies can now see it\. It already matches an offer\./);
  });
});

describe("HandoffSummaryView", () => {
  it("renders non-empty sections as lists inside a status region and skips empty ones", () => {
    const html = renderToStaticMarkup(
      <HandoffSummaryView
        result={{
          kind: "summary",
          summary: {
            activeRelationships: ["Harborview Therapeutics: lab tour"],
            contactsByRole: { Liaison: ["Harborview liaison"], Advisor: [] },
            openAsks: [],
            whatWorked: ["Small groups for lab visits"],
            referencedIds: [],
          },
        }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Active relationships");
    expect(html).toMatch(/<ul[^>]*><li>Harborview Therapeutics: lab tour<\/li>/);
    expect(html).toContain("Contacts by role");
    expect(html).toContain("Liaison:");
    expect(html).not.toContain("Advisor:");
    expect(html).not.toContain("Open asks");
    expect(html).toContain("What worked");
  });

  it("shows the plain fallback note for the API fallback", () => {
    const html = renderToStaticMarkup(<HandoffSummaryView result={{ kind: "fallback" }} />);
    expect(HANDOFF_FALLBACK_NOTE).toBe(
      "A handoff summary couldn't be written from the timeline yet.",
    );
    expect(html).toContain("A handoff summary couldn&#x27;t be written from the timeline yet.");
    expect(html).toContain('role="status"');
  });
});

describe("rowsFromCsv (manual review table)", () => {
  it("skips the header and marks unknown units and hazards for review", () => {
    const rows = rowsFromCsv(
      "name,category,quantity,unit,expiry,hazardClass\nP200 tips,plasticware,4800,unit,2029-01-01,none\nMystery,reagent,2,jars,2028-01-01,weird",
      (i) => `inv-test-${i}`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "inv-test-0", name: "P200 tips", quantity: 4800, unit: "unit", hazardClass: "none" });
    expect(rows[1]).toMatchObject({ unit: "unit", hazardClass: "unknown" });
  });
});
