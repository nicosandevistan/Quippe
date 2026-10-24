"use server";

import { revalidatePath } from "next/cache";

import { computeHsSafe } from "@/lib/core/safety";
import { getRepo } from "@/lib/data/repo";
import {
  type CompanyId,
  HazardClass,
  InventoryItem,
  Offer,
  OfferType,
  Unit,
} from "@/lib/schemas";

import { getCurrentAccount } from "../../session";

/**
 * Company (liaison / ERG lead) server actions — UI stand-ins (Task 25.1;
 * Req 4, 7, 13, 14).
 *
 * TODO(api): switch to `POST /api/offers`, `POST /api/ergs`,
 * `POST /api/inventory/normalize`, and `POST /api/inventory/confirm` once
 * Tasks 17 and 20 land. The validation and the `computeHsSafe` override below
 * mirror what those routes must enforce, so behavior is correct in the demo and
 * the swap is a thin change.
 */

type FieldErrors = Record<string, string>;
export type OfferResult =
  | { ok: true }
  | { ok: false; errors: FieldErrors; message?: string };

function requireLiaison(account: Awaited<ReturnType<typeof getCurrentAccount>>) {
  return (
    account &&
    (account.role === "company_liaison" || account.role === "erg_lead") &&
    account.companyId
  );
}

/** Create an offer with zod validation; erg_event requires an existing ERG (Req 7.4). */
export async function createOfferAction(
  formData: FormData,
): Promise<OfferResult> {
  const account = await getCurrentAccount();
  if (!requireLiaison(account) || !account?.companyId) {
    return { ok: false, errors: {}, message: "Only a company liaison can post offers." };
  }
  const companyId = account.companyId as CompanyId;
  const repo = getRepo();

  const typeRaw = String(formData.get("type") ?? "");
  const errors: FieldErrors = {};

  const typeParsed = OfferType.safeParse(typeRaw);
  if (!typeParsed.success) errors.type = "Pick a valid offer type.";

  const capacityRaw = Number(formData.get("capacity"));
  if (!Number.isInteger(capacityRaw) || capacityRaw < 1 || capacityRaw > 10000) {
    errors.capacity = "Capacity must be a whole number from 1 to 10000.";
  }

  const deliveryMode = String(formData.get("deliveryMode") ?? "");
  if (deliveryMode !== "in_person" && deliveryMode !== "virtual") {
    errors.deliveryMode = "Choose in person or virtual.";
  }

  const city = String(formData.get("city") ?? "").trim();
  if (!city) errors.city = "City is required.";

  const notes = String(formData.get("notes") ?? "");
  if (notes.length > 2000) errors.notes = "Notes must be 2000 characters or fewer.";

  // erg_event needs an existing ERG for this company (Req 7.4).
  if (typeParsed.success && typeParsed.data === "erg_event") {
    const hasErg = await repo.ergExistsForCompany(companyId);
    if (!hasErg) {
      errors.type = "Create an ERG before posting an ERG event.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const offer = Offer.parse({
    id: `off-${companyId}-${Date.now()}`,
    companyId,
    type: typeParsed.success ? typeParsed.data : "supplies",
    capacity: capacityRaw,
    availableDates: [],
    deliveryMode,
    city,
    notes,
  });
  await repo.createOffer(offer);
  revalidatePath(`/company/${companyId}`);
  return { ok: true };
}

// --- Inventory CSV: normalize (review) then confirm (persist) ------------

export interface ReviewRow {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  expiry: string;
  hazardClass: string;
  /** hsSafe as the rule would compute it — shown read-only in the review. */
  ruleHsSafe: boolean;
}

/**
 * Parse a pasted CSV into a review set WITHOUT persisting (Req 13.1, 13.4).
 * Enforces the ≤5000-row limit. `hsSafe` is computed by the rule for preview,
 * and recomputed authoritatively on confirm.
 *
 * Columns: name,category,quantity,unit,expiry,hazardClass
 */
export async function normalizeInventoryAction(
  csv: string,
): Promise<
  { ok: true; rows: ReviewRow[] } | { ok: false; message: string }
> {
  const account = await getCurrentAccount();
  if (!requireLiaison(account)) {
    return { ok: false, message: "Only a company liaison can upload inventory." };
  }
  if (csv.length > 10_000_000) {
    return { ok: false, message: "That file is too large (10MB limit)." };
  }

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  // Drop a header row if present.
  if (lines.length > 0 && /name\s*,\s*category/i.test(lines[0])) lines.shift();

  if (lines.length > 5000) {
    return { ok: false, message: "Too many rows (5000 limit)." };
  }

  const rows: ReviewRow[] = lines.map((line) => {
    const [name = "", category = "", qtyRaw = "", unit = "", expiry = "", hazardRaw = ""] =
      line.split(",").map((c) => c.trim());
    const hazardClass = HazardClass.safeParse(hazardRaw).success
      ? hazardRaw
      : "unknown";
    const quantity = Number(qtyRaw);
    return {
      name,
      category,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      unit,
      expiry,
      hazardClass,
      // AI-suggested hsSafe is unknown from a raw CSV; assume the uploader
      // believes it safe, then let the rule decide (it can only tighten).
      ruleHsSafe: computeHsSafe(
        { hazardClass: hazardClass as HazardClass, name, category },
        true,
      ),
    };
  });

  return { ok: true, rows };
}

/**
 * Persist confirmed inventory rows (Req 13.5, 14.1–14.2). `hsSafe` is set
 * authoritatively by `computeHsSafe` — the AI/CSV value never decides it.
 */
export async function confirmInventoryAction(
  rows: ReviewRow[],
): Promise<{ ok: true; saved: number } | { ok: false; message: string }> {
  const account = await getCurrentAccount();
  if (!requireLiaison(account) || !account?.companyId) {
    return { ok: false, message: "Only a company liaison can save inventory." };
  }
  const companyId = account.companyId as CompanyId;

  const items: InventoryItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const unit = Unit.safeParse(r.unit);
    const hazardClass = HazardClass.safeParse(r.hazardClass);
    if (!unit.success || !hazardClass.success || r.quantity <= 0 || !r.name) {
      return {
        ok: false,
        message: `Row ${i + 1} has an invalid unit, hazard class, quantity, or name.`,
      };
    }
    const parsed = InventoryItem.safeParse({
      id: `inv-${companyId}-${Date.now()}-${i}`,
      companyId,
      name: r.name,
      category: r.category,
      quantity: r.quantity,
      unit: unit.data,
      expiry: r.expiry,
      hazardClass: hazardClass.data,
      // Authoritative rule override (Req 14.2).
      hsSafe: computeHsSafe(
        { hazardClass: hazardClass.data, name: r.name, category: r.category },
        true,
      ),
    });
    if (!parsed.success) {
      return { ok: false, message: `Row ${i + 1} failed validation.` };
    }
    items.push(parsed.data);
  }

  const repo = getRepo();
  await repo.saveInventory(items);
  revalidatePath(`/company/${companyId}`);
  return { ok: true, saved: items.length };
}
