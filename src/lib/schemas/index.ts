import { z } from "zod";

import {
  AccountId,
  AskId,
  AskStatus,
  BomLineId,
  CompanyId,
  CoverageStatus,
  DeliveryMode,
  ErgId,
  EventId,
  HazardClass,
  ItemId,
  OfferId,
  OfferType,
  OrgId,
  OrgType,
  Role,
  Unit,
} from "./enums";

/**
 * Entity schemas for Quippe — the shared schema entry point.
 *
 * This module is the single source of truth for every domain shape. The same
 * zod schemas are imported by API routes (input validation), the AI layer
 * (output validation), and the seed loader (`seed.json` validation), so the
 * seed, the AI, and the API can never disagree on shape (Req 19.3).
 *
 * Design invariants encoded here:
 * - IDs are branded strings (from `./enums`) so the ID-scope validator (CP9)
 *   compares reference sets without mixing namespaces.
 * - No student personal-identity attribute exists anywhere in the model —
 *   no full name, DOB, home address, personal email/phone, photo, or
 *   government ID on any entity. Organizations use org-level mission/academic
 *   fields only; asks use mission/topic fields only (Req 7.7, 7.8, 17.4, 17.5).
 * - Deterministic field bounds live in the schemas so every layer rejects
 *   out-of-range input identically (Req 4.5, 4.6, 7.1, 7.2, 8.1, 10.1).
 *
 * The enums and branded IDs are re-exported at the bottom so consumers have a
 * single import surface (`src/lib/schemas`).
 */

// --- Shared helpers ------------------------------------------------------

// An ISO date string (e.g. "2025-02-14"). Compared lexically to the injected
// run date by the pure core; kept as a plain non-empty string for the MVP.
const IsoDate = z.string().min(1);

// --- Organization (Req 2, 7, 9, 17) --------------------------------------
// Org-level/mission/academic fields only. No student identity attributes.
// `advisorAccountId` is refined to be required for high_school_club below.
export const Organization = z
  .object({
    id: OrgId,
    type: OrgType,
    name: z.string().min(1),
    school: z.string().min(1),
    city: z.string().min(1),
    size: z.number().int().min(1), // number of members; count only, no identities
    mission: z.string().min(1), // org describes its own mission (Req 7.5, 17)
    underResourced: z.boolean(), // raises soft score (Req 16.1)
    ageYears: z.number().min(0), // org age used by the min-age hard filter (Req 15.5)
    advisorAccountId: AccountId.optional(),
  })
  .superRefine((org, ctx) => {
    // A high school club must name an advisor account (Req 9, glossary). The
    // advisor is referenced by account id only — never by personal identity.
    if (org.type === "high_school_club" && org.advisorAccountId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "advisorAccountId is required when type is high_school_club",
        path: ["advisorAccountId"],
      });
    }
  });
export type Organization = z.infer<typeof Organization>;

// --- Company (Req 4, 6, 13) ----------------------------------------------
export const Company = z.object({
  id: CompanyId,
  name: z.string().min(1),
  city: z.string().min(1),
  liaisonAccountId: AccountId,
});
export type Company = z.infer<typeof Company>;

// --- Erg (Req 7) ---------------------------------------------------------
export const Erg = z.object({
  id: ErgId,
  companyId: CompanyId,
  leadAccountId: AccountId,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000), // only text used for erg_event fit (Req 7.5)
  topics: z.array(z.string().min(1)).min(1).max(20),
  capacityPerSemester: z.number().int().min(1).max(10000),
});
export type Erg = z.infer<typeof Erg>;

// --- Offer (Req 4, 15) ---------------------------------------------------
export const Offer = z.object({
  id: OfferId,
  companyId: CompanyId,
  ergId: ErgId.optional(), // present iff type === "erg_event"
  type: OfferType,
  capacity: z.number().int().min(1).max(10000),
  availableDates: z.array(IsoDate),
  deliveryMode: DeliveryMode,
  city: z.string().min(1),
  minAge: z.number().int().min(0).max(25).optional(), // int 0..25 when provided (Req 4.5)
  notes: z.string().max(2000), // ≤ 2000 chars (Req 4.5)
});
export type Offer = z.infer<typeof Offer>;

