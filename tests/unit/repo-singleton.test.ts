import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/app/api/_lib/session";
import seedJson from "@/lib/data/seed.json";
import {
  Ask,
  Erg,
  InventoryItem,
  Offer,
  TimelineEvent,
  type AskId,
  type CompanyId,
  type OrgId,
} from "@/lib/schemas";

/**
 * Shared repo singleton bugfix (spec: .kiro/specs/shared-repo-singleton).
 *
 * Under `npm run dev`, Next evaluates `src/lib/data/repo.ts` once per server
 * entry bundle and again after every compile, so a module-scoped singleton
 * gives each evaluation its own store. These tests simulate that inside one
 * Vitest process: `vi.resetModules()` followed by a dynamic `import()` yields
 * a NEW evaluation of `repo.ts` (and of every route that imports it).
 *
 * Bug condition (design: isBugCondition): a write goes through evaluation A
 * and a later read goes through a different evaluation B in the same process.
 * Expected behavior (design: expectedBehavior): A.getRepo() === B.getRepo()
 * and the read observes the write.
 */

type RepoModule = typeof import("@/lib/data/repo");

const GLOBAL_REPO_KEY = "__quippeRepo";
const ORG_LISS = "org-liss" as OrgId;
const CO_HARBORVIEW = "co-harborview" as CompanyId;
const OFFICER = "acc-officer"; // club_officer @ org-liss
const LIAISON = "acc-liaison"; // company_liaison @ co-harborview

/** Remove the process-wide repo slot so each case starts from the seed. */
function clearGlobalRepo(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_REPO_KEY];
}

/**
 * A new evaluation of `repo.ts`, standing in for a separate Next bundle or a
 * dev-server re-evaluation after a compile.
 */
async function freshEvaluation(): Promise<RepoModule> {
  vi.resetModules();
  return import("@/lib/data/repo");
}

