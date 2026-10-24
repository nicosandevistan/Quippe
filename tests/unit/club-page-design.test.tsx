import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  TimelineLegend,
  TimelineList,
} from "@/components/TimelineList";
import { HandoffSummaryView } from "@/components/HandoffSummaryView";
import type { TimelineEvent } from "@/lib/schemas";
/**
 * Design checks for the club page (docs/design/club.html): the timeline shows
 * a date column and exactly one status dot per event, the legend shows the
 * three dot states, and the handoff panel renders its summary. These assert
 * the visual wiring the mock requires on top of the behavioral guarantees that
 * ui-accessibility.test.tsx / ui-demo-views.test.tsx already cover.
 */
function ev(
  id: string,
  kind: TimelineEvent["kind"],
  date: string,
  summary: string,
): TimelineEvent {
  return {
    id: id as TimelineEvent["id"],
    orgId: "org-liss" as TimelineEvent["orgId"],
    kind,
    date,
    seq: 1,
    summary,
    refs: [],
  };
}
const EVENTS: TimelineEvent[] = [
  ev("ev-1", "accepted", "2026-10-24", "Harborview accepted your meetup."),
  ev("ev-2", "match", "2026-10-24", "Workshop supplies matched."),
  ev("ev-3", "ask", "2026-10-24", "Lab tour requested."),
  ev("ev-4", "visit", "2026-05-18", "Career night at Harborview."),
  ev("ev-5", "donation", "2026-02-20", "Donation received from Harborview."),
];
describe("TimelineList design", () => {
  it("shows a date column with ISO datetime and a short human label", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    // Machine-readable ISO date stays in a <time> element for a11y/determinism.
    expect(html).toMatch(/<time[^>]*=["']2026-02-20["']/);
    expect(html).toMatch(/<time[^>]*=["']2026-05-18["']/);
    // A short human label is shown alongside (no locale drift).
    expect(html).toContain(">Feb 20<");
    expect(html).toContain(">May 18<");
  });
  it("renders exactly one status dot per event", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    const dots = html.match(/aria-hidden="true"/g) ?? [];
    expect(dots).toHaveLength(EVENTS.length);
  });
  it("keeps a text status word so color is not the only signal", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    expect(html).toContain("Matched");
    expect(html).toContain("Donation");
    expect(html).toContain("Ask sent");
  });
  it("maps kinds to the three dot colors (done/matched/waiting)", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    // accepted/visit/donation -> done (green token)
    expect(html).toContain("bg-done");
    // match -> pen (blue token)
    expect(html).toContain("bg-pen");
    // ask -> waiting (gray outline)
    expect(html).toContain("border-[#9AA1AD]");
  });
  it("stays a semantic ordered list in one panel", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    expect(html).toContain("<ol");
    expect(html).toContain("rounded-panel");
  });
  it("uses no middle-dot separators", () => {
    const html = renderToStaticMarkup(<TimelineList events={EVENTS} />);
    expect(html).not.toContain("·");
  });
});
describe("TimelineLegend", () => {
  it("shows the three dot states with words", () => {
    const html = renderToStaticMarkup(<TimelineLegend />);
    expect(html).toContain("Waiting");
    expect(html).toContain("Matched");
    expect(html).toContain("Done");
    const dots = html.match(/aria-hidden="true"/g) ?? [];
    expect(dots).toHaveLength(3);
  });
});
describe("Handoff panel", () => {
  it("renders the summary in an announced status region", () => {
    const html = renderToStaticMarkup(
      <HandoffSummaryView
        result={{
          kind: "summary",
          summary: {
            activeRelationships: ["Harborview Therapeutics: meetup"],
            contactsByRole: { Liaison: ["Harborview liaison"] },
            openAsks: ["Lab tour for 15 members"],
            whatWorked: ["Small groups for lab visits"],
            referencedIds: [],
          },
        }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Handoff summary");
    expect(html).toContain("Harborview Therapeutics: meetup");
    // Panel styling uses tokens, not shadows.
    expect(html).toContain("rounded-panel");
    expect(html).not.toContain("shadow");
  });
});
