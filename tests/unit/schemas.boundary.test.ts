import { describe, it, expect } from "vitest";

import { Ask, BOM, Erg, Offer, Organization } from "@/lib/schemas";

/**
 * Schema boundary tests (Task 2.3).
 *
 * Each entity gets a valid baseline fixture; every test mutates exactly one
 * field to land on an accept/reject edge and asserts `safeParse(...).success`.
 * Deterministic: no network, no randomness, no Date.now().
 *
 * Requirements: 4.2, 4.5, 4.6, 7.1, 7.2, 8.1, 10.1.
 */

// --- Baseline fixtures ---------------------------------------------------

const validOffer = {
  id: "offer-1",
  companyId: "company-1",
  type: "supplies",
  capacity: 10,
  availableDates: ["2025-02-14"],
  deliveryMode: "in_person",
  city: "Boston",
  minAge: 14,
  notes: "A sample offer.",
};

const validErg = {
  id: "erg-1",
  companyId: "company-1",
  leadAccountId: "account-1",
  name: "Women in STEM",
  description: "An employee resource group focused on STEM outreach.",
  topics: ["biology", "chemistry"],
  capacityPerSemester: 50,
};

const validAsk = {
  id: "ask-1",
  orgId: "org-1",
  type: "supplies",
  groupSize: 20,
  preferredDates: ["2025-02-14"],
  deliveryMode: "in_person",
  topic: "PCR lab supplies",
  needsSupplies: true,
  status: "open",
};

const validBomLine = {
  id: "bomline-1",
  item: "Agarose",
  category: "reagent",
  quantity: 5,
  unit: "g",
  purpose: "Gel electrophoresis",
};

const validOrganization = {
  id: "org-1",
  type: "college_club",
  name: "Synth Bio Team",
  school: "Fictional University",
  city: "Cambridge",
  size: 12,
  mission: "Advance accessible synthetic biology education.",
  underResourced: true,
  ageYears: 3,
};

// A helper that builds an N-character string deterministically.
const str = (n: number) => "a".repeat(n);

// A helper that builds N valid BOM lines deterministically.
const bomLines = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...validBomLine, id: `bomline-${i + 1}` }));

// --- Offer: capacity (int 1..10000) --------------------------------------

describe("Offer.capacity bounds (Req 4.5)", () => {
  it("accepts the lower bound 1", () => {
    expect(Offer.safeParse({ ...validOffer, capacity: 1 }).success).toBe(true);
  });

  it("accepts the upper bound 10000", () => {
    expect(Offer.safeParse({ ...validOffer, capacity: 10000 }).success).toBe(true);
  });

  it("rejects 0 (below lower bound)", () => {
    expect(Offer.safeParse({ ...validOffer, capacity: 0 }).success).toBe(false);
  });

  it("rejects 10001 (above upper bound)", () => {
    expect(Offer.safeParse({ ...validOffer, capacity: 10001 }).success).toBe(false);
  });
});

// --- Offer: minAge (int 0..25 when present) ------------------------------

describe("Offer.minAge bounds (Req 4.5)", () => {
  it("accepts the lower bound 0", () => {
    expect(Offer.safeParse({ ...validOffer, minAge: 0 }).success).toBe(true);
  });

  it("accepts the upper bound 25", () => {
    expect(Offer.safeParse({ ...validOffer, minAge: 25 }).success).toBe(true);
  });

  it("rejects 26 (above upper bound)", () => {
    expect(Offer.safeParse({ ...validOffer, minAge: 26 }).success).toBe(false);
  });

  it("rejects -1 (below lower bound)", () => {
    expect(Offer.safeParse({ ...validOffer, minAge: -1 }).success).toBe(false);
  });
});

// --- Offer: notes (<= 2000 chars) ----------------------------------------

describe("Offer.notes length bound (Req 4.5)", () => {
  it("accepts length 2000", () => {
    expect(Offer.safeParse({ ...validOffer, notes: str(2000) }).success).toBe(true);
  });

  it("rejects length 2001", () => {
    expect(Offer.safeParse({ ...validOffer, notes: str(2001) }).success).toBe(false);
  });
});

// --- Offer: invalid type rejected (Req 4.2) ------------------------------

describe("Offer.type membership (Req 4.2)", () => {
  it("accepts a valid OfferType", () => {
    expect(Offer.safeParse({ ...validOffer, type: "lab_tour" }).success).toBe(true);
  });

  it("rejects a value not in OfferType", () => {
    expect(Offer.safeParse({ ...validOffer, type: "field_trip" }).success).toBe(false);
  });
});

// --- Erg: name (1..120 chars) --------------------------------------------

