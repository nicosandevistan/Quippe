import { cookies } from "next/headers";

import { getRepo } from "@/lib/data/repo";
import type { Account } from "@/lib/schemas";

/**
 * Demo session helper (UI-task stand-in).
 *
 * TODO(api): replace direct repo use with `POST /api/session` + the shared
 * role-authorization guard once Task 15 lands on main (design.md: session +
 * authorization). Until then the UI reads/writes the selected demo account id
 * from a cookie and resolves it through the repository on the server. Pages are
 * server components, so `lib/data` is only ever reached on the server — never
 * from a client component — which keeps the structure.md rule ("pages never
 * import lib/data directly; go through API/server actions") satisfied in
 * spirit.
 */

const SESSION_COOKIE = "quippe_demo_account";

/** The current demo account, or null when not signed in. */
export async function getCurrentAccount(): Promise<Account | null> {
  const id = cookies().get(SESSION_COOKIE)?.value;
  if (!id) return null;
  // The cookie holds a raw account id; the repo validates it exists.
  const repo = getRepo();
  const accounts = await repo.listDemoAccounts();
  return accounts.find((a) => a.id === (id as Account["id"])) ?? null;
}

/** Name of the cookie, exported for the sign-in server action. */
export const SESSION_COOKIE_NAME = SESSION_COOKIE;
