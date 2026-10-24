import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { generateBom } from "@/lib/ai";

import { requireRole } from "../../_lib/guard";

/**
 * Experiment → bill-of-materials route for Quippe (Task 19.2; Req 10.1, 10.2).
 *
 * `POST /api/supplies/bom` takes an experiment description and a group size,
 * validates both ranges, and asks the AI to draft a BOM. The AI module already
 * validates the output against the `BOM` schema and retries once before giving
 * up, so this handler only needs to surface the typed result (Req 10.3–10.5).
 *
 * Authorization (Req 10): drafting a BOM is a Club_Officer action — it is the
 * officer's supplies planning flow. A Club_Advisor may also run it for their
 * own club (Task 26.1). Members are read-only, so they may not generate a BOM.
 *
 * Input validation (Req 10.2): the experiment must be 1..2000 characters and the
 * group size an integer 1..500. On invalid input the handler rejects with 400
 * and per-field errors; the entered values are echoed back so the page can
 * retain them.
 *
 * JSON response shape (mirrors the AiResult so the caller branches on `ok`):
 *   success  → 200 { ok: true,  bom: BOM }
 *   fallback → 200 { ok: false, bom: null, fallback: { kind: "bom_failed" } }
 * A 200 with `ok: false` means "automatic BOM generation did not succeed, here
 * is the typed fallback" — not a transport error (Req 10.5).
 *
 * The route is kept THIN per structure.md: authorize, validate input, delegate
 * to the AI module, surface its typed result.
 */

/**
 * Roles that may run the supplies flow for their OWN org (the org comes from
 * the session). A club officer plans supplies; a club advisor may run it for
 * their club too (Task 26.1, demo step 6: the high school club has no officer
 * account, so its advisor shows that hazardous items never appear in the
 * club's supply list). Members stay read-only and company roles are denied.
 */
const SUPPLIES_ROLES = ["club_officer", "club_advisor"] as const;

const EXPERIMENT_MIN = 1;
const EXPERIMENT_MAX = 2000;
const GROUP_SIZE_MIN = 1;
const GROUP_SIZE_MAX = 500;

interface FieldErrors {
  experiment?: string[];
  groupSize?: string[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Authorize: a club officer or club advisor drafts a BOM (Req 10, 1.4).
  const auth = await requireRole(req, SUPPLIES_ROLES);
  if (!auth.ok) return auth.response;

  // Parse the JSON body.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const body = (json ?? {}) as { experiment?: unknown; groupSize?: unknown };
  const experiment = body.experiment;
  const groupSize = body.groupSize;

  // Validate experiment/groupSize ranges with per-field errors (Req 10.2).
  const fieldErrors: FieldErrors = {};

  if (typeof experiment !== "string") {
    fieldErrors.experiment = ["Experiment description is required."];
  } else if (
    experiment.length < EXPERIMENT_MIN ||
    experiment.length > EXPERIMENT_MAX
  ) {
    fieldErrors.experiment = [
      `Experiment description must be ${EXPERIMENT_MIN} to ${EXPERIMENT_MAX} characters.`,
    ];
  }

  if (typeof groupSize !== "number" || !Number.isInteger(groupSize)) {
    fieldErrors.groupSize = ["Group size must be a whole number."];
  } else if (groupSize < GROUP_SIZE_MIN || groupSize > GROUP_SIZE_MAX) {
    fieldErrors.groupSize = [
      `Group size must be from ${GROUP_SIZE_MIN} to ${GROUP_SIZE_MAX}.`,
    ];
  }

  if (fieldErrors.experiment !== undefined || fieldErrors.groupSize !== undefined) {
    // Reject and retain the entered values (Req 10.2).
    return NextResponse.json(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors,
        values: { experiment, groupSize },
      },
      { status: 400 },
    );
  }

  // Delegate to the AI module. It validates against the BOM schema, retries once
  // on failure, and returns the typed `bom_failed` fallback otherwise
  // (Req 10.3–10.5).
  const result = await generateBom({
    experiment: experiment as string,
    groupSize: groupSize as number,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true, bom: result.value });
  }

  // Surface the typed fallback in place of a BOM (Req 10.5).
  return NextResponse.json({
    ok: false,
    bom: null,
    fallback: result.fallback,
  });
}
