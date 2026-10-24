import { describe, expect, it } from "vitest";

import { createRepoFromSeed, SeedSchema } from "@/lib/data/repo";
import { Role, type OrgId, type CompanyId } from "@/lib/schemas";

import seed from "@/lib/data/seed.json";

/**
 * Repo and seed tests (Task 10.4; Req 2.6, 14.4, 17.6).
 *
 * These exercise the in-memory repo's not-found and expiry-filter behavior and
 * confirm seed.json carries the fixtures the demo depends on. A fresh repo is
 * built per test via createRepoFromSeed so mutations never leak between tests.
 */

// A run date chosen so the two seeded expired items (2025-03-01, 2024-11-01)
// are in the past and all valid items are in the future.
const RUN_DATE = "2026-10-24";

describe("seed.json", () => {
  it("parses against the shared schemas", () => {
    expect(() => SeedSchema.parse(seed)).not.toThrow();
  });

  it("offers exactly one demo account per role", () => {
    const parsed = SeedSchema.parse(seed);
    for (const role of Role.options) {
      const n = parsed.accounts.filter((a) => a.role === role).length;
      expect(n, `role ${role}`).toBe(1);
    }
  });

  it("includes at least 3 hazardous and 2 expired inventory items", () => {
    const parsed = SeedSchema.parse(seed);
    const hazardous = parsed.inventory.filter(
      (i) => i.hazardClass !== "none" && i.hazardClass !== "unknown",
    );
    const expired = parsed.inventory.filter((i) => i.expiry <= RUN_DATE);
    expect(hazardous.length).toBeGreaterThanOrEqual(3);
    expect(expired.length).toBeGreaterThanOrEqual(2);
  });

  it("gives the college club at least ~6 timeline events for the handoff", () => {
    const parsed = SeedSchema.parse(seed);
    const events = parsed.timeline.filter((e) => e.orgId === "org-liss");
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("names an advisor only for the high school club", () => {
    const parsed = SeedSchema.parse(seed);
    for (const org of parsed.organizations) {
      if (org.type === "high_school_club") {
        expect(org.advisorAccountId).toBeTruthy();
      } else {
        expect(org.advisorAccountId).toBeUndefined();
      }
    }
  });
});

describe("InMemoryRepo", () => {
  it("returns null for a missing organization (Req 2.6)", async () => {
    const repo = createRepoFromSeed();
    const org = await repo.getOrganization("org-does-not-exist" as OrgId);
    expect(org).toBeNull();
  });

  it("returns a known organization with its profile", async () => {
    const repo = createRepoFromSeed();
    const org = await repo.getOrganization("org-liss" as OrgId);
    expect(org).not.toBeNull();
    expect(org?.name).toBe("Latinos in STEM Society");
  });

  it("never returns expired items from listInventory (Req 14.4)", async () => {
    const repo = createRepoFromSeed();
    const items = await repo.listInventory(RUN_DATE);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.expiry > RUN_DATE).toBe(true);
    }
  });

  it("filters inventory by company and still hides expired items", async () => {
    const repo = createRepoFromSeed();
    const hv = await repo.listInventory(RUN_DATE, {
      companyId: "co-harborview" as CompanyId,
    });
    expect(hv.length).toBeGreaterThan(0);
    for (const item of hv) {
      expect(item.companyId).toBe("co-harborview");
      expect(item.expiry > RUN_DATE).toBe(true);
    }
    // The old-lot Taq (expiry 2025-03-01) must not appear.
    expect(hv.some((i) => i.id === "inv-hv-expired-taq")).toBe(false);
  });

  it("reports whether a company has an ERG (Req 7.4)", async () => {
    const repo = createRepoFromSeed();
    expect(
      await repo.ergExistsForCompany("co-harborview" as CompanyId),
    ).toBe(true);
    expect(
      await repo.ergExistsForCompany("co-granite" as CompanyId),
    ).toBe(false);
  });

  it("looks up seeded city coordinates and returns null for unknown cities", async () => {
    const repo = createRepoFromSeed();
    const boston = await repo.getCityCoords("Boston");
    expect(boston).toEqual({ lat: 42.3601, lon: -71.0589 });
    expect(await repo.getCityCoords("Atlantis")).toBeNull();
  });

  it("lists exactly one account per role as demo accounts (Req 1.1)", async () => {
    const repo = createRepoFromSeed();
    const accounts = await repo.listDemoAccounts();
    for (const role of Role.options) {
      expect(accounts.filter((a) => a.role === role).length).toBe(1);
    }
  });
});
