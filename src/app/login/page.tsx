import { EmptyState } from "@/components/EmptyState";
import { PageShell, ROLE_LABEL } from "@/components/PageShell";
import { navLinksFor } from "@/components/nav-links";
import type { Role } from "@/lib/schemas";
import { getSessionState, type DemoAccount } from "../session";
import { signInAction } from "./actions";

/**
 * Demo account picker (Task 23.1, rewired in Task 26.1; Req 1.1, 1.2, 1.3,
 * 1.6).
 *
 * The accounts come from `GET /api/session` (through the session helper),
 * one per role (Req 1.1). There is no sign-up or registration control
 * (Req 1.2, 1.6). Each card is a small form posting to `signInAction`, which
 * calls `POST /api/session` and routes to that role's landing page.
 *
 * Accessibility: each account is a labeled submit button in its own form, so
 * the picker works by keyboard alone.
 */

// One-line, plain-language description of what each role does.
const ROLE_BLURB: Record<Role, string> = {
  club_officer: "Write asks, review matches, and keep your club page current.",
  club_advisor: "Approve in-person requests from your high school club.",
  club_member: "View your club's page (read-only).",
  company_liaison: "Manage offers and inventory; accept or decline asks.",
  erg_lead: "Opt your employee resource group in and post events.",
};

const ROLE_ORDER: Role[] = [
  "club_officer",
  "club_advisor",
  "club_member",
  "company_liaison",
  "erg_lead",
];

/** Pick the first listed account for each role, in role order. */
function oneAccountPerRole(accounts: DemoAccount[]): DemoAccount[] {
  const byRole = new Map<Role, DemoAccount>();
  for (const a of accounts) {
    if (!byRole.has(a.role)) byRole.set(a.role, a);
  }
  return ROLE_ORDER.map((r) => byRole.get(r)).filter(
    (a): a is DemoAccount => a !== undefined,
  );
}

export default async function LoginPage() {
  const { accounts: all, current } = await getSessionState();
  const accounts = oneAccountPerRole(all);
  const account = current?.account ?? null;

  return (
    <PageShell role={account?.role} navLinks={navLinksFor(account)}>
      <h1 className="text-2xl font-semibold">Choose a demo account</h1>
      <p className="mt-2 text-gray-700">
        Pick a role to sign in. This is a demo, so there is no sign-up and no
        password.
      </p>
      {accounts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No demo accounts found"
            message="The demo data has no accounts to sign in with."
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="rounded-md border border-gray-200 bg-white p-4"
            >
              <h2 className="text-lg font-medium">{ROLE_LABEL[a.role]}</h2>
              {a.label !== undefined ? (
                <p className="text-sm font-medium text-gray-700">
                  {ROLE_LABEL[a.role]} · {a.label}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-gray-600">{ROLE_BLURB[a.role]}</p>
              <form action={signInAction} className="mt-3">
                <input type="hidden" name="accountId" value={a.id} />
                <button
                  type="submit"
                  className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  Sign in as {ROLE_LABEL[a.role]}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
