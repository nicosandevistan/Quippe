import { GET as getSessionRoute } from "@/app/api/session/route";
import type { Role } from "@/lib/schemas";
import { callApi } from "./_lib/call-api";

/**
 * Who is signed in, as seen by pages (Task 26.1).
 *
 * SERVER-ONLY (it uses `callApi`, which reads request cookies).
 *
 * There is one session: the `quippe_session` cookie owned by the API
 * (`src/app/api/_lib/session.ts`). Pages never read that cookie themselves.
 * They ask `GET /api/session`, in-process through `callApi`, which resolves
 * the cookie against the seeded accounts and reports the current account and
 * its landing page.
 */

/** A demo account as listed by `GET /api/session`. */
export interface DemoAccount {
  id: string;
  role: Role;
  orgId?: string;
  companyId?: string;
  ergId?: string;
  /** Name of the org or company the account belongs to, when known. */
  label?: string;
}

/** The signed-in account and where its role lands. */
export interface CurrentSession {
  account: DemoAccount;
  landing: string;
}

interface SessionRouteBody {
  accounts: Array<Omit<DemoAccount, "label"> & { label: string | null }>;
  current: { accountId: string; role: Role; landing: string } | null;
}

/** All demo accounts plus the current session, via `GET /api/session`. */
export async function getSessionState(): Promise<{
  accounts: DemoAccount[];
  current: CurrentSession | null;
}> {
  const res = await callApi<SessionRouteBody>(getSessionRoute, {
    path: "/api/session",
  });
  if (!res.ok || res.json === null) return { accounts: [], current: null };

  const accounts: DemoAccount[] = res.json.accounts.map((a) => ({
    id: a.id,
    role: a.role,
    ...(a.orgId !== undefined ? { orgId: a.orgId } : {}),
    ...(a.companyId !== undefined ? { companyId: a.companyId } : {}),
    ...(a.ergId !== undefined ? { ergId: a.ergId } : {}),
    ...(a.label !== null ? { label: a.label } : {}),
  }));

  const current = res.json.current;
  if (current === null) return { accounts, current: null };
  const account = accounts.find((a) => a.id === current.accountId);
  if (account === undefined) return { accounts, current: null };
  return { accounts, current: { account, landing: current.landing } };
}

/** The signed-in demo account, or null when nobody is signed in. */
export async function getCurrentAccount(): Promise<DemoAccount | null> {
  return (await getSessionState()).current?.account ?? null;
}
