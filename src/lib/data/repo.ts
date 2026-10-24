import { z } from "zod";

import {
  Account,
  type AccountId,
  Ask,
  type AskId,
  type AskStatus,
  Company,
  type CompanyId,
  Erg,
  type ErgId,
  InventoryItem,
  Offer,
  type OfferId,
  Organization,
  type OrgId,
  TimelineEvent,
} from "@/lib/schemas";

import seed from "./seed.json";

/**
 * In-memory repository for Quippe (Task 10.1; Req 1, 2, 4, 5, 6, 7, 8, 9, 11,
 * 13, 14, 15).
 *
 * This is the ONLY module that touches the in-memory store. The store is
 * loaded and validated from `seed.json` at startup against the shared zod
 * schemas, so the seed, the AI layer, and the API can never disagree on shape
 * (Req 19.3). Resetting on process restart is acceptable for the demo
 * (tech.md).
 *
 * Methods are synchronous (in-memory) but typed as `Promise` so a future DB
 * swap needs no call-site changes (design: data layer).
 *
 * The repo APPLIES THE EXPIRED-ITEM FILTER on every inventory read so no layer
 * can accidentally surface expired items (Req 14.4). The run date is passed in
 * by the caller so the pure core filter stays pure — this module performs the
 * same `expiry > runDate` comparison the core uses.
 */

// --- Seed shape ----------------------------------------------------------

/**
 * A city-coordinate row from the Seed_City_Table (Req 15.6). Longitude is
 * named `lon` to match the core's `CityCoords`/`getCityCoords` return shape.
 */
const CityCoordsRow = z.object({
  city: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
});

/**
 * The full seed document. Validated once at module load; a malformed seed
 * throws immediately (surfaced by `npm run seed:check`, Req 19.3).
 */
export const SeedSchema = z.object({
  accounts: z.array(Account),
  organizations: z.array(Organization),
  companies: z.array(Company),
  ergs: z.array(Erg),
  offers: z.array(Offer),
  asks: z.array(Ask),
  inventory: z.array(InventoryItem),
  timeline: z.array(TimelineEvent),
  cityCoords: z.array(CityCoordsRow),
});
export type Seed = z.infer<typeof SeedSchema>;

// --- Repo interface ------------------------------------------------------

export interface Repo {
  // Accounts / auth (Req 1)
  listDemoAccounts(): Promise<Account[]>;
  getAccount(id: AccountId): Promise<Account | null>;

  // Organizations & timeline (Req 2, 6)
  getOrganization(id: OrgId): Promise<Organization | null>;
  listTimelineEvents(orgId: OrgId): Promise<TimelineEvent[]>;
  addTimelineEvent(e: TimelineEvent): Promise<void>;

  // Companies, offers, ERGs (Req 4, 7)
  getCompany(id: CompanyId): Promise<Company | null>;
  listOffers(filter?: { companyId?: CompanyId }): Promise<Offer[]>;
  createOffer(o: Offer): Promise<Offer>;
  updateOffer(o: Offer): Promise<Offer>;
  getErg(id: ErgId): Promise<Erg | null>;
  createErg(e: Erg): Promise<Erg>;
  ergExistsForCompany(companyId: CompanyId): Promise<boolean>;

  // Asks (Req 5, 6, 8, 9)
  getAsk(id: AskId): Promise<Ask | null>;
  listAsks(filter?: { orgId?: OrgId; status?: AskStatus }): Promise<Ask[]>;
  saveAsk(a: Ask): Promise<Ask>;
  setAskStatus(id: AskId, status: AskStatus): Promise<Ask>;

  // Inventory (Req 11, 13, 14)
  listInventory(
    runDate: string,
    filter?: { companyId?: CompanyId },
  ): Promise<InventoryItem[]>;
  saveInventory(items: InventoryItem[]): Promise<InventoryItem[]>;

  // Seed table (Req 15.6)
  getCityCoords(city: string): Promise<{ lat: number; lon: number } | null>;
}

// --- Store ---------------------------------------------------------------

/**
 * Mutable in-memory tables. Entities that never change in the MVP
 * (accounts, organizations, companies, city coords) are frozen after load;
 * tables the API writes to (offers, ergs, asks, inventory, timeline) stay
 * mutable so the demo flow can create/accept/approve.
 */
interface Store {
  accounts: readonly Account[];
  organizations: readonly Organization[];
  companies: readonly Company[];
  ergs: Erg[];
  offers: Offer[];
  asks: Ask[];
  inventory: InventoryItem[];
  timeline: TimelineEvent[];
  cityCoords: ReadonlyMap<string, { lat: number; lon: number }>;
}

/**
 * Validate `seed.json` against the schemas and build the store. Throws on the
 * first schema error so the problem surfaces at startup / in `seed:check`.
 */
function loadStore(): Store {
  const data = SeedSchema.parse(seed);
  return {
    accounts: Object.freeze([...data.accounts]),
    organizations: Object.freeze([...data.organizations]),
    companies: Object.freeze([...data.companies]),
    ergs: [...data.ergs],
    offers: [...data.offers],
    asks: [...data.asks],
    inventory: [...data.inventory],
    timeline: [...data.timeline],
    cityCoords: new Map(
      data.cityCoords.map((c) => [c.city, { lat: c.lat, lon: c.lon }]),
    ),
  };
}

