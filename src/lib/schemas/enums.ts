import { z } from "zod";

/**
 * Shared enums and branded ID types for Quippe.
 *
 * This is the leaf schema layer: `lib/core`, `lib/ai`, `lib/data`, and the
 * API routes all depend on these definitions and nothing depends back on them.
 * Every enum exports both the zod schema and its inferred TypeScript type under
 * the same name. Branded ID strings let the ID-scope validator (CP9) compare
 * sets of references without mixing namespaces (e.g. an OfferId can never be
 * confused with an AskId at the type level).
 */

// Organization category (Req 2, 7, 17).
export const OrgType = z.enum([
  "high_school_club",
  "college_club",
  "undergrad_lab",
  "community_org",
]);
export type OrgType = z.infer<typeof OrgType>;

// What a company can offer (Req 4).
export const OfferType = z.enum(["supplies", "lab_tour", "speaker", "erg_event"]);
export type OfferType = z.infer<typeof OfferType>;

// Ask lifecycle status (Req 6, 8, 9). `rejected` is required for advisor
// rejection (Req 9.5); `pending_advisor_approval` and `rejected` are hidden
// from companies (CP2).
export const AskStatus = z.enum([
  "draft",
  "pending_advisor_approval",
  "open",
  "matched",
  "accepted",
  "declined",
  "completed",
  "rejected",
]);
export type AskStatus = z.infer<typeof AskStatus>;

// How an offer/ask is delivered (Req 15).
export const DeliveryMode = z.enum(["in_person", "virtual"]);
export type DeliveryMode = z.infer<typeof DeliveryMode>;

// Hazard classification of an inventory item (Req 14). `none` is explicitly a
// safe class; `unknown` (or a missing class) collapses hs_safe to false
// (Req 14.3).
export const HazardClass = z.enum([
  "none",
  "flammable",
  "corrosive",
  "toxic",
  "carcinogen",
  "biohazard",
  "oxidizer",
  "unknown",
]);
export type HazardClass = z.infer<typeof HazardClass>;

// Units of measure (Req 11.5). Dimensions: volume {uL, mL, L}, mass {mg, g},
// count {unit}. Cross-dimension conversions are non-convertible (Req 11.6).
export const Unit = z.enum(["uL", "mL", "L", "mg", "g", "unit"]);
export type Unit = z.infer<typeof Unit>;

// Coverage classification of a BOM line (Req 11.3, 11.4).
export const CoverageStatus = z.enum(["covered", "partial", "missing"]);
export type CoverageStatus = z.infer<typeof CoverageStatus>;

// Demo account roles (Req 1.1): exactly one seeded account per role.
export const Role = z.enum([
  "club_officer",
  "club_advisor",
  "club_member",
  "company_liaison",
  "erg_lead",
]);
export type Role = z.infer<typeof Role>;

// --- Branded ID string types (CP9) ---------------------------------------
// Each is a non-empty string branded with its namespace so the ID-scope
// validator can compare reference sets without mixing namespaces.

export const OrgId = z.string().min(1).brand<"OrgId">();
export type OrgId = z.infer<typeof OrgId>;

export const CompanyId = z.string().min(1).brand<"CompanyId">();
export type CompanyId = z.infer<typeof CompanyId>;

export const ErgId = z.string().min(1).brand<"ErgId">();
export type ErgId = z.infer<typeof ErgId>;

export const OfferId = z.string().min(1).brand<"OfferId">();
export type OfferId = z.infer<typeof OfferId>;

export const AskId = z.string().min(1).brand<"AskId">();
export type AskId = z.infer<typeof AskId>;

export const ItemId = z.string().min(1).brand<"ItemId">();
export type ItemId = z.infer<typeof ItemId>;

export const EventId = z.string().min(1).brand<"EventId">();
export type EventId = z.infer<typeof EventId>;

export const BomLineId = z.string().min(1).brand<"BomLineId">();
export type BomLineId = z.infer<typeof BomLineId>;

export const AccountId = z.string().min(1).brand<"AccountId">();
export type AccountId = z.infer<typeof AccountId>;
