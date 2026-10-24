import { EmptyState } from "@/components/EmptyState";
import { PageShell, ROLE_LABEL } from "@/components/PageShell";
import type { Role } from "@/lib/schemas";
import { getSessionState, type DemoAccount } from "../session";
import { signInAction } from "./actions";
/**
 * Demo account picker (rewired in Task 26.1; Req 1.1, 1.2, 1.3, 1.6). Restyled
 * in the visual refresh with the design tokens (see .kiro/steering/design.md).
 *
 * The accounts come from `GET /api/session` (through the session helper),
 * one per role (Req 1.1). There is no sign-up or registration control
 * (Req 1.2, 1.6). Each card is a small form posting to `signInAction`, which
 * calls `POST /api/session` and routes to that role's landing page. It stays
 * the account picker for everyone, signed in or not, so account switching
 * always works.
 *
 * The shell uses the "minimal" sidebar variant: just the Quippe wordmark, no
 * account box or role nav, even when someone is already signed in. The picker
 * itself is the only thing a visitor needs here.
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
  const { accounts: all } = await getSessionState();
  const accounts = oneAccountPerRole(all);
  return (
    <PageShell variant="minimal">
      <h1 className="text-2xl font-bold tracking-[-0.015em]">
        Choose a demo account
      </h1>
      <p className="max-w-[60ch] text-muted">
        Pick a role to sign in. This is a demo, so there is no sign-up and no
        password.
      </p>
      {accounts.length === 0 ? (
        <div>
          <EmptyState
            title="No demo accounts found"
            message="The demo data has no accounts to sign in with."
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-panel border border-line bg-white p-4"
            >
              <h2 className="text-lg font-semibold">{ROLE_LABEL[a.role]}</h2>
              {a.label !== undefined ? (
                <p className="text-sm font-medium text-graphite">{a.label}</p>
              ) : null}
              <p className="text-sm text-muted">{ROLE_BLURB[a.role]}</p>
              <form action={signInAction} className="mt-2">
                <input type="hidden" name="accountId" value={a.id} />
                <button
                  type="submit"
                  className="h-[34px] rounded-control bg-pen px-3.5 text-sm font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
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