/** A request carrying the demo session cookie and an optional JSON body. */
function reqAs(
  accountId: string,
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): NextRequest {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE}=${accountId}`,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --- Schema-valid entity builders (unique ids) ---------------------------

function makeAsk(groupSize: number): Ask {
  return Ask.parse({
    id: `ask-singleton-${crypto.randomUUID()}`,
    orgId: ORG_LISS,
    type: "lab_tour",
    groupSize,
    preferredDates: ["2027-02-10"],
    deliveryMode: "in_person",
    topic: `singleton-${crypto.randomUUID()}`,
    needsSupplies: false,
    status: "open",
  });
}

function makeEvent(seq: number): TimelineEvent {
  return TimelineEvent.parse({
    id: `ev-singleton-${crypto.randomUUID()}`,
    orgId: ORG_LISS,
    kind: "ask",
    date: "2026-10-24",
    seq,
    summary: "Singleton test event",
    refs: [],
  });
}

function makeOffer(capacity: number): Offer {
  return Offer.parse({
    id: `off-singleton-${crypto.randomUUID()}`,
    companyId: CO_HARBORVIEW,
    type: "speaker",
    capacity,
    availableDates: ["2027-03-01"],
    deliveryMode: "virtual",
    city: "Boston",
    notes: "Singleton test offer",
  });
}

function makeErg(capacity: number): Erg {
  return Erg.parse({
    id: `erg-singleton-${crypto.randomUUID()}`,
    companyId: CO_HARBORVIEW,
    leadAccountId: "acc-erglead",
    name: "Singleton test ERG",
    description: "An ERG created by the shared-repo singleton test.",
    topics: ["mentorship"],
    capacityPerSemester: capacity,
  });
}

function makeItem(quantity: number): InventoryItem {
  return InventoryItem.parse({
    id: `inv-singleton-${crypto.randomUUID()}`,
    companyId: CO_HARBORVIEW,
    name: "Singleton test tubes",
    category: "plasticware",
    quantity,
    unit: "unit",
    expiry: "2099-12-31",
    hazardClass: "none",
    hsSafe: true,
  });
}

// --- Write/read pairs for the property ----------------------------------

type WriteKind =
  | "saveAsk"
  | "addTimelineEvent"
  | "createOffer"
  | "createErg"
  | "saveInventory";

interface WriteOp {
  kind: WriteKind;
  n: number; // a numeric field to vary the entity (always schema-valid)
}

interface Written {
  kind: WriteKind;
  id: string;
}

type Repo = ReturnType<RepoModule["getRepo"]>;

async function applyWrite(repo: Repo, op: WriteOp): Promise<Written> {
  switch (op.kind) {
    case "saveAsk": {
      const a = makeAsk(op.n);
      await repo.saveAsk(a);
      return { kind: op.kind, id: a.id };
    }
    case "addTimelineEvent": {
      const e = makeEvent(op.n);
      await repo.addTimelineEvent(e);
      return { kind: op.kind, id: e.id };
    }
    case "createOffer": {
      const o = makeOffer(op.n);
      await repo.createOffer(o);
      return { kind: op.kind, id: o.id };
    }
    case "createErg": {
      const e = makeErg(op.n);
      await repo.createErg(e);
      return { kind: op.kind, id: e.id };
    }
    case "saveInventory": {
      const i = makeItem(op.n);
      await repo.saveInventory([i]);
      return { kind: op.kind, id: i.id };
    }
  }
}

async function isReadable(repo: Repo, w: Written): Promise<boolean> {
  switch (w.kind) {
    case "saveAsk":
      return (await repo.getAsk(w.id as AskId)) !== null;
    case "addTimelineEvent":
      return (await repo.listTimelineEvents(ORG_LISS)).some((e) => e.id === w.id);
    case "createOffer":
      return (await repo.listOffers({ companyId: CO_HARBORVIEW })).some(
        (o) => o.id === w.id,
      );
    case "createErg":
      return (await repo.getErg(w.id as Erg["id"])) !== null;
    case "saveInventory":
      return (
        await repo.listInventory("2026-10-24", { companyId: CO_HARBORVIEW })
      ).some((i) => i.id === w.id);
  }
}

const writeOpArb: fc.Arbitrary<WriteOp> = fc.record({
  kind: fc.constantFrom<WriteKind>(
    "saveAsk",
    "addTimelineEvent",
    "createOffer",
    "createErg",
    "saveInventory",
  ),
  n: fc.integer({ min: 1, max: 500 }),
});

// --- Property 1: Bug Condition -------------------------------------------

describe("Property 1: Bug Condition - one shared repository across module evaluations", () => {
  beforeEach(() => {
    vi.resetModules();
    clearGlobalRepo();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    clearGlobalRepo();
  });

  it("getRepo() returns the same instance from two evaluations of repo.ts", async () => {
    const A = await freshEvaluation();
    const repoA = A.getRepo();
    const B = await freshEvaluation();
    expect(B.getRepo()).toBe(repoA);
  });

  it("an ask saved through evaluation A is readable through evaluation B", async () => {
    const A = await freshEvaluation();
    const ask = makeAsk(12);
    await A.getRepo().saveAsk(ask);

    const B = await freshEvaluation();
    const found = await B.getRepo().getAsk(ask.id);
    expect(found).toEqual(ask);
    const listed = await B.getRepo().listAsks({ orgId: ORG_LISS });
    expect(listed.map((a) => a.id)).toContain(ask.id);
  });

  it("property: every write through evaluation A is readable through evaluation B", async () => {
    // **Validates: Requirements 2.1, 2.4, 2.5**
    await fc.assert(
      fc.asyncProperty(
        fc.array(writeOpArb, { minLength: 1, maxLength: 6 }),
        async (ops) => {
          clearGlobalRepo();
          const A = await freshEvaluation();
          const repoA = A.getRepo();
          const written: Written[] = [];
          for (const op of ops) written.push(await applyWrite(repoA, op));

          const B = await freshEvaluation();
          const repoB = B.getRepo();
          expect(repoB).toBe(repoA);
          for (const w of written) {
            expect({ ...w, readable: await isReadable(repoB, w) }).toEqual({
              ...w,
              readable: true,
            });
          }
        },
      ),
      { numRuns: 5 },
    );
  }, 60_000);

  it("route-level: asks confirmed in graph A appear on the org timeline and the company dashboard served by graph B", async () => {
    // **Validates: Requirements 1.2, 1.3, 2.2, 2.3**
    // Graph A: the confirm route (as /asks/new uses it) and its own dashboard.
    vi.resetModules();
    const { POST: confirmA } = await import("@/app/api/asks/confirm/route");
    const { GET: dashboardA } = await import(
      "@/app/api/company/[id]/dashboard/route"
    );

    const topics = [1, 2, 3].map((i) => `singleton-route-${i}-${crypto.randomUUID()}`);
    const confirmRes = await confirmA(
      reqAs(OFFICER, "http://test/api/asks/confirm", "POST", {
        asks: topics.map((topic) => ({
          type: "lab_tour",
          groupSize: 10,
          preferredDates: ["2027-02-10"],
          deliveryMode: "in_person",
          topic,
          needsSupplies: false,
        })),
      }),
    );
    expect(confirmRes.status).toBe(201);
    const confirmBody = await confirmRes.json();
    const newAskIds: string[] = confirmBody.asks.map((a: Ask) => a.id);
    expect(newAskIds.length).toBe(3);

    const dashParams = { params: { id: CO_HARBORVIEW as string } };
    const dashUrl = `http://test/api/company/${CO_HARBORVIEW}/dashboard`;
    const dashResA = await dashboardA(reqAs(LIAISON, dashUrl, "GET"), dashParams);
    expect(dashResA.status).toBe(200);
    const idsA: string[] = (await dashResA.json()).matches
      .map((m: { askId: string }) => m.askId)
      .sort();

    // Graph B: the org page's route and the dashboard route, re-evaluated as
    // the dev server does on first visit / after a compile.
    vi.resetModules();
    const { GET: orgB } = await import("@/app/api/org/[id]/route");
    const { GET: dashboardB } = await import(
      "@/app/api/company/[id]/dashboard/route"
    );

    const orgRes = await orgB(
      reqAs(OFFICER, `http://test/api/org/${ORG_LISS}`, "GET"),
      { params: { id: ORG_LISS as string } },
    );
    expect(orgRes.status).toBe(200);
    const timeline: TimelineEvent[] = (await orgRes.json()).timeline;
    const askEventRefs = timeline
      .filter((e) => e.kind === "ask")
      .flatMap((e) => e.refs);
    for (const id of newAskIds) {
      expect(askEventRefs).toContain(id);
    }

    const dashResB = await dashboardB(reqAs(LIAISON, dashUrl, "GET"), dashParams);
    expect(dashResB.status).toBe(200);
    const idsB: string[] = (await dashResB.json()).matches
      .map((m: { askId: string }) => m.askId)
      .sort();
    expect(idsB).toEqual(idsA);
  }, 60_000);
});

