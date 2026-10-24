"use server";

import { POST as handoffRoute } from "@/app/api/org/[id]/handoff/route";
import type { HandoffResult } from "@/components/HandoffSummaryView";
import type { HandoffSummary } from "@/lib/schemas";
import { apiErrorText, callApi } from "../../_lib/call-api";

/**
 * Handoff summary action (Task 23.2, rewired in Task 26.1; Req 3).
 *
 * Calls `POST /api/org/[id]/handoff` in-process. The route checks that the
 * caller is this org's officer, reads only this org's timeline, and returns
 * either a summary or its typed fallback (Req 3.4, 3.5). This action only
 * turns that answer into something the view can render.
 */

type HandoffBody =
  | { ok: true; summary: HandoffSummary }
  | { ok: false; summary: null; fallback: unknown }
  | { error: string };

export async function generateHandoffAction(
  orgId: string,
): Promise<HandoffResult> {
  const res = await callApi<HandoffBody>(handoffRoute, {
    method: "POST",
    path: `/api/org/${encodeURIComponent(orgId)}/handoff`,
    params: { id: orgId },
  });
  const body = res.json;
  if (!res.ok || body === null || !("ok" in body)) {
    return {
      kind: "error",
      message: apiErrorText(body, "The handoff summary couldn't be made. Please try again."),
    };
  }
  return body.ok ? { kind: "summary", summary: body.summary } : { kind: "fallback" };
}
