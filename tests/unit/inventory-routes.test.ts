import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as confirmPost } from "@/app/api/inventory/confirm/route";
import { POST as normalizePost } from "@/app/api/inventory/normalize/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { getRepo } from "@/lib/data/repo";
import type { CompanyId, InventoryItem } from "@/lib/schemas";

/**
 * Unit tests for the inventory upload/normalization API routes (Task 20.2;
 * Req 13.2, 13.4, 13.5, 14.2).
 *
 * These exercise the two-step inventory flow end to end against the real
 * routes, the real deterministic `computeHsSafe` rule, the mock AI provider,
 * and the process-wide `getRepo()` singleton the routes actually use:
 *
 *   - normalize rejects an over-row (and oversize) upload with a limit message
 *     and persists NOTHING, so saved inventory is unchanged (Req 13.2, 13.4);
 *   - a VALID normalize returns an editable review set and still persists
 *     nothing — saved inventory is unchanged before confirm (Req 13.4);
 *   - confirm OVERRIDES each item's suggested `hsSafe` with the rule result,
 *     so a hazardous item submitted as `hsSafe:true` is stored false while a
 *     genuinely-safe item stays true, and the server-owned companyId is bound
 *     from the session, not trusted from the client (Req 13.5, 14.2);
 *   - an empty confirm list is rejected 400 and persists nothing (Req 13.5).
 *
 * Robustness to the shared singleton: assertions use before/after deltas and
 * follow-up reads against `getRepo()` (the same instance the routes mutate),
 * every confirmed item uses a unique id (`randomUUID`) with a far-future
 * expiry so it is readable, and mocks are restored after each test.
 */

// The seeded company liaison account and its company (from seed.json:
// acc-liaison → company_liaison @ co-harborview).
const LIAISON_ACCOUNT = "acc-liaison";
const HARBORVIEW = "co-harborview" as CompanyId;

// A far-future run date so every seeded non-expired item — and every item we
// confirm with a far-future expiry — is visible to listInventory reads.
const RUN_DATE = "2027-01-01";
const FAR_FUTURE_EXPIRY = "2099-01-01";