// --- Ask (Req 8, 9) ------------------------------------------------------
// Mission/topic fields only; carries no student identity attribute.
export const Ask = z.object({
  id: AskId,
  orgId: OrgId,
  type: OfferType,
  groupSize: z.number().int().min(1).max(500), // 1..500 (Req 8.1)
  preferredDates: z.array(IsoDate),
  deliveryMode: DeliveryMode,
  topic: z.string().min(1),
  needsSupplies: z.boolean(),
  status: AskStatus, // lifecycle per Req 6, 9
});
export type Ask = z.infer<typeof Ask>;

// --- Match (Req 5, 16) ---------------------------------------------------
export const Match = z.object({
  askId: AskId,
  offerId: OfferId,
  score: z.number().min(0).max(1), // soft score 0.0..1.0 (Req 16.1)
  reasons: z.array(z.string()), // one per contributing factor (Req 16.4)
});
export type Match = z.infer<typeof Match>;

// --- InventoryItem (Req 11, 13, 14) --------------------------------------
export const InventoryItem = z.object({
  id: ItemId,
  companyId: CompanyId,
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().positive(), // available quantity > 0
  unit: Unit,
  expiry: IsoDate, // compared to the run date (Req 11.7, 14.4, CP5)
  hazardClass: HazardClass,
  hsSafe: z.boolean(), // authoritative, computed by rules (Req 14) — never AI
});
export type InventoryItem = z.infer<typeof InventoryItem>;

// --- TimelineEvent (Req 2, 6) --------------------------------------------
export const TimelineEventKind = z.enum([
  "ask",
  "match",
  "visit",
  "donation",
  "accepted",
  "declined",
]);
export type TimelineEventKind = z.infer<typeof TimelineEventKind>;

export const TimelineEvent = z.object({
  id: EventId,
  orgId: OrgId,
  companyId: CompanyId.optional(),
  kind: TimelineEventKind,
  date: IsoDate, // reverse-chron ordering (Req 2.4)
  seq: z.number().int(), // stable secondary sort key for same-date events (Req 2.4)
  summary: z.string().min(1),
  refs: z.array(z.string()), // referenced entity IDs — allowed-ID set for handoff (CP9)
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

// --- BOM (Req 10) --------------------------------------------------------
export const BomLine = z.object({
  id: BomLineId,
  item: z.string().min(1), // non-empty (Req 10.1)
  category: z.string().min(1), // non-empty (Req 10.1)
  quantity: z.number().positive(), // > 0 (Req 10.1)
  unit: Unit,
  purpose: z.string().min(1), // non-empty (Req 10.1)
});
export type BomLine = z.infer<typeof BomLine>;

export const BOM = z.object({
  lines: z.array(BomLine).min(1).max(200), // 1..200 lines (Req 10.1)
});
export type BOM = z.infer<typeof BOM>;

// --- Coverage (Req 11) ---------------------------------------------------
export const CoverageLine = z.object({
  bomLineId: BomLineId,
  status: CoverageStatus,
  needed: z.number(),
  allocated: z.number(),
  supplyingCompanyId: CompanyId.optional(), // present iff covered/partial (Req 11.2)
  itemRefs: z.array(ItemId), // allocated inventory items — allowed-ID set for protocol (CP9)
});
export type CoverageLine = z.infer<typeof CoverageLine>;

export const CoverageReport = z.object({
  lines: z.array(CoverageLine),
  runDate: IsoDate,
});
export type CoverageReport = z.infer<typeof CoverageReport>;

// --- HandoffSummary (Req 3) ----------------------------------------------
export const HandoffSummary = z.object({
  activeRelationships: z.array(z.string()),
  contactsByRole: z.record(z.string(), z.array(z.string())),
  openAsks: z.array(z.string()),
  whatWorked: z.array(z.string()),
  referencedIds: z.array(z.string()), // must ⊆ input TimelineEvent refs (CP9, Req 3.3)
});
export type HandoffSummary = z.infer<typeof HandoffSummary>;

// --- Account (Req 1) -----------------------------------------------------
// Minimal demo-only identity: a role and optional org/company/erg binding.
// No credentials and no student personal-identity attributes exist (Req 1.2).
export const Account = z.object({
  id: AccountId,
  role: Role,
  orgId: OrgId.optional(),
  companyId: CompanyId.optional(),
  ergId: ErgId.optional(),
});
export type Account = z.infer<typeof Account>;

// --- Single import surface -----------------------------------------------
// Re-export the enums and branded IDs so consumers import everything from
// `src/lib/schemas`.
export * from "./enums";
