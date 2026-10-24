"use server";

import { revalidatePath } from "next/cache";

import { getRepo } from "@/lib/data/repo";
import type { AskId, OrgId } from "@/lib/schemas";

import { getCurrentAccount } from "../session";

/**
 * Advisor approve/reject actions — UI stand-ins (Task 25.2; Req 9.3–9.6).
 *
 * TODO(api): call `POST /api/asks/[id]/approve` and `/reject` once Task 18.2
 * lands. Those routes enforce the advisor-org ownership check server-side. We
 * repeat the ownership check here so the stand-in is already safe: an advisor
 * may only act on asks whose org is the advisor's org (Req 9.4). A mismatch
 * changes no data.
 */

type ActionResult = { ok: true; status: string } | { ok: false; message: string };

async function transition(
  askId: string,
  to: "open" | "rejected",
): Promise<ActionResult> {
  const account = await getCurrentAccount();
  if (!account || account.role !== "club_advisor" || !account.orgId) {
    return { ok: false, message: "Only a club advisor can do that." };
  }
  const repo = getRepo();
  const ask = await repo.getAsk(askId as AskId);
  if (!ask) return { ok: false, message: "That request no longer exists." };

  // Ownership: the advisor's org must match the ask's org (Req 9.4).
  if (ask.orgId !== (account.orgId as OrgId)) {
    return { ok: false, message: "That request is not for your club." };
  }
  // Only a pending request can be approved or rejected (Req 9.3).
  if (ask.status !== "pending_advisor_approval") {
    return { ok: false, message: "That request is not awaiting approval." };
  }

  const updated = await repo.setAskStatus(ask.id, to);
  revalidatePath("/advisor");
  return { ok: true, status: updated.status };
}

export async function approveAskAction(askId: string): Promise<ActionResult> {
  return transition(askId, "open");
}

export async function rejectAskAction(askId: string): Promise<ActionResult> {
  return transition(askId, "rejected");
}
