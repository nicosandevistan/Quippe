import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getRepo } from "@/lib/data/repo";
import {
  type AccountId,
  type CompanyId,
  type ErgId,
  type OrgId,
  Role,
} from "@/lib/schemas";

/**
 * Shared session store for the Quippe API (Task 15.1; Req 1.1, 1.3, 1.5, 1.6).
 *
 * This is the single place that knows how a role session is represented and
 * where it lives. Everything else in the API reads the session through
 * `readSession` and never touches the cookie directly, so there is exactly one
 * definition of "who is signed in".
 *
 * Demo-appropriate design (Req 1.2: no real auth): the session is a single
 * HTTP cookie carrying only the seeded account id. The role and org/company/
 * erg bindings are resolved from the repo on every read, so the cookie can
 * never drift from the seeded account and carries no secret. Selecting a
 * different account overwrites the same cookie, which is how reselect replaces
 * the prior session (Req 1.6).
 */

/** Name of the cookie carrying the signed-in demo account id. */
export const SESSION_COOKIE = "quippe_session";

/**
 * The resolved session for a signed-in demo account. The role and bindings are
 * read from the account record (never trusted from the client), so routes can
 * authorize against them directly.
 */
export interface Session {
  accountId: AccountId;
  role: Role;
  orgId?: OrgId;
  companyId?: CompanyId;
  ergId?: ErgId;
}

/**
 * Per-role default landing view (Req 1.3). Each role lands on the page the
 * role actually works from:
 * - club_officer / club_member → their organization page (officers edit,
 *   members read-only — Req 2.3);
 * - club_advisor → the approval queue they own (Req 9.6);
 * - company_liaison → the company dashboard of matched asks (Req 5.1);
 * - erg_lead → the company page where ERG events are posted (Req 7.3).
 *
 * The landing is derived from the account's bindings so it points at the
 * concrete org/company the account belongs to. When a binding the role needs
 * is absent in the seed, the landing falls back to the role's section root
 * rather than producing a broken link.
 */
export function landingFor(session: Session): string {
  switch (session.role) {
    case "club_officer":
    case "club_member":
      return session.orgId !== undefined
        ? `/org/${session.orgId}`
        : "/org";
    case "club_advisor":
      return "/advisor";
    case "company_liaison":
    case "erg_lead":
      return session.companyId !== undefined
        ? `/company/${session.companyId}`
        : "/company";
    default:
      // Exhaustive: every Role is handled above. Kept for safety if the Role
      // enum grows.
      return "/";
  }
}

/**
 * Build the resolved {@link Session} for a seeded account id, or `null` when no
 * such account exists (so a stale/forged cookie never yields a session).
 */
export async function resolveSession(
  accountId: AccountId,
): Promise<Session | null> {
  const account = await getRepo().getAccount(accountId);
  if (account === null) return null;
  return {
    accountId: account.id,
    role: account.role,
    orgId: account.orgId,
    companyId: account.companyId,
    ergId: account.ergId,
  };
}

/**
 * Read the signed-in session from the request cookie, resolving it against the
 * repo. Returns `null` when there is no session cookie or it does not name a
 * seeded account.
 *
 * Works both with a passed {@link NextRequest} (route handlers that receive the
 * request) and, when none is passed, with the ambient request cookies via
 * `next/headers` — so server components and handlers share one reader.
 */
export async function readSession(
  req?: NextRequest,
): Promise<Session | null> {
  const raw =
    req !== undefined
      ? req.cookies.get(SESSION_COOKIE)?.value
      : cookies().get(SESSION_COOKIE)?.value;
  if (raw === undefined || raw.length === 0) return null;
  // The cookie is just an account id; validate it is a non-empty string before
  // branding and resolving.
  return resolveSession(raw as AccountId);
}

/** Zod helper re-export kept local so routes import role parsing from one place. */
export { Role };
