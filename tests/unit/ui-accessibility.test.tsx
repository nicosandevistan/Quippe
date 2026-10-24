/**
 * Accessibility checks for key UI components (Task 25.3; Req 1.4, 2.3,
 * design.md accessibility cross-cut).
 *
 * These render components to static HTML with `react-dom/server` (no browser,
 * no new deps) and assert the accessibility WIRING that must hold regardless of
 * styling:
 *  - form fields have a `<label>` tied to the control by id,
 *  - validation errors are tied to the field via `aria-describedby` +
 *    `aria-invalid` and announced (`role="alert"`),
 *  - the page shell exposes a skip link and a labeled nav landmark,
 *  - the empty state announces via `role="status"`.
 *
 * NOTE: full WCAG AA conformance (contrast, real keyboard operation with
 * assistive tech) still needs manual testing; these checks catch the
 * structural regressions that are cheap to assert automatically (design.md:
 * "full AA conformance requires manual testing").
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Acronym, resetAcronyms } from "@/components/Acronym";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { TimelineList } from "@/components/TimelineList";
import type { TimelineEvent } from "@/lib/schemas";

describe("FormField accessibility", () => {
  it("ties the label to the control by id", () => {
    const html = renderToStaticMarkup(
      <FormField id="email" label="Email">
        {(p) => <input {...p} name="email" />}
      </FormField>,
    );
    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
  });

  it("associates an error with the field and announces it", () => {
    const html = renderToStaticMarkup(
      <FormField id="city" label="City" error="City is required.">
        {(p) => <input {...p} name="city" />}
      </FormField>,
    );
    // The control is marked invalid and points at the error element.
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="city-error"');
    // The error element has the matching id and an alert role.
    expect(html).toContain('id="city-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("City is required.");
  });

  it("marks a required field with aria-required", () => {
    const html = renderToStaticMarkup(
      <FormField id="name" label="Name" required>
        {(p) => <input {...p} name="name" />}
      </FormField>,
    );
    expect(html).toContain('aria-required="true"');
  });
});

describe("PageShell accessibility", () => {
  it("renders a skip link and a labeled nav landmark", () => {
    const html = renderToStaticMarkup(
      <PageShell role="club_officer" navLinks={[{ href: "/org/x", label: "My org" }]}>
        <p>content</p>
      </PageShell>,
    );
    expect(html).toContain('href="#main"');
    expect(html).toContain("Skip to main content");
    expect(html).toContain('aria-label="Main"');
    expect(html).toContain('id="main"');
    // Role indicator is shown in plain language.
    expect(html).toContain("Club officer");
  });
});

describe("EmptyState accessibility", () => {
  it("announces via role=status", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No matches yet" message="Nothing here." />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("No matches yet");
  });
});

describe("Acronym first-use explanation", () => {
  it("expands on first use and uses an abbr title thereafter", () => {
    resetAcronyms();
    const first = renderToStaticMarkup(
      <Acronym term="BOM" expansion="bill of materials" />,
    );
    // First use shows the parenthetical and an abbr title.
    expect(first).toContain("bill of materials");
    expect(first).toContain('title="bill of materials"');

    const second = renderToStaticMarkup(
      <Acronym term="BOM" expansion="bill of materials" />,
    );
    // Second use still carries the title (for assistive tech) ...
    expect(second).toContain('title="bill of materials"');
    // ... but no longer repeats the parenthetical expansion inline.
    expect(second).not.toContain("(bill of materials)");
  });
});

describe("TimelineList", () => {
  it("shows the empty indicator when there are no events", () => {
    const html = renderToStaticMarkup(<TimelineList events={[]} />);
    expect(html).toContain("No activity yet");
  });

  it("renders events as an ordered list with kind and date", () => {
    const events: TimelineEvent[] = [
      {
        id: "ev-1" as TimelineEvent["id"],
        orgId: "org-x" as TimelineEvent["orgId"],
        kind: "donation",
        date: "2026-02-20",
        seq: 1,
        summary: "Received supplies.",
        refs: [],
      },
    ];
    const html = renderToStaticMarkup(<TimelineList events={events} />);
    expect(html).toContain("<ol");
    expect(html).toContain("Donation");
    expect(html).toContain("2026-02-20");
    expect(html).toContain("Received supplies.");
  });
});
