import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { gateHighSchoolInPerson } from "@/lib/core/safety";
import { getRepo } from "@/lib/data/repo";
import {
  Ask,
  type AskId,
  type EventId,
  type OrgId,
  type TimelineEvent,
} from "@/lib/schemas";

import { requireRole } from "../../_lib/guard";
import { statusAfterMatching } from "../../_lib/match-status";

/**
 * Ask confirmation route for Quippe (Task 19.1; Req 8.8, 9.1).
 *
 * `POST /api/asks/confirm` is the "people confirm" half of the composer flow.
 * The client sends back ONLY the draft asks the officer explicitly confirmed;
 * an unconfirmed draft is never in the body and is therefore never saved
 * (Req 8.8). The handler is ordered so a rejected request changes nothing:
 *
 *   authorize (club officer) → parse body → validate each confirmed ask
 *   against the Ask schema → load org → for each ask: set server-owned fields
 *   (id, orgId, status from the gate) → persist.
 *
 * The ask's status is NEVER trusted from the client: it is decided here by the
 * deterministic gate `gateHighSchoolInPerson`, which holds an in-person
 * high-school ask at `pending_advisor_approval` so no company sees it before
 * the advisor reviews it, and opens every other ask (Req 9.1). The id and
 * orgId are server-owned too — the id is minted here and the orgId comes from
 * the session, not the body.
 */

/** Only a club officer confirms asks for their organization (Req 8). */
const ALLOWED_ROLE = "club_officer" as const;

/**
 * A confirmed draft as sent by the client: the full `Ask` schema with the
 * server-owned fields (`id`, `orgId`, `status`) omitted. Validating against
 * this enforces the schema on each confirmed ask (Req 8.3) while making it
 * impossible for the client to choose its own id, org, or status.
 */
const ConfirmedAskInput = Ask.omit({ id: true, orgId: true, status: true });

/** Mint a server-owned, namespaced AskId for a confirmed ask. */
function newAskId(): AskId {
  return `ask-${crypto.randomUUID()}` as AskId;
}

/** Mint a server-owned, namespaced TimelineEvent id for the "ask" event. */
function newEventId(): EventId {
  return `ev-${crypto.randomUUID()}` as EventId;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Authorize by role first — a denied request never touches the repo.
  const auth = await requireRole(req, ALLOWED_ROLE);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const orgId = (session.orgId ?? null) as OrgId | null;
  if (orgId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with an organization." },
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

  // The body carries the confirmed asks under `asks`. Require an explicit,
  // non-empty list — an officer must confirm at least one ask (Req 8.8).
  const rawAsks =
    typeof json === "object" &&
    json !== null &&
    Array.isArray((json as { asks?: unknown }).asks)
      ? (json as { asks: unknown[] }).asks
      : null;
  if (rawAsks === null || rawAsks.length === 0) {
    return NextResponse.json(
      {
        error:
          "Confirm at least one ask. Only the asks you explicitly confirm are submitted.",
      },
      { status: 400 },
    );
  }

  // 3) Validate EACH confirmed ask against the schema before anything is saved
  //    (Req 8.3). A single invalid ask rejects the whole request with per-ask
  //    field errors, leaving all data unchanged.
  const parsed = rawAsks.map((a) => ConfirmedAskInput.safeParse(a));
  const invalid = parsed.flatMap((p, i) =>
    p.success ? [] : [{ index: i, fieldErrors: p.error.flatten().fieldErrors }],
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: "One or more confirmed asks are invalid. Correct them and try again.",
        askErrors: invalid,
      },
      { status: 400 },
    );
  }

  const repo = getRepo();

  // 4) Load the org once so the gate can read its type (Req 9.1).
  const org = await repo.getOrganization(orgId);
  if (org === null) {
    return NextResponse.json(
      { error: "Your organization could not be found." },
      { status: 404 },
    );
  }

  // Run date injected ONLY here at the boundary; the core receives it as an
  // argument (tech.md).
  const now = new Date().toISOString().slice(0, 10);

  // Same-day events sort by `seq` (Req 2.4). Continue after any events the org
  // already has on this date so each new "ask" event gets a distinct seq.
  const existingToday = (await repo.listTimelineEvents(orgId)).filter(
    (e) => e.date === now,
  ).length;

  // 5) For each confirmed ask: assign server-owned id + orgId, and set the
  //    status. The deterministic gate runs first: an in-person high-school ask
  //    is held at `pending_advisor_approval` (Req 9.1). Every other ask is
  //    company-visible, and its status comes from the matching core
  //    (`statusAfterMatching`): `matched` when at least one offer passes the
  //    hard filters, otherwise `open` (approved demo fix 1, Task 26.1: before
  //    this nothing ever set `matched`, so accept/decline could never act on a
  //    newly composed ask). The client's status is ignored. Persist each ask
  //    and record ONE plain-language "ask" event on the org timeline so the
  //    org page shows what was asked (demo step 7).
  const saved: Ask[] = [];
  for (const p of parsed) {
    // `p.success` is guaranteed true here (invalid ones were rejected above).
    if (!p.success) continue;
    const draft: Ask = { ...p.data, id: newAskId(), orgId, status: "open" };
    const gated = gateHighSchoolInPerson(draft, org);
    const status =
      gated === "pending_advisor_approval"
        ? gated
        : await statusAfterMatching(repo, draft, org, now);
    const ask: Ask = { ...draft, status };
    saved.push(await repo.saveAsk(ask));

    const event: TimelineEvent = {
      id: newEventId(),
      orgId,
      kind: "ask",
      date: now,
      seq: existingToday + saved.length,
      summary: `Asked for: ${ask.topic}`,
      refs: [ask.id],
    };
    await repo.addTimelineEvent(event);
  }

  // 6) Return the saved asks with their resulting statuses.
  return NextResponse.json({ ok: true, asks: saved }, { status: 201 });
}
