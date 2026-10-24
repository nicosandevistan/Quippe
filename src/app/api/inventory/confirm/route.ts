import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { computeHsSafe } from "@/lib/core/safety";
import { getRepo } from "@/lib/data/repo";
import { InventoryItem, type CompanyId } from "@/lib/schemas";

import { requireRole } from "../../_lib/guard";

/**
 * Inventory confirmation route for Quippe (Task 20.1; Req 13.5, 14.1, 14.2,
 * 14.3).
 *
 * `POST /api/inventory/confirm` is the "people confirm" half of the inventory
 * upload flow. The client sends back the review set the liaison inspected and
 * possibly edited; this route persists ONLY those confirmed items (Req 13.5).
 * Nothing is saved until this explicit confirm action runs, so the normalize
 * step leaves saved inventory untouched.
 *
 * The handler is ordered so a rejected request changes nothing:
 *
 *   authorize (company liaison) → parse body → validate each confirmed item
 *   against the InventoryItem schema → for each item: bind server-owned
 *   companyId + override hsSafe with the deterministic rule → persist.
 *
 * Authoritative hs_safe (Req 14.1–14.3): the `hsSafe` on each submitted item is
 * only the AI's (or the liaison's edited) SUGGESTION. It is never persisted as
 * given. For every item the route recomputes the authoritative value with
 * `computeHsSafe(item, item.hsSafe)`, so a keyword hit, a non-`none`/unknown
 * hazard class, or AI/rule disagreement collapses the stored value to false.
 * The company is taken from the session, never trusted from the client.
 */

/** Only a company liaison confirms inventory for their company (Req 13). */
const ALLOWED_ROLE = "company_liaison" as const;

/**
 * A confirmed item as sent by the client: the full `InventoryItem` schema with
 * the server-owned `companyId` omitted. Validating against this enforces the
 * schema on each item (Req 13.6 operates on the same shape) while making it
 * impossible for the client to assign an item to another company. The client's
 * `hsSafe` is accepted as a suggestion and overridden below.
 */
const ConfirmedItemInput = InventoryItem.omit({ companyId: true });

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Authorize by role first — a denied request never touches the repo.
  const auth = await requireRole(req, ALLOWED_ROLE);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const companyId = (session.companyId ?? null) as CompanyId | null;
  if (companyId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with a company." },
      { status: 403 },
    );
  }

  // 2) Parse the JSON body.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  // The body carries the confirmed items under `items`. Require an explicit,
  // non-empty list — the liaison must confirm at least one item (Req 13.5).
  const rawItems =
    typeof json === "object" &&
    json !== null &&
    Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : null;
  if (rawItems === null || rawItems.length === 0) {
    return NextResponse.json(
      {
        error:
          "Confirm at least one item. Only the items you explicitly confirm are saved.",
      },
      { status: 400 },
    );
  }

  // 3) Validate EACH confirmed item against the schema before anything is
  //    saved (Req 13.6). A single invalid item rejects the whole request with
  //    per-item field errors, leaving all saved inventory unchanged.
  const parsed = rawItems.map((it) => ConfirmedItemInput.safeParse(it));
  const invalid = parsed.flatMap((p, i) =>
    p.success ? [] : [{ index: i, fieldErrors: p.error.flatten().fieldErrors }],
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error:
          "One or more confirmed items are invalid. Correct them and try again.",
        itemErrors: invalid,
      },
      { status: 400 },
    );
  }

  // 4) For each confirmed item: bind the server-owned companyId (never trust
  //    the client) and OVERRIDE hsSafe with the deterministic rule. The item's
  //    submitted `hsSafe` is passed only as the AI/edited suggestion so the
  //    rule can collapse to false on disagreement (Req 14.1, 14.2, 14.3).
  const confirmed: InventoryItem[] = parsed.flatMap((p) => {
    if (!p.success) return [];
    const suggested = p.data.hsSafe;
    const authoritativeHsSafe = computeHsSafe(
      {
        hazardClass: p.data.hazardClass,
        name: p.data.name,
        category: p.data.category,
      },
      suggested,
    );
    return [
      {
        ...p.data,
        companyId,
        hsSafe: authoritativeHsSafe,
      },
    ];
  });

  // 5) Persist ONLY the confirmed items (Req 13.5) and indicate completion.
  const repo = getRepo();
  const saved = await repo.saveInventory(confirmed);

  return NextResponse.json(
    { ok: true, saved: saved.length, items: saved },
    { status: 201 },
  );
}
