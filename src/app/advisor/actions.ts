"use server";

import { revalidatePath } from "next/cache";
import { POST as approveRoute } from "@/app/api/asks/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/asks/[id]/reject/route";
import { apiErrorText, callApi } from "../_lib/call-api";

/**
 * Advisor approve/reject actions (Task 25.2, rewired in Task 26.1;
 * Req 9.3–9.6).
 *
 * Each action calls the real route in-process. The route checks the advisor
 * role, that the ask belongs to the advisor's own club, and that it is still
 * waiting for approval, all before changing anything (Req 9.4). On approve the
 * route returns `matched` when the ask already fits an offer, else `open`.
 */

import type { AdvisorActionResult } from "./AdvisorQueueRow";

interface ModerateBody {
  ask?: { status: string };
  error?: string;
}

async function moderate(
  askId: string,
  kind: "approve" | "reject",
): Promise<AdvisorActionResult> {
  const handler = kind === "approve" ? approveRoute : rejectRoute;
  const res = await callApi<ModerateBody>(handler, {
    method: "POST",
    path: `/api/asks/${encodeURIComponent(askId)}/${kind}`,
    params: { id: askId },
  });
  const status = res.json?.ask?.status;
  if (!res.ok || status === undefined) {
    return {
      ok: false,
      message: apiErrorText(res.json, "That didn't work. Please try again."),
    };
  }
  revalidatePath("/advisor");
  return { ok: true, status };
}

export async function approveAskAction(
  askId: string,
): Promise<AdvisorActionResult> {
  return moderate(askId, "approve");
}

export async function rejectAskAction(
  askId: string,
): Promise<AdvisorActionResult> {
  return moderate(askId, "reject");
}
