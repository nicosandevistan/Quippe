"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getRepo } from "@/lib/data/repo";
import type { Account, Role } from "@/lib/schemas";

import { SESSION_COOKIE_NAME } from "../session";

/**
 * Sign-in server action for the demo login picker (Task 23.1; Req 1.1, 1.3,
 * 1.6).
 *
 * TODO(api): swap the cookie write + repo lookup for `POST /api/session` once
 * Task 15 lands. The action binds the chosen demo account to the session and
 * routes to that role's landing view. Selecting a new account REPLACES the
 * session (Req 1.5) because the cookie is overwritten.
 */

/** Where each role lands after sign-in (Req 1.3). */
export function landingPathForRole(account: Account): string {
  const role: Role = account.role;
  switch (role) {
    case "club_officer":
    case "club_member":
      // Officer/member land on their org page.
      return account.orgId ? `/org/${account.orgId}` : "/";
    case "club_advisor":
      return "/advisor";
    case "company_liaison":
    case "erg_lead":
      // Company roles land on their company dashboard.
      return account.companyId ? `/company/${account.companyId}` : "/";
    default: {
      // Exhaustiveness guard: a new role must be handled above.
      const _never: never = role;
      return _never;
    }
  }
}

export async function signInAction(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId") ?? "");
  const repo = getRepo();
  const accounts = await repo.listDemoAccounts();
  const account = accounts.find((a) => a.id === (accountId as Account["id"]));
  if (!account) {
    // No sign-up exists; an unknown id just returns to the picker.
    redirect("/login");
  }

  cookies().set(SESSION_COOKIE_NAME, account.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect(landingPathForRole(account));
}
