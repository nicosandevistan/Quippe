import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { rejectsStudentIdentity } from "@/lib/core/eligibility";
import { getRepo } from "@/lib/data/repo";
import { type CompanyId, Offer, type OfferId } from "@/lib/schemas";

import { denyOwnership, requireRole } from "../../_lib/guard";
import type { Session } from "../../_lib/session";

/**
 * Offer edit route for Quippe (Task 17.1; Req 4.3, 4.4, 4.5, 4.6, 7.6, 7.7).
 *
 * `PUT /api/offers/[id]` edits an existing offer. The handler is ordered so
 * the ownership check runs before any write, so an edit to another company's
 * offer is rejected and the stored offer is left unchanged (Req 4.4):
 *
 *   authorize (role) → reject student identity → load existing offer
 *   → ownership check → zod-validate (per-field errors) → ERG gate → persist.
 *
 * Server-owned fields are never taken from the client: the offer `id` comes
 * from the route path and `companyId` stays the stored owner. The submitted
 * body is validated with `id`/`companyId` stripped, so out-of-bounds fields
 * and an invalid type are rejected with `flatten().fieldErrors` (Req 4.6).
 */

const ALLOWED_ROLES = ["company_liaison", "erg_lead"] as const;

/** Client-editable fields: the `Offer` schema minus the server-owned ids. */
const OfferInput = Offer.omit({ id: true, companyId: true });

function companyOf(session: Session): CompanyId | null {
  return session.companyId ?? null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // 1) Authorize by role first — a denied request never touches the repo.
  const auth = await requireRole(req, ALLOWED_ROLES);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const companyId = companyOf(session);
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

  // 3) Reject student personal-identity data before validate/persist
  //    (Req 7.6, 7.7).
  if (rejectsStudentIdentity(json)) {
    return NextResponse.json(
      {
        error:
          "This submission contains student personal-identity data, which Quippe never stores. Remove it and try again.",
      },
      { status: 400 },
    );
  }

  const repo = getRepo();

  // 4) Load the existing offer. A missing offer is a 404 with nothing changed.
  const offerId = params.id as OfferId;
  const existing = (await repo.listOffers()).find((o) => o.id === offerId);
  if (existing === undefined) {
    return NextResponse.json(
      { error: "That offer does not exist." },
      { status: 404 },
    );
  }

  // 5) Ownership check: an offer belonging to another company is left
  //    unchanged and the edit is denied (Req 4.4). Runs before any write.
  if (existing.companyId !== companyId) {
    return denyOwnership(session, "offer");
  }

  // 6) Validate the edited fields with per-field errors (Req 4.5, 4.6).
  const parsed = OfferInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The offer could not be saved. Correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // 7) Reassemble keeping the server-owned id + owning company, then validate
  //    the full entity (enforces the erg_event/ergId refinement).
  const candidate = {
    ...parsed.data,
    id: existing.id,
    companyId: existing.companyId,
  };
  const updated = Offer.safeParse(candidate);
  if (!updated.success) {
    return NextResponse.json(
      {
        error: "The offer could not be saved. Correct the highlighted fields.",
        fieldErrors: updated.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // 8) An `erg_event` offer still requires an existing ERG under the company
  //    (Req 7.4) — enforced on edit as well as create.
  if (updated.data.type === "erg_event") {
    const hasErg = await repo.ergExistsForCompany(companyId);
    if (!hasErg) {
      return NextResponse.json(
        {
          error:
            "An ERG profile is required before posting an ERG event offer. Create an ERG first.",
        },
        { status: 400 },
      );
    }
  }

  // 9) Persist the update.
  const saved = await repo.updateOffer(updated.data);
  return NextResponse.json({ offer: saved });
}
