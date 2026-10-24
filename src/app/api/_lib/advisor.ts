import { NextResponse } from "next/server";

import { getRepo } from "@/lib/data/repo";
import type { Ask, AskId, AskStatus } from "@/lib/schemas";

import { denyOwnership } from "./guard";
import type { Session } from "./session";

/**
 * Shared decision logic for the two advisor ask-moderation routes (Task 18.2;
 * Req 9.3, 9.4, 9.5). `approve` and `reject` differ only in the target status,
 * so the guard order they share lives here once:
 *
 *   load ask → exists? → pending_advisor_approval? → advisor org owns it?
 *   → set status.
 *
 * Both the pending-only check and the ownership check run before any write, so
 * a mismatched advisor or a non-pending ask leaves the ask's status unchanged
 * (Req 9.4). The ownership check compares the advisor's SESSION org to the
 * ask's org — an advisor can only act on their own organization's asks.
 */

/** Outcome of a moderation attempt: either a response to return, or success. */
export type ModerateResult =
  | { ok: false; response: NextResponse }
  | { ok: true; ask: Ask };

/**
 * Apply an advisor moderation decision to an ask, moving it to `target` only
 * when every guard passes. `target` is `open` for approve (Req 9.3) and
 * `rejected` for reject (Req 9.5).
 */
export async function moderatePendingAsk(
  session: Session,
  askId: AskId,
  target: Extract<AskStatus, "open" | "rejected">,
): Promise<ModerateResult> {
  const repo = getRepo();

  // Load the ask. A missing ask is a 404 with nothing changed.
  const ask = await repo.getAsk(askId);
  if (ask === null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "That ask does not exist." },
        { status: 404 },
      ),
    };
  }

  // Ownership check: the advisor may act only on their own org's asks. A
  // mismatch is denied and the status is left unchanged (Req 9.4). Checked
  // before the write so a mismatched advisor never mutates state.
  if (session.orgId === undefined || ask.orgId !== session.orgId) {
    return { ok: false, response: denyOwnership(session, "ask") };
  }

  // Pending-only: approve/reject act only on an ask awaiting review. Any other
  // status is rejected with no change (Req 9.3, 9.5).
  if (ask.status !== "pending_advisor_approval") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "This ask is not awaiting advisor approval, so its status was left unchanged.",
        },
        { status: 409 },
      ),
    };
  }

  // Every guard passed: transition to the target status (Req 9.3, 9.5).
  const updated = await repo.setAskStatus(askId, target);
  return { ok: true, ask: updated };
}
