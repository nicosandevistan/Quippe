"use server";

import { revalidatePath } from "next/cache";
import { POST as acceptRoute } from "@/app/api/asks/[id]/accept/route";
import { POST as declineRoute } from "@/app/api/asks/[id]/decline/route";
import { POST as confirmInventoryRoute } from "@/app/api/inventory/confirm/route";
import { POST as normalizeInventoryRoute } from "@/app/api/inventory/normalize/route";
import { POST as offersRoute } from "@/app/api/offers/route";
import type { DecisionResult } from "@/components/DashboardEntryView";
import { apiErrorText, callApi } from "../../_lib/call-api";
import {
  firstFieldErrors,
  type ConfirmInventoryResult,
  type NormalizeInventoryResult,
  type OfferResult,
  type ReviewItem,
  type SavedItem,
} from "./company-types";

/**
 * Company page server actions (Task 25.1, rewired in Task 26.1; Req 4, 6,
 * 7, 13, 14).
 *
 * Every action calls the real API route in-process through `callApi`. The
 * routes decide who may act, validate input, apply the ERG gate, check
 * capacity, and compute `hsSafe` with the safety rules. These actions only
 * shape the form data going in and the answer coming out.
 */

// --- Offers ---------------------------------------------------------------

export async function createOfferAction(
  formData: FormData,
): Promise<OfferResult> {
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const body = {
    type: String(formData.get("type") ?? ""),
    // Send a number when the field holds one; otherwise send the text so the
    // API reports the field as invalid.
    capacity: capacityRaw !== "" && Number.isFinite(Number(capacityRaw))
      ? Number(capacityRaw)
      : capacityRaw,
    availableDates: [] as string[],
    deliveryMode: String(formData.get("deliveryMode") ?? ""),
    city: String(formData.get("city") ?? "").trim(),
    notes: String(formData.get("notes") ?? ""),
  };

  const res = await callApi<{ error?: string; fieldErrors?: unknown }>(
    offersRoute,
    { method: "POST", path: "/api/offers", body },
  );
  if (res.ok) {
    revalidatePath("/company/[id]", "page");
    return { ok: true };
  }
  const errors = firstFieldErrors(res.json?.fieldErrors);
  return {
    ok: false,
    errors,
    message: apiErrorText(res.json, "The offer couldn't be posted. Please try again."),
  };
}

// --- Accept / decline -----------------------------------------------------

async function decide(
  askId: string,
  offerId: string,
  kind: "accept" | "decline",
): Promise<DecisionResult> {
  const handler = kind === "accept" ? acceptRoute : declineRoute;
  const res = await callApi<{ ask?: { status: string }; error?: string }>(
    handler,
    {
      method: "POST",
      path: `/api/asks/${encodeURIComponent(askId)}/${kind}`,
      params: { id: askId },
      body: { offerId },
    },
  );
  const status = res.json?.ask?.status;
  if (!res.ok || status === undefined) {
    return {
      kind: "error",
      message: apiErrorText(res.json, "That didn't work. Please try again."),
    };
  }
  revalidatePath("/company/[id]", "page");
  return { kind: "done", status };
}

export async function acceptAskAction(
  askId: string,
  offerId: string,
): Promise<DecisionResult> {
  return decide(askId, offerId, "accept");
}

export async function declineAskAction(
  askId: string,
  offerId: string,
): Promise<DecisionResult> {
  return decide(askId, offerId, "decline");
}

// --- Inventory: normalize (review) then confirm (save) --------------------

/**
 * Send pasted CSV to `POST /api/inventory/normalize`. Nothing is saved. The
 * route enforces the size and row limits (413 with the exact limit) and
 * returns either structured items to review or its manual-table fallback.
 */
export async function normalizeInventoryAction(
  csv: string,
): Promise<NormalizeInventoryResult> {
  const res = await callApi<{
    ok?: boolean;
    review?: ReviewItem[];
    fallback?: { kind: string; rows: string };
    error?: string;
  }>(normalizeInventoryRoute, {
    method: "POST",
    path: "/api/inventory/normalize",
    body: { csv },
  });
  const body = res.json;
  if (!res.ok || body === null) {
    return {
      ok: false,
      message: apiErrorText(body, "The inventory couldn't be read. Please try again."),
    };
  }
  if (body.ok === true && Array.isArray(body.review)) {
    // Drop the server-owned companyId; confirm takes it from the session.
    const items: ReviewItem[] = body.review.map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      quantity: it.quantity,
      unit: it.unit,
      expiry: it.expiry,
      hazardClass: it.hazardClass,
      hsSafe: it.hsSafe,
    }));
    return { ok: true, source: "ai", items };
  }
  if (body.fallback !== undefined) {
    return { ok: true, source: "manual", csv: body.fallback.rows };
  }
  return { ok: false, message: "The inventory couldn't be read. Please try again." };
}

/**
 * Save the reviewed items through `POST /api/inventory/confirm`. The route
 * validates each item and sets `hsSafe` with the safety rules; the saved items
 * it returns are what the page shows.
 */
export async function confirmInventoryAction(
  items: ReviewItem[],
): Promise<ConfirmInventoryResult> {
  const res = await callApi<{
    ok?: boolean;
    saved?: number;
    items?: SavedItem[];
    error?: string;
    itemErrors?: Array<{ index: number; fieldErrors: unknown }>;
  }>(confirmInventoryRoute, {
    method: "POST",
    path: "/api/inventory/confirm",
    body: { items },
  });
  const body = res.json;
  if (!res.ok || body === null || !Array.isArray(body.items)) {
    const rows = (body?.itemErrors ?? []).map((e) => e.index + 1);
    const base = apiErrorText(body, "The items couldn't be saved. Please try again.");
    return {
      ok: false,
      message: rows.length > 0 ? `${base} Check row ${rows.join(", ")}.` : base,
    };
  }
  revalidatePath("/company/[id]", "page");
  return {
    ok: true,
    saved: body.saved ?? body.items.length,
    items: body.items.map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      hsSafe: it.hsSafe,
    })),
  };
}
