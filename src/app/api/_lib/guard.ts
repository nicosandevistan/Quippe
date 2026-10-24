import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { Role } from "@/lib/schemas";

import { readSession, type Session } from "./session";

/**
 * Shared role-authorization guard for the Quippe API (Task 15.1;
 * Req 1.4, 1.5, 4.4, 6.3, 9.4).
 *
 * Every route that is restricted to a role (or an ownership rule) calls
 * `requireRole` before it reads or writes anything. On denial the guard returns
 * a ready-to-send 403 JSON response carrying a role-appropriate message, and —
 * because it runs first, before the route touches the repo — a denied request
 * changes no application data (Req 1.5). The guard never mutates state itself.
 */

/** A denied request never reaches repo/core, so no data changes (Req 1.5). */
const DENIED_STATUS = 403;
/** No session cookie at all → the caller is not signed in. */
const UNAUTHENTICATED_STATUS = 401;

/**
 * Result of an authorization check. `ok: true` carries the resolved session for
 * the route to use; `ok: false` carries a 403/401 JSON response the route
 * returns verbatim.
 */
export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

/** Human-readable role names for the denial message (Req 1.5). */
const ROLE_LABEL: Record<Role, string> = {
  club_officer: "club officer",
  club_advisor: "club advisor",
  club_member: "club member",
  company_liaison: "company liaison",
  erg_lead: "ERG lead",
};

function labelFor(role: Role): string {
  return ROLE_LABEL[role] ?? role;
}

/**
 * Build the role-appropriate denial message. It names the signed-in role and
 * the roles the action needs, so the message is specific to who is asking
 * rather than a generic "forbidden" (Req 1.4, 1.5).
 */
function denialMessage(current: Role, allowed: readonly Role[]): string {
  const needed = allowed.map(labelFor).join(" or ");
  return `This action is not permitted for a ${labelFor(
    current,
  )}. It is available to a ${needed}.`;
}

/**
 * Authorize the request against an allowed set of roles.
 *
 * - No session → 401 with a sign-in message.
 * - Signed in but role not allowed → 403 with a role-appropriate message
 *   (Req 1.4, 1.5); the route must return `response` and change nothing.
 * - Allowed → `{ ok: true, session }` for the route to proceed.
 *
 * `allowed` may be a single role or a list.
 */
export async function requireRole(
  req: NextRequest,
  allowed: Role | readonly Role[],
): Promise<AuthResult> {
  const allowedRoles: readonly Role[] =
    typeof allowed === "string" ? [allowed] : allowed;

  const session = await readSession(req);
  if (session === null) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not signed in. Select a demo account to continue." },
        { status: UNAUTHENTICATED_STATUS },
      ),
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: denialMessage(session.role, allowedRoles) },
        { status: DENIED_STATUS },
      ),
    };
  }

  return { ok: true, session };
}

/**
 * Deny an ownership violation: the caller holds an allowed role but is acting
 * on a resource that belongs to a different org/company/erg (Req 4.4, 9.4).
 * Returns a 403 JSON response with a role-appropriate message; the caller must
 * return it and leave the resource unchanged.
 */
export function denyOwnership(session: Session, resource: string): NextResponse {
  return NextResponse.json(
    {
      error: `This ${resource} belongs to another ${labelFor(
        session.role,
      )}'s organization. You are not authorized to act on it, and it was left unchanged.`,
    },
    { status: DENIED_STATUS },
  );
}
