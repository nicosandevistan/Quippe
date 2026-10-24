import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardList } from "@/app/company/[id]/DashboardList";
import {
  fitBars,
  fitLabel,
  fitPhrase,
} from "@/app/company/[id]/fit-label";
import type { DashboardEntry, DecisionResult } from "@/components/DashboardEntryView";
/**
 * Company dashboard visual refresh (restyle to
 * docs/design/company-dashboard.html; see .kiro/steering/design.md).
 *
 * Two things are pinned here: the pure fit-label mapping at its exact
 * boundaries, and the table markup of DashboardList (columns, the fit word,
 * the Open/Accepted/All filter with counts from the entries the page already
 * has, and the liaison's Accept/Decline vs the read-only status).
 */
describe("fitLabel (score -> word)", () => {
  it("maps the threshold boundaries", () => {
    // >= 0.75 is Strong; just under is Good.
    expect(fitLabel(0.75)).toBe("Strong");
    expect(fitLabel(0.7499)).toBe("Good");
    // >= 0.5 is Good; just under is Fair.
    expect(fitLabel(0.5)).toBe("Good");
    expect(fitLabel(0.4999)).toBe("Fair");
    // The extremes.
    expect(fitLabel(1)).toBe("Strong");
    expect(fitLabel(0)).toBe("Fair");
  });
  it("lights the right number of meter bars", () => {
    expect(fitBars(0.75)).toBe(3);
    expect(fitBars(0.5)).toBe(2);
    expect(fitBars(0.4999)).toBe(1);
    expect(fitBars(1)).toBe(3);
    expect(fitBars(0)).toBe(1);
  });
  it("renders the word as the mockup displays it", () => {
    expect(fitPhrase(0.9)).toBe("Strong fit");
    expect(fitPhrase(0.6)).toBe("Good fit");
    expect(fitPhrase(0.2)).toBe("Fair fit");
  });
});
function entryWith(overrides: Partial<DashboardEntry> = {}): DashboardEntry {
  return {
    askId: "ask-1",
    orgId: "org-liss",
    orgName: "Latinos in STEM Society",
    offerId: "off-1",
    score: 0.82,
    reasons: ["You have 6 of the 10 items in surplus."],
    noReasons: false,
    matchedOfferIds: ["off-1"],
    ask: {
      id: "ask-1",
      type: "supplies",
      topic: "Supplies for a DNA extraction workshop",
      groupSize: 25,
      deliveryMode: "in_person",
      preferredDates: ["2025-11-14"],
      status: "matched",
    },
    offer: { id: "off-1", type: "supplies", notes: "" },
    ...overrides,
  };
}
const noop = async (): Promise<DecisionResult> => ({ kind: "done", status: "accepted" });
describe("DashboardList table", () => {
  const entries = [
    entryWith(),
    entryWith({
      askId: "ask-2",
      score: 0.55,
      ask: {
        id: "ask-2",
        type: "lab_tour",
        topic: "Lab tour for 15 members",
        groupSize: 15,
        deliveryMode: "in_person",
        preferredDates: [],
        status: "matched",
      },
      offer: { id: "off-2", type: "lab_tour", notes: "" },
    }),
    entryWith({
      askId: "ask-3",
      score: 0.9,
      ask: {
        id: "ask-3",
        type: "erg_event",
        topic: "Meetup with Latino and first-gen professionals",
        groupSize: 25,
        deliveryMode: "in_person",
        preferredDates: [],
        status: "accepted",
      },
      offer: { id: "off-3", type: "erg_event", notes: "" },
    }),
  ];
  function render(canDecide: boolean) {
    return renderToStaticMarkup(
      <DashboardList
        entries={entries}
        canDecide={canDecide}
        accept={noop}
        decline={noop}
      />,
    );
  }
  it("is a table with the mockup's columns and fit words", () => {
    const html = render(true);
    expect(html).toContain("<table");
    for (const col of ["Ask", "Club", "Fit", "Why it matched"]) {
      expect(html).toContain(`>${col}<`);
    }
    // scope on headers for accessibility.
    expect(html).toContain('scope="col"');
    expect(html).toContain("Supplies for a DNA extraction workshop");
    expect(html).toContain("Strong fit"); // 0.82
    expect(html).toContain("Good fit"); // 0.55
  });
  it("shows the Open/Accepted/All filter with counts from the entries", () => {
    const html = render(true);
    expect(html).toContain('aria-label="Filter asks"');
    expect(html).toContain("Open (2)"); // two matched
    expect(html).toContain("Accepted (1)"); // one accepted
    expect(html).toContain("All (3)");
    expect(html).toContain("Sorted by fit");
  });
  it("gives the liaison Accept/Decline on open rows", () => {
    const html = render(true);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Accept<\/button>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Decline<\/button>/);
  });
  it("is read-only for the ERG lead: no Accept button", () => {
    const html = render(false);
    expect(html).not.toContain(">Accept<");
    expect(html).not.toContain(">Decline<");
  });
  it("shows an empty state when there are no matched asks", () => {
    const html = renderToStaticMarkup(
      <DashboardList entries={[]} canDecide accept={noop} decline={noop} />,
    );
    expect(html).toContain("No matched asks yet");
  });
});
