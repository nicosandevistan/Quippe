import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { rejectsStudentIdentity } from "@/lib/core/eligibility";
import { getRepo } from "@/lib/data/repo";
import {
  type CompanyId,
  Offer,
  type OfferId,
} from "@/lib/schemas";

import { requireRole } from "../_lib/guard";
import type { Session } from "../_lib/session";

/**
 * Offer creation route for Quippe (Task 17.1; Req 4.1, 4.2, 4.5, 4.6, 7.3,
 * 7.4, 7.6, 7.7).
 *
 * `POST /api/offers` creates an Offer for the signed-in liaison's (or ERG
 * lead's) company. The handler is deliberately thin and ordered so a rejected
 * request never reaches the repo and therefore changes no data:
 *
 *   authorize (role) → reject student identity → assign server-owned fields
 *   → zod-validate (per-field errors) → ERG gate for erg_event → persist.
 *
 * Server-owned fields are never trusted from the client: the new Offer `id` is
 * minted here and `companyId` is taken from the session, not the body (Req
 * 4.1). The incoming body is validated against the `Offer` schema with `id`
 * and `companyId` stripped, so out-of-bounds fields and an invalid offer type
 * are rejected with `flatten().fieldErrors` (Req 4.2, 4.5, 4.6).
 */

/**
 * Roles allowed to create offers. A company liaison manages all offer types
 * for the company (Req 4.1); an ERG lead posts `erg_event` offers for the
 * company's ERG (Req 7.3). Both are company-scoped and resolve `companyId`
 * from the session.
 */
const ALLOWED_ROLES = ["company_liaison", "erg_lead"] as const;

/**
 * The client-supplied shape of an offer. It is exactly the `Offer` schema with
 * the two server-owned fields (`id`, `companyId`) omitted, so field bounds and
 * the offer-type enum are enforced identically to storage (Req 4.5, 4.6).
 */
const OfferInput = Offer.omit({ id: true, companyId: true });

/** Mint a new branded OfferId for a created offer (server-owned, Req 4.1). */
function newOfferId(): OfferId {
  return `off-${crypto.randomUUID()}` as OfferId;
}

/**
 * The company this session acts for. Both allowed roles bind a `companyId`;
 * when absent (a misconfigured account) there is no company to own the offer.
 */
function companyOf(session: Session): CompanyId | null {
  return session.companyId ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // 3) Reject any payload carrying student personal-identity data before it is
  //    validated or persisted (Req 7.6, 7.7). Scanned on the raw body so a
  //    disguised field cannot slip past the schema.
  if (rejectsStudentIdentity(json)) {
    return NextResponse.json(
      {
        error:
          "This submission contains student personal-identity data, which Quippe never stores. Remove it and try again.",
      },
      { status: 400 },
    );
  }

  // 4) Validate the client fields with per-field errors (Req 4.2, 4.5, 4.6).
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

  // 5) Assemble the offer with server-owned id + companyId, then re-validate
  //    the whole entity (catches the erg_event/ergId refinement consistently).
  const candidate = {
    ...parsed.data,
    id: newOfferId(),
    companyId,
  };
  const offer = Offer.safeParse(candidate);
  if (!offer.success) {
    return NextResponse.json(
      {
        error: "The offer could not be saved. Correct the highlighted fields.",
        fieldErrors: offer.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const repo = getRepo();

  // 6) An `erg_event` offer requires an existing ERG under the company
  //    (Req 7.4). Checked before persisting so a gated request changes nothing.
  if (offer.data.type === "erg_event") {
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

  // 7) Persist.
  const created = await repo.createOffer(offer.data);
  return NextResponse.json({ offer: created }, { status: 201 });
}

/**
 * `GET /api/offers` (Task 26.1, read-only, additive): the signed-in liaison's
 * or ERG lead's own company, its offers, and whether it has an ERG, so the
 * company page can render through the API instead of importing `lib/data`
 * (structure.md). Scoped to the session's company; other companies' offers
 * are never returned.
 *
 * Response: 200 `{ company: { id, name, city }, offers: Offer[], hasErg }`.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(req, ALLOWED_ROLES);
  if (!auth.ok) return auth.response;
  const companyId = companyOf(auth.session);
  if (companyId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with a company." },
      { status: 403 },
    );
  }

  const repo = getRepo();
  const company = await repo.getCompany(companyId);
  if (company === null) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  const offers = await repo.listOffers({ companyId });
  const hasErg = await repo.ergExistsForCompany(companyId);

  return NextResponse.json({
    company: { id: company.id, name: company.name, city: company.city },
    offers,
    hasErg,
  });
}
