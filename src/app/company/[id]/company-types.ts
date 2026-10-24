import type { HazardClass, Unit } from "@/lib/schemas";

/**
 * Shapes and small pure helpers shared by the company page's server actions
 * and client components (Task 26.1). Kept out of `actions.ts` because a
 * `"use server"` file may only export async functions.
 *
 * Nothing here makes a safety or eligibility decision. `hsSafe` on a review
 * item is only a suggestion; `POST /api/inventory/confirm` decides the stored
 * value with the safety rules.
 */

export type OfferResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string>; message?: string };

/** An inventory item under review: the API item minus `companyId`. */
export interface ReviewItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: Unit;
  expiry: string;
  hazardClass: HazardClass;
  /** Suggested value only. The server decides when you save. */
  hsSafe: boolean;
}

/** A saved item as the confirm route returned it. */
export interface SavedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  /** Decided by the server's safety rules. */
  hsSafe: boolean;
}

export type NormalizeInventoryResult =
  | { ok: true; source: "ai"; items: ReviewItem[] }
  | { ok: true; source: "manual"; csv: string }
  | { ok: false; message: string };

export type ConfirmInventoryResult =
  | { ok: true; saved: number; items: SavedItem[] }
  | { ok: false; message: string };

/** First message per field from zod's `flatten().fieldErrors`. */
export function firstFieldErrors(fieldErrors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof fieldErrors !== "object" || fieldErrors === null) return out;
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (Array.isArray(messages) && typeof messages[0] === "string") {
      out[field] = messages[0];
    }
  }
  return out;
}

const UNITS: readonly string[] = ["uL", "mL", "L", "mg", "g", "unit"];
const HAZARDS: readonly string[] = [
  "none",
  "flammable",
  "corrosive",
  "toxic",
  "carcinogen",
  "biohazard",
  "oxidizer",
  "unknown",
];

/**
 * Turn raw CSV text into editable rows for the manual table, used when the
 * AI couldn't read the upload. Columns: name, category, quantity, unit,
 * expiry, hazardClass. A header row is skipped. Unknown units become "unit"
 * and unknown hazard classes become "unknown" so the person reviewing sees
 * and fixes them. `newId` mints each row's id.
 */
export function rowsFromCsv(csv: string, newId: (index: number) => string): ReviewItem[] {
  const lines = csv
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length > 0 && /^name\s*,/i.test(lines[0])) lines.shift();
  return lines.map((line, i) => {
    const [name = "", category = "", qty = "", unit = "", expiry = "", hazard = ""] =
      line.split(",").map((c) => c.trim());
    const quantity = Number(qty);
    return {
      id: newId(i),
      name,
      category,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unit: (UNITS.includes(unit) ? unit : "unit") as Unit,
      expiry,
      hazardClass: (HAZARDS.includes(hazard) ? hazard : "unknown") as HazardClass,
      hsSafe: true,
    };
  });
}

export const UNIT_OPTIONS = UNITS as readonly Unit[];
export const HAZARD_OPTIONS = HAZARDS as readonly HazardClass[];