// --- Property 2: Preservation --------------------------------------------

/** Seed inventory, read straight from the JSON so expectations do not go through the repo. */
const SEED_INVENTORY: InventoryItem[] = InventoryItem.array().parse(
  seedJson.inventory,
);
const SEED_COMPANY_IDS = [
  ...new Set(SEED_INVENTORY.map((i) => i.companyId)),
] as CompanyId[];

/** ISO `YYYY-MM-DD` dates spanning the seed's expiry range (2024..2031). */
const DAY_MS = 86_400_000;
const isoDateArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: 8 * 365 })
  .map((d) => new Date(Date.UTC(2024, 0, 1) + d * DAY_MS).toISOString().slice(0, 10));

const savedItemArb = fc.record({
  companyId: fc.constantFrom(...SEED_COMPANY_IDS),
  expiry: isoDateArb,
  quantity: fc.integer({ min: 1, max: 500 }),
});

/** The expiry filter as the spec states it: keep `expiry > runDate` that match the company. */
function expectedInventory(
  items: InventoryItem[],
  runDate: string,
  companyId: CompanyId | null,
): InventoryItem[] {
  return items.filter(
    (i) => i.expiry > runDate && (companyId === null || i.companyId === companyId),
  );
}

/** Whether an error is a zod validation error (checked by name: zod is re-evaluated per graph). */
function isZodError(fn: () => unknown): boolean {
  try {
    fn();
  } catch (err) {
    return (err as Error).name === "ZodError";
  }
  return false;
}

