import { describe, it, expect } from "vitest";

import { rejectsStudentIdentity } from "@/lib/core/eligibility";
import { sortTimeline } from "@/lib/core/timeline";
import { EventId, OrgId, type TimelineEvent } from "@/lib/schemas";

/**
 * Unit tests for eligibility and timeline sort (Task 8.3).
 *
 * `rejectsStudentIdentity` must flag every prohibited student personal-identity
 * attribute and pass legitimate org/mission/ask/topic content.
 * `sortTimeline` must be stable reverse-chronological (date DESC, then seq ASC),
 * pure (no mutation), and identical on repeated calls.
 *
 * Deterministic: no network, no randomness, no Date.now().
 *
 * Requirements: 2.4, 7.6, 17.5.
 */

// --- rejectsStudentIdentity: REJECTS prohibited identity attributes ------

describe("rejectsStudentIdentity rejects prohibited identity attributes (Req 7.6, 17.5)", () => {
  it("rejects a full-name key (fullName)", () => {
    expect(rejectsStudentIdentity({ fullName: "Jane Q. Member" })).toBe(true);
  });

  it("rejects a student-name key (studentName)", () => {
    expect(rejectsStudentIdentity({ studentName: "Jane Q. Member" })).toBe(true);
  });

  it("rejects a date-of-birth key (dob)", () => {
    expect(rejectsStudentIdentity({ dob: "2007-05-01" })).toBe(true);
  });

  it("rejects a date-of-birth key (dateOfBirth)", () => {
    expect(rejectsStudentIdentity({ dateOfBirth: "2007-05-01" })).toBe(true);
  });

  it("rejects a home-address key (homeAddress)", () => {
    expect(rejectsStudentIdentity({ homeAddress: "123 Main St" })).toBe(true);
  });

  it("rejects a personal-email key (personalEmail)", () => {
    expect(rejectsStudentIdentity({ personalEmail: "contact" })).toBe(true);
  });

  it("rejects an email-address value regardless of key", () => {
    expect(rejectsStudentIdentity({ contact: "jane.member@example.com" })).toBe(true);
  });

  it("rejects a personal-phone key (personalPhone)", () => {
    expect(rejectsStudentIdentity({ personalPhone: "555-0100" })).toBe(true);
  });

  it("rejects a phone-number key (phoneNumber)", () => {
    expect(rejectsStudentIdentity({ phoneNumber: "555-0100" })).toBe(true);
  });

  it("rejects a photo key (photo)", () => {
    expect(rejectsStudentIdentity({ photo: "data:image/png;base64,AAAA" })).toBe(true);
  });

  it("rejects a headshot key (headshot)", () => {
    expect(rejectsStudentIdentity({ headshot: "data:image/png;base64,AAAA" })).toBe(true);
  });

  it("rejects a government-id key (ssn)", () => {
    expect(rejectsStudentIdentity({ ssn: "xxx" })).toBe(true);
  });

  it("rejects a government-id key (govId)", () => {
    expect(rejectsStudentIdentity({ govId: "A1234567" })).toBe(true);
  });

  it("rejects a government-id key (studentIdNumber)", () => {
    expect(rejectsStudentIdentity({ studentIdNumber: "00012345" })).toBe(true);
  });

  it("rejects an SSN-pattern value regardless of key", () => {
    expect(rejectsStudentIdentity({ reference: "123-45-6789" })).toBe(true);
  });
});

// --- rejectsStudentIdentity: PASSES legitimate content -------------------

describe("rejectsStudentIdentity passes legitimate org/mission/ask content (Req 7.6, 17.5)", () => {
  it("passes an org-level object with name/school/city/mission/topic", () => {
    const org = {
      name: "Robotics Club",
      school: "Fictional High",
      city: "Boston",
      mission: "Give every student hands-on access to robotics and lab science.",
      topic: "PCR supplies",
    };
    expect(rejectsStudentIdentity(org)).toBe(false);
  });

  it("passes a free-text mission string", () => {
    const mission =
      "We advance accessible synthetic biology education for under-resourced clubs.";
    expect(rejectsStudentIdentity(mission)).toBe(false);
  });
});

// --- sortTimeline fixtures -----------------------------------------------

// Build a minimal valid TimelineEvent as a plain object typed as the schema's
// inferred type. No zod parse needed — these are hand-built, in-bounds values.
const makeEvent = (
  id: string,
  date: string,
  seq: number,
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent => ({
  id: EventId.parse(id),
  orgId: OrgId.parse("org-1"),
  kind: "ask",
  date,
  seq,
  summary: `event ${id}`,
  refs: [],
  ...overrides,
});

// --- sortTimeline: reverse-chronological ---------------------------------

describe("sortTimeline orders by date descending (Req 2.4)", () => {
  it("returns events newest date first", () => {
    const events = [
      makeEvent("e-old", "2025-01-10", 0),
      makeEvent("e-new", "2025-03-20", 0),
      makeEvent("e-mid", "2025-02-15", 0),
    ];

    const sorted = sortTimeline(events);

    expect(sorted.map((e) => e.id)).toEqual(["e-new", "e-mid", "e-old"]);
  });
});

// --- sortTimeline: same-date tie-break by seq ascending ------------------

describe("sortTimeline tie-breaks same-date events by seq ascending (Req 2.4)", () => {
  it("orders same-date events by ascending seq", () => {
    const events = [
      makeEvent("e-c", "2025-02-15", 2),
      makeEvent("e-a", "2025-02-15", 0),
      makeEvent("e-b", "2025-02-15", 1),
    ];

    const sorted = sortTimeline(events);

    expect(sorted.map((e) => e.id)).toEqual(["e-a", "e-b", "e-c"]);
  });

  it("applies date DESC before seq ASC across mixed dates", () => {
    const events = [
      makeEvent("older-seq1", "2025-01-10", 1),
      makeEvent("newer-seq1", "2025-02-15", 1),
      makeEvent("newer-seq0", "2025-02-15", 0),
      makeEvent("older-seq0", "2025-01-10", 0),
    ];

    const sorted = sortTimeline(events);

    expect(sorted.map((e) => e.id)).toEqual([
      "newer-seq0",
      "newer-seq1",
      "older-seq0",
      "older-seq1",
    ]);
  });
});

// --- sortTimeline: stable, idempotent, non-mutating ----------------------

describe("sortTimeline is stable, repeatable, and non-mutating (Req 2.4)", () => {
  it("yields deeply-equal arrays on repeated calls with the same input", () => {
    const events = [
      makeEvent("e1", "2025-03-20", 0),
      makeEvent("e2", "2025-02-15", 1),
      makeEvent("e3", "2025-02-15", 0),
      makeEvent("e4", "2025-01-10", 5),
    ];

    const first = sortTimeline(events);
    const second = sortTimeline(events);

    expect(second).toEqual(first);
  });

  it("does not mutate the input array (input order preserved)", () => {
    const events = [
      makeEvent("e1", "2025-01-10", 0),
      makeEvent("e2", "2025-03-20", 0),
      makeEvent("e3", "2025-02-15", 0),
    ];
    const inputOrderBefore = events.map((e) => e.id);

    sortTimeline(events);

    expect(events.map((e) => e.id)).toEqual(inputOrderBefore);
  });

  it("returns a new array, not the same reference", () => {
    const events = [makeEvent("e1", "2025-01-10", 0)];
    expect(sortTimeline(events)).not.toBe(events);
  });
});
