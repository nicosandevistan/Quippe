import { EmptyState } from "@/components/EmptyState";
import { ROLE_LABEL } from "@/components/PageShell";
import { PageShell } from "@/components/PageShell";
import { getRepo } from "@/lib/data/repo";
import type { Account, Role } from "@/lib/schemas";

import { signInAction } from "./actions";

/**
 * Demo account picker (Task 23.1; Req 1.1, 1.2, 1.3, 1.6).
 *
 * Renders exactly ONE demo account per role (Req 1.1) and signs the user in by
 * selecting one — there is NO sign-up or registration control (Req 1.2, 1.6).
 * Each card is a tiny form posting to the `signInAction` server action, which
 * sets the session and routes to the role landing.
 *
 * TODO(api): the server action reads the repo directly today; switch to
 * `POST /api/session` when Task 15 lands.
 *
 * Accessibility: each account is a labeled submit button inside its own form,
 * fully keyboard-operable; plain-language role descriptions explain what each
 * role does.
 */

// One-line, plain-language description of what each role does on sign-in.
const ROLE_BLURB: Record<Role, string> = {
  club_officer: "Write asks, review matches, and keep your org page current.",
  club_advisor: "Approve in-person requests from your high school club.",
  club_member: "View your organization's page (read-only).",
  company_liaison: "Manage offers and inventory; accept or decline asks.",
  erg_lead: "Opt your employee resource group in and post events.",
};

/** Pick the first seeded account for each role, preserving role order. */
function oneAccountPerRole(accounts: Account[]): Account[] {
  const order: Role[] = [
    "club_officer",
    "club_advisor",
    "club_member",
    "company_liaison",
    "erg_lead",
  ];
  const byRole = new Map<Role, Account>();
  for (const a of accounts) {
    if (!byRole.has(a.role)) byRole.set(a.role, a);
  }
  return order
    .map((r) => byRole.get(r))
    .filter((a): a is Account => a !== undefined);
}

export default async function LoginPage() {
  const repo = getRepo();
  const accounts = oneAccountPerRole(await repo.listDemoAccounts());

  return (
    <PageShell>
      <h1 className="text-2xl font-semibold">Choose a demo account</h1>
      <p className="mt-2 text-gray-700">
        Pick a role to sign in. This is a demo — there is no sign-up, and no
        passwords.
      </p>

      {accounts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No demo accounts found"
            message="The seed data has no accounts to sign in with."
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
