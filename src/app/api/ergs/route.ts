import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { rejectsStudentIdentity } from "@/lib/core/eligibility";
import { getRepo } from "@/lib/data/repo";
import {
  type AccountId,
  type CompanyId,
  Erg,
  type ErgId,
} from "@/lib/schemas";

import { requireRole } from "../_lib/guard";
import type { Session } from "../_lib/session";

/**
 * ERG creation route for Quippe (Task 17.1; Req 7.1, 7.2, 7.6, 7.7).
 *
 * `POST /api/ergs` creates an ERG profile under the signed-in account's
 * company. Like the offer routes it is thin and ordered so a rejected request
 * never reaches the repo:
 *
 *   authorize (role) → reject student identity → assign server-owned fields
 *   → zod-validate (per-field errors) → persist.
 *
 * Server-owned fields are not trusted from the client: the ERG `id` is minted
 * here, `companyId` comes from the session, and `leadAccountId` is the
 * signed-in account. The body is validated against the `Erg` schema with those
 * fields stripped, so name/description/topics/capacity bounds are enforced with
 * `flatten().fieldErrors` (Req 7.1, 7.2).
 */

/**
 * Roles allowed to create an ERG. An ERG lead opts their ERG in (Req 7.1); a
 * company liaison also manages the company's ERGs. Both are company-scoped.
 */
const ALLOWED_ROLES = ["erg_lead", "company_liaison"] as const;

/**
 * Client-supplied ERG fields: the `Erg` schema minus the server-owned ids
 * (`id`, `companyId`, `leadAccountId`), so field bounds are enforced
 * identically to storage (Req 7.1, 7.2).
 */
const ErgInput = Erg.omit({ id: true, companyId: true, leadAccountId: true });

/** Mint a new branded ErgId for a created ERG (server-owned). */
function newErgId(): ErgId {
  return `erg-${crypto.randomUUID()}` as ErgId;
}

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

  // 4) Validate the client fields with per-field errors (Req 7.1, 7.2).
  const parsed = ErgInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "The ERG could not be saved. Correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // 5) Assemble with server-owned id, company, and lead account, then validate
  //    the whole entity before persisting.
  const candidate = {
    ...parsed.data,
    id: newErgId(),
    companyId,
    leadAccountId: session.accountId as AccountId,
  };
  const erg = Erg.safeParse(candidate);
  if (!erg.success) {
    return NextResponse.json(
      {
        error: "The ERG could not be saved. Correct the highlighted fields.",
        fieldErrors: erg.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  // 6) Persist.
  const created = await getRepo().createErg(erg.data);
  return NextResponse.json({ erg: created }, { status: 201 });
}