describe("Erg.name length bounds (Req 7.1, 7.2)", () => {
  it("accepts length 1", () => {
    expect(Erg.safeParse({ ...validErg, name: str(1) }).success).toBe(true);
  });

  it("accepts length 120", () => {
    expect(Erg.safeParse({ ...validErg, name: str(120) }).success).toBe(true);
  });

  it("rejects length 0", () => {
    expect(Erg.safeParse({ ...validErg, name: str(0) }).success).toBe(false);
  });

  it("rejects length 121", () => {
    expect(Erg.safeParse({ ...validErg, name: str(121) }).success).toBe(false);
  });
});

// --- Erg: description (1..2000 chars) ------------------------------------

describe("Erg.description length bounds (Req 7.1, 7.2)", () => {
  it("accepts length 1", () => {
    expect(Erg.safeParse({ ...validErg, description: str(1) }).success).toBe(true);
  });

  it("accepts length 2000", () => {
    expect(Erg.safeParse({ ...validErg, description: str(2000) }).success).toBe(true);
  });

  it("rejects length 2001", () => {
    expect(Erg.safeParse({ ...validErg, description: str(2001) }).success).toBe(false);
  });
});

// --- Erg: topics (1..20 entries) -----------------------------------------

describe("Erg.topics count bounds (Req 7.1, 7.2)", () => {
  it("accepts 1 entry", () => {
    expect(Erg.safeParse({ ...validErg, topics: ["x"] }).success).toBe(true);
  });

  it("accepts 20 entries", () => {
    const topics = Array.from({ length: 20 }, (_, i) => `topic-${i}`);
    expect(Erg.safeParse({ ...validErg, topics }).success).toBe(true);
  });

  it("rejects 0 entries", () => {
    expect(Erg.safeParse({ ...validErg, topics: [] }).success).toBe(false);
  });

  it("rejects 21 entries", () => {
    const topics = Array.from({ length: 21 }, (_, i) => `topic-${i}`);
    expect(Erg.safeParse({ ...validErg, topics }).success).toBe(false);
  });
});

// --- Erg: capacityPerSemester (int 1..10000) -----------------------------

describe("Erg.capacityPerSemester bounds (Req 7.1, 7.2)", () => {
  it("accepts the lower bound 1", () => {
    expect(Erg.safeParse({ ...validErg, capacityPerSemester: 1 }).success).toBe(true);
  });

  it("accepts the upper bound 10000", () => {
    expect(Erg.safeParse({ ...validErg, capacityPerSemester: 10000 }).success).toBe(true);
  });

  it("rejects 0 (below lower bound)", () => {
    expect(Erg.safeParse({ ...validErg, capacityPerSemester: 0 }).success).toBe(false);
  });

  it("rejects 10001 (above upper bound)", () => {
    expect(Erg.safeParse({ ...validErg, capacityPerSemester: 10001 }).success).toBe(false);
  });
});

// --- Ask: groupSize (int 1..500) -----------------------------------------

describe("Ask.groupSize bounds (Req 8.1)", () => {
  it("accepts the lower bound 1", () => {
    expect(Ask.safeParse({ ...validAsk, groupSize: 1 }).success).toBe(true);
  });

  it("accepts the upper bound 500", () => {
    expect(Ask.safeParse({ ...validAsk, groupSize: 500 }).success).toBe(true);
  });

  it("rejects 0 (below lower bound)", () => {
    expect(Ask.safeParse({ ...validAsk, groupSize: 0 }).success).toBe(false);
  });

  it("rejects 501 (above upper bound)", () => {
    expect(Ask.safeParse({ ...validAsk, groupSize: 501 }).success).toBe(false);
  });
});

// --- BOM: line count (1..200) --------------------------------------------

describe("BOM line count bounds (Req 10.1)", () => {
  it("accepts 1 line", () => {
    expect(BOM.safeParse({ lines: bomLines(1) }).success).toBe(true);
  });

  it("accepts 200 lines", () => {
    expect(BOM.safeParse({ lines: bomLines(200) }).success).toBe(true);
  });

  it("rejects 0 lines", () => {
    expect(BOM.safeParse({ lines: bomLines(0) }).success).toBe(false);
  });

  it("rejects 201 lines", () => {
    expect(BOM.safeParse({ lines: bomLines(201) }).success).toBe(false);
  });
});

// --- Organization: high_school_club advisor refinement (Req 4.6 adjacency) -

describe("Organization high_school_club advisor refinement", () => {
  it("accepts a non-HS org without an advisorAccountId", () => {
    expect(Organization.safeParse(validOrganization).success).toBe(true);
  });

  it("rejects a high_school_club without advisorAccountId", () => {
    const org = { ...validOrganization, type: "high_school_club" };
    expect(Organization.safeParse(org).success).toBe(false);
  });

  it("accepts a high_school_club with advisorAccountId", () => {
    const org = {
      ...validOrganization,
      type: "high_school_club",
      advisorAccountId: "account-advisor-1",
    };
    expect(Organization.safeParse(org).success).toBe(true);
  });
});
