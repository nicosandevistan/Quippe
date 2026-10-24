import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { getRepo } from "@/lib/data/repo";
import { type AccountId } from "@/lib/schemas";

import {
  landingFor,
  resolveSession,
  SESSION_COOKIE,
} from "../_lib/session";

/**
 * Session route for Quippe (Task 15.1; Req 1.1, 1.3, 1.5, 1.6).
 *
 * The demo has no real auth (Req 1.2). "Signing in" is selecting one of the
 * seeded demo accounts; the session is a single HTTP cookie carrying that
 * account id. This route is kept thin: validate input → resolve the account →
 * bind the session cookie → return the role's landing descriptor.
 *
 * - `GET /api/session` lists the seeded demo accounts (one per role) so the
 *   login page can render the picker (Req 1.1), and reports the currently
 *   signed-in session if any.
 * - `POST /api/session` selects an account, replacing any prior session
 *   (Req 1.6), and returns `{ role, accountId, landing }` (Req 1.3).
 */

/** Only validated field is the chosen account id (a non-empty string). */
const SelectBody = z.object({
  accountId: z.string().min(1),
});

/**
 * GET: the login page's demo-account picker (Req 1.1). Returns exactly the
 * seeded accounts (one per role) and the current session, if any.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const repo = getRepo();
  const accounts = await repo.listDemoAccounts();

  const current = req.cookies.get(SESSION_COOKIE)?.value;
  const currentSession =
    current !== undefined && current.length > 0
      ? await resolveSession(current as AccountId)
      : null;

  return NextResponse.json({
    accounts: accounts.map((a) => ({
      id: a.id,
      role: a.role,
      orgId: a.orgId,
      companyId: a.companyId,
      ergId: a.ergId,
    })),
    current:
      currentSession === null
        ? null
        : {
            accountId: currentSession.accountId,
            role: currentSession.role,
            landing: landingFor(currentSession),
          },
  });
}

/**
 * POST: select a seeded demo account and bind the role session (Req 1.3).
 * Setting the cookie replaces any prior session, so reselecting a different
 * account terminates the old session and establishes a new one (Req 1.6). A
 * selection that names no seeded account is rejected and changes nothing
 * (Req 1.5).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = SelectBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Select a demo account to sign in.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const session = await resolveSession(parsed.data.accountId as AccountId);
  if (session === null) {
    // Unknown account id → reject; no session is bound and nothing changes.
    return NextResponse.json(
      { error: "That demo account does not exist." },
      { status: 404 },
    );
  }

  const landing = landingFor(session);
  const res = NextResponse.json({
    accountId: session.accountId,
    role: session.role,
    landing,
  });

  // Replace any prior session by overwriting the single session cookie
  // (Req 1.6). HttpOnly + SameSite=Lax is demo-appropriate; no secret is
  // stored since the value is just a seeded account id.
  res.cookies.set(SESSION_COOKIE, session.accountId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