describe("Property 2: Preservation - isolated fresh repos, seed validation, expiry filter", () => {
  beforeEach(() => {
    vi.resetModules();
    clearGlobalRepo();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/data/seed.json");
    vi.restoreAllMocks();
    vi.resetModules();
    clearGlobalRepo();
  });

  it("createRepoFromSeed() results and getRepo() are distinct objects with isolated stores", async () => {
    // **Validates: Requirements 3.1**
    const M = await freshEvaluation();
    const shared = M.getRepo();
    const fresh1 = M.createRepoFromSeed();
    const fresh2 = M.createRepoFromSeed();
    expect(fresh1).not.toBe(shared);
    expect(fresh2).not.toBe(shared);
    expect(fresh1).not.toBe(fresh2);

    const ask = makeAsk(9);
    await fresh1.saveAsk(ask);
    expect(await fresh1.getAsk(ask.id)).toEqual(ask);
    expect(await shared.getAsk(ask.id)).toBeNull();
    expect(await fresh2.getAsk(ask.id)).toBeNull();
  });

  it("property: writes to a createRepoFromSeed() repo never reach getRepo() or another fresh repo", async () => {
    // **Validates: Requirements 3.1, 3.5**
    const M = await freshEvaluation();
    await fc.assert(
      fc.asyncProperty(
        fc.array(writeOpArb, { minLength: 1, maxLength: 6 }),
        async (ops) => {
          const fresh = M.createRepoFromSeed();
          const written: Written[] = [];
          for (const op of ops) written.push(await applyWrite(fresh, op));

          const shared = M.getRepo();
          const other = M.createRepoFromSeed();
          for (const w of written) {
            expect({ ...w, inFresh: await isReadable(fresh, w) }).toEqual({
              ...w,
              inFresh: true,
            });
            expect({ ...w, inShared: await isReadable(shared, w) }).toEqual({
              ...w,
              inShared: false,
            });
            expect({ ...w, inOther: await isReadable(other, w) }).toEqual({
              ...w,
              inOther: false,
            });
          }
        },
      ),
      { numRuns: 25 },
    );
  }, 60_000);

  it("a malformed seed.json makes createRepoFromSeed() and the first getRepo() throw a ZodError", async () => {
    // **Validates: Requirements 3.2**
    vi.doMock("@/lib/data/seed.json", () => ({ default: { accounts: "bad" } }));
    try {
      vi.resetModules();
      clearGlobalRepo();
      const M: RepoModule = await import("@/lib/data/repo");
      expect(isZodError(() => M.createRepoFromSeed())).toBe(true);
      expect(isZodError(() => M.getRepo())).toBe(true);
    } finally {
      vi.doUnmock("@/lib/data/seed.json");
      vi.resetModules();
      clearGlobalRepo();
    }
    // With the mock undone, a fresh evaluation loads the real seed again.
    const M = await freshEvaluation();
    expect((await M.getRepo().listDemoAccounts()).length).toBeGreaterThan(0);
  });

  it("listInventory('2026-10-24') drops the seeded expired items on shared and fresh repos", async () => {
    // **Validates: Requirements 3.3**
    const M = await freshEvaluation();
    for (const repo of [M.getRepo(), M.createRepoFromSeed()]) {
      const all = (await repo.listInventory("2026-10-24")).map((i) => i.id);
      expect(all).not.toContain("inv-hv-expired-taq");
      expect(all).not.toContain("inv-tp-expired-buffer");
      expect(all).toContain("inv-hv-tips");

      const hv = (
        await repo.listInventory("2026-10-24", { companyId: CO_HARBORVIEW })
      ).map((i) => i.id);
      expect(hv).not.toContain("inv-hv-expired-taq");
      expect(hv).toContain("inv-hv-tips");
    }
  });

  it("property: listInventory(runDate, filter?) returns exactly the seed+saved items with expiry > runDate", async () => {
    // **Validates: Requirements 3.3, 3.5**
    const M = await freshEvaluation();
    await fc.assert(
      fc.asyncProperty(
        fc.array(savedItemArb, { minLength: 0, maxLength: 8 }),
        isoDateArb,
        fc.option(fc.constantFrom(...SEED_COMPANY_IDS), { nil: null }),
        async (specs, runDate, companyId) => {
          const saved = specs.map((s) =>
            InventoryItem.parse({
              ...makeItem(s.quantity),
              companyId: s.companyId,
              expiry: s.expiry,
            }),
          );
          const fresh = M.createRepoFromSeed();
          await fresh.saveInventory(saved);

          const filter = companyId === null ? undefined : { companyId };
          expect(await fresh.listInventory(runDate, filter)).toEqual(
            expectedInventory([...SEED_INVENTORY, ...saved], runDate, companyId),
          );
          // The shared repo (seed only, untouched by this run) follows the same rule.
          expect(await M.getRepo().listInventory(runDate, filter)).toEqual(
            expectedInventory(SEED_INVENTORY, runDate, companyId),
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);

  it("writes and reads through one evaluation's getRepo() round-trip", async () => {
    // **Validates: Requirements 3.5**
    const M = await freshEvaluation();
    const repo = M.getRepo();
    expect(M.getRepo()).toBe(repo);

    const kinds: WriteKind[] = [
      "saveAsk",
      "addTimelineEvent",
      "createOffer",
      "createErg",
      "saveInventory",
    ];
    for (const kind of kinds) {
      const w = await applyWrite(M.getRepo(), { kind, n: 7 });
      expect({ ...w, readable: await isReadable(M.getRepo(), w) }).toEqual({
        ...w,
        readable: true,
      });
    }

    const ask = makeAsk(5);
    await repo.saveAsk(ask);
    const updated = await repo.setAskStatus(ask.id, "matched");
    expect(updated).toEqual({ ...ask, status: "matched" });
    expect(await M.getRepo().getAsk(ask.id)).toEqual(updated);

    const offer = makeOffer(4);
    await repo.createOffer(offer);
    const changed = { ...offer, capacity: 9 };
    await repo.updateOffer(changed);
    const offers = await M.getRepo().listOffers({ companyId: CO_HARBORVIEW });
    expect(offers.find((o) => o.id === offer.id)).toEqual(changed);
  });
});