/** Build a POST NextRequest carrying the session cookie and a JSON body. */
function postRequest(path: string, account: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${SESSION_COOKIE}=${account}`,
    },
    body: JSON.stringify(body),
  });
}

/** Count the liaison company's visible inventory via the shared singleton. */
async function harborviewInventoryCount(): Promise<number> {
  const items = await getRepo().listInventory(RUN_DATE, {
    companyId: HARBORVIEW,
  });
  return items.length;
}

/** The persisted item with the given id, or undefined, via the singleton. */
async function findPersisted(id: string): Promise<InventoryItem | undefined> {
  const items = await getRepo().listInventory(RUN_DATE, {
    companyId: HARBORVIEW,
  });
  return items.find((i) => i.id === id);
}

/**
 * A valid confirmed-item input: the full InventoryItem shape minus companyId,
 * which the route binds from the session. Overrides let each test vary the
 * hazard signals and the suggested hsSafe.
 */
function confirmedItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: "P1000 pipette tips",
    category: "plasticware",
    quantity: 500,
    unit: "unit",
    expiry: FAR_FUTURE_EXPIRY,
    hazardClass: "none",
    hsSafe: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/inventory/normalize", () => {
  it("rejects an over-row upload with a limit message and leaves saved inventory unchanged (Req 13.2, 13.4)", async () => {
    const before = await harborviewInventoryCount();

    // Header + 5001 data rows = one over the 5000-row limit.
    const header = "name,category,quantity,unit,expiry,hazardClass";
    const rows = Array.from(
      { length: 5001 },
      (_v, i) => `item ${i},reagent,1,unit,2099-01-01,none`,
    );
    const csv = [header, ...rows].join("\n");

    const res = await normalizePost(
      postRequest("/api/inventory/normalize", LIAISON_ACCOUNT, { csv }),
    );

    expect(res.status).toBe(413);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    // The message names the row/limit that was exceeded.
    expect(json.error).toMatch(/5000-row limit/);
    expect(json.error).toMatch(/row/i);

    // normalize persists nothing — the rejected upload touched no saved item.
    expect(await harborviewInventoryCount()).toBe(before);
  });

  it("rejects an oversize (>10MB) upload with a 413 and leaves saved inventory unchanged (Req 13.2, 13.4)", async () => {
    const before = await harborviewInventoryCount();

    // A >10MB payload. The byte check runs before any row parsing, so a single
    // cheap `repeat` is enough to trip the size limit without heavy work.
    const csv = "name\n" + "a".repeat(10 * 1024 * 1024 + 1);

    const res = await normalizePost(
      postRequest("/api/inventory/normalize", LIAISON_ACCOUNT, { csv }),
    );

    expect(res.status).toBe(413);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/10 MB limit/);

    expect(await harborviewInventoryCount()).toBe(before);
  });

  it("returns an editable review set on a valid upload and persists nothing before confirm (Req 13.4)", async () => {
    const before = await harborviewInventoryCount();

    const csv = "name,category,quantity,unit\npipette tips,plasticware,500,unit";

    const res = await normalizePost(
      postRequest("/api/inventory/normalize", LIAISON_ACCOUNT, { csv }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      review: InventoryItem[];
    };
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.review)).toBe(true);
    expect(json.review.length).toBeGreaterThan(0);

    // Nothing is saved by normalize — the count is unchanged.
    expect(await harborviewInventoryCount()).toBe(before);
  });
});

describe("POST /api/inventory/confirm", () => {
  it("overrides a hazardous item's suggested hsSafe:true to false on confirm and persists it (Req 13.5, 14.2)", async () => {
    const item = confirmedItem({
      name: "Ethidium Bromide",
      category: "stain",
      hazardClass: "carcinogen",
      // The client (AI or liaison edit) wrongly suggests this is HS-safe.
      hsSafe: true,
    });

    const res = await confirmPost(
      postRequest("/api/inventory/confirm", LIAISON_ACCOUNT, { items: [item] }),
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      ok: boolean;
      saved: number;
      items: InventoryItem[];
    };
    expect(json.ok).toBe(true);
    expect(json.saved).toBe(1);
    // The response already reflects the rule-computed value.
    expect(json.items[0]?.hsSafe).toBe(false);

    // Verify via a follow-up read that the PERSISTED value is false.
    const persisted = await findPersisted(item.id as string);
    expect(persisted).toBeDefined();
    expect(persisted?.hsSafe).toBe(false);
  });

  it("keeps a genuinely-safe item's hsSafe true on confirm (Req 14.2)", async () => {
    const item = confirmedItem({
      name: "Sterile cotton swabs",
      category: "consumable",
      hazardClass: "none",
      hsSafe: true,
    });

    const res = await confirmPost(
      postRequest("/api/inventory/confirm", LIAISON_ACCOUNT, { items: [item] }),
    );

    expect(res.status).toBe(201);
    const persisted = await findPersisted(item.id as string);
    expect(persisted).toBeDefined();
    expect(persisted?.hsSafe).toBe(true);
  });

  it("binds companyId from the session, ignoring a client-supplied company (Req 13.5)", async () => {
    // The confirmed-item input schema omits companyId, so any extra companyId
    // on the body is stripped/ignored and the route assigns co-harborview from
    // the session. A different value here must never end up persisted.
    const item = confirmedItem({
      name: "Weigh boats",
      category: "plasticware",
      hazardClass: "none",
      hsSafe: true,
      companyId: "co-granite",
    });

    const res = await confirmPost(
      postRequest("/api/inventory/confirm", LIAISON_ACCOUNT, { items: [item] }),
    );

    expect(res.status).toBe(201);
    const persisted = await findPersisted(item.id as string);
    expect(persisted).toBeDefined();
    expect(persisted?.companyId).toBe(HARBORVIEW);
  });

  it("rejects an empty confirm list with 400 and persists nothing (Req 13.5)", async () => {
    const before = await harborviewInventoryCount();

    const res = await confirmPost(
      postRequest("/api/inventory/confirm", LIAISON_ACCOUNT, { items: [] }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/confirm at least one item/i);

    expect(await harborviewInventoryCount()).toBe(before);
  });
});
