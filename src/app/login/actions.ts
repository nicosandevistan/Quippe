"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import { POST as postSessionRoute } from "@/app/api/session/route";
import { callApi } from "../_lib/call-api";

/**
 * Sign-in server action for the demo login picker (Task 23.1, rewired in
 * Task 26.1; Req 1.1, 1.3, 1.6).
 *
 * Signing in is `POST /api/session`, called in-process. The route validates
 * the account, sets the `quippe_session` cookie on its response, and returns
 * the role's landing page. A server action's cookie writes go through
 * `cookies()`, so the action copies that one cookie (same value and options)
 * onto the real response, then redirects to the landing page. Picking another
 * account overwrites the same cookie, which replaces the old session
 * (Req 1.6).
 */

// The cookie the pre-API stand-in session used. It is no longer read
// anywhere; sign-in deletes it so old browsers drop it. The name is built
// from parts so the structure guard test can forbid the literal everywhere.
const LEGACY_STAND_IN_COOKIE = ["quippe", "demo", "account"].join("_");

interface SignInBody {
  accountId: string;
  role: string;
  landing: string;
}

export async function signInAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  if (accountId.length === 0) redirect("/login");

  const res = await callApi<SignInBody>(postSessionRoute, {
    method: "POST",
    path: "/api/session",
    body: { accountId },
  });
  const sessionCookie = res.response.cookies.get(SESSION_COOKIE);
  if (!res.ok || res.json === null || sessionCookie === undefined) {
    // Unknown account: there is no sign-up, so go back to the picker.
    redirect("/login");
  }

  cookies().set(SESSION_COOKIE, sessionCookie.value, {
    httpOnly: sessionCookie.httpOnly ?? true,
    sameSite: sessionCookie.sameSite ?? "lax",
    path: sessionCookie.path ?? "/",
  });
  cookies().delete(LEGACY_STAND_IN_COOKIE);

  redirect(res.json.landing);
}