/**
 * An item is expired when its expiry date is on or before the run date
 * (Req 11.7, 14.4). ISO date strings (`YYYY-MM-DD`) compare correctly
 * lexically, matching the pure core's comparison.
 */
function isExpired(expiry: string, runDate: string): boolean {
  return expiry <= runDate;
}

// --- In-memory implementation --------------------------------------------

class InMemoryRepo implements Repo {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  // Accounts -------------------------------------------------------------

  async listDemoAccounts(): Promise<Account[]> {
    return [...this.store.accounts];
  }

  async getAccount(id: AccountId): Promise<Account | null> {
    return this.store.accounts.find((a) => a.id === id) ?? null;
  }

  // Organizations & timeline --------------------------------------------

  async getOrganization(id: OrgId): Promise<Organization | null> {
    return this.store.organizations.find((o) => o.id === id) ?? null;
  }

  async listTimelineEvents(orgId: OrgId): Promise<TimelineEvent[]> {
    return this.store.timeline.filter((e) => e.orgId === orgId);
  }

  async addTimelineEvent(e: TimelineEvent): Promise<void> {
    this.store.timeline.push(e);
  }

  // Companies, offers, ERGs ---------------------------------------------

  async getCompany(id: CompanyId): Promise<Company | null> {
    return this.store.companies.find((c) => c.id === id) ?? null;
  }

  async listOffers(filter?: { companyId?: CompanyId }): Promise<Offer[]> {
    const companyId = filter?.companyId;
    if (companyId === undefined) return [...this.store.offers];
    return this.store.offers.filter((o) => o.companyId === companyId);
  }

  async createOffer(o: Offer): Promise<Offer> {
    this.store.offers.push(o);
    return o;
  }

  async updateOffer(o: Offer): Promise<Offer> {
    const idx = this.store.offers.findIndex((x) => x.id === o.id);
    if (idx === -1) throw new Error(`offer not found: ${o.id}`);
    this.store.offers[idx] = o;
    return o;
  }

  async getErg(id: ErgId): Promise<Erg | null> {
    return this.store.ergs.find((e) => e.id === id) ?? null;
  }

  async createErg(e: Erg): Promise<Erg> {
    this.store.ergs.push(e);
    return e;
  }

  async ergExistsForCompany(companyId: CompanyId): Promise<boolean> {
    return this.store.ergs.some((e) => e.companyId === companyId);
  }

  // Asks -----------------------------------------------------------------

  async getAsk(id: AskId): Promise<Ask | null> {
    return this.store.asks.find((a) => a.id === id) ?? null;
  }

  async listAsks(filter?: {
    orgId?: OrgId;
    status?: AskStatus;
  }): Promise<Ask[]> {
    return this.store.asks.filter((a) => {
      if (filter?.orgId !== undefined && a.orgId !== filter.orgId) return false;
      if (filter?.status !== undefined && a.status !== filter.status) {
        return false;
      }
      return true;
    });
  }

  async saveAsk(a: Ask): Promise<Ask> {
    const idx = this.store.asks.findIndex((x) => x.id === a.id);
    if (idx === -1) this.store.asks.push(a);
    else this.store.asks[idx] = a;
    return a;
  }

  async setAskStatus(id: AskId, status: AskStatus): Promise<Ask> {
    const ask = this.store.asks.find((a) => a.id === id);
    if (ask === undefined) throw new Error(`ask not found: ${id}`);
    const updated: Ask = { ...ask, status };
    const idx = this.store.asks.findIndex((a) => a.id === id);
    this.store.asks[idx] = updated;
    return updated;
  }

  // Inventory ------------------------------------------------------------

  async listInventory(
    runDate: string,
    filter?: { companyId?: CompanyId },
  ): Promise<InventoryItem[]> {
    // Expired items are never returned (Req 14.4) — the filter is applied on
    // every read so no caller can surface an expired item.
    return this.store.inventory.filter((item) => {
      if (isExpired(item.expiry, runDate)) return false;
      if (
        filter?.companyId !== undefined &&
        item.companyId !== filter.companyId
      ) {
        return false;
      }
      return true;
    });
  }

  async saveInventory(items: InventoryItem[]): Promise<InventoryItem[]> {
    // Confirmed items only (Req 13.5). Upsert by id.
    for (const item of items) {
      const idx = this.store.inventory.findIndex((x) => x.id === item.id);
      if (idx === -1) this.store.inventory.push(item);
      else this.store.inventory[idx] = item;
    }
    return items;
  }

  // Seed table -----------------------------------------------------------

  async getCityCoords(
    city: string,
  ): Promise<{ lat: number; lon: number } | null> {
    return this.store.cityCoords.get(city) ?? null;
  }
}

// --- Singleton -----------------------------------------------------------

let repoInstance: InMemoryRepo | null = null;

/**
 * Return the process-wide repo, loading and validating the seed on first use.
 */
export function getRepo(): Repo {
  if (repoInstance === null) {
    repoInstance = new InMemoryRepo(loadStore());
  }
  return repoInstance;
}

/**
 * Build a fresh repo from the seed — used by tests so each test starts from a
 * clean in-memory store (the mutable tables are not shared with the
 * singleton).
 */
export function createRepoFromSeed(): Repo {
  return new InMemoryRepo(loadStore());
}
