import type { Role } from "@/lib/schemas";
import type { NavLink } from "./PageShell";

/**
 * Role-appropriate navigation links for the sidebar (visual refresh).
 *
 * Pure function of the signed-in account, so every page builds the same nav
 * for the same role. Links that need a binding (an org or company id) are
 * left out when the account has none, rather than pointing somewhere broken.
 *
 * Labels follow docs/design/*.html where the design shows them (club officer:
 * "Club page", "New ask", "Supply planner"; company: "Matched asks"). Roles
 * with no design equivalent (advisor, member) keep plain sentence-case labels.
 *
 * "Switch demo account" is NOT in this list: the shell pins it to the bottom
 * of the sidebar (see PageShell), so it is not returned here.
 */

/** The account fields the nav needs. */
export interface NavAccount {
  role: Role;
  orgId?: string;
  companyId?: string;
}

export function navLinksFor(account: NavAccount | null): NavLink[] {
  if (account === null) return [];
  const clubPage: NavLink[] =
    account.orgId !== undefined
      ? [{ href: `/org/${account.orgId}`, label: "Club page" }]
      : [];
  const companyDashboard: NavLink[] =
    account.companyId !== undefined
      ? [{ href: `/company/${account.companyId}`, label: "Matched asks" }]
      : [];
  switch (account.role) {
    case "club_officer":
      return [
        ...clubPage,
        { href: "/asks/new", label: "New ask" },
        { href: "/supplies", label: "Supply planner" },
      ];
    case "club_member":
      return [...clubPage];
    case "club_advisor":
      return [
        { href: "/advisor", label: "Approval queue" },
        { href: "/supplies", label: "Supply planner" },
      ];
    case "company_liaison":
    case "erg_lead":
      return [...companyDashboard];
    default: {
      const _never: never = account.role;
      return _never;
    }
  }
}
