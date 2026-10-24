import type { Role } from "@/lib/schemas";
import type { NavLink } from "./PageShell";

/**
 * Role-appropriate navigation links for the page shell (Task 26.1).
 *
 * Pure function of the signed-in account, so every page builds the same nav
 * for the same role. Links that need a binding (an org or company id) are
 * left out when the account has none, rather than pointing somewhere broken.
 */

/** The account fields the nav needs. */
export interface NavAccount {
  role: Role;
  orgId?: string;
  companyId?: string;
}

const SWITCH_ACCOUNT: NavLink = { href: "/login", label: "Switch account" };

export function navLinksFor(account: NavAccount | null): NavLink[] {
  if (account === null) return [];

  const ourClub: NavLink[] =
    account.orgId !== undefined
      ? [{ href: `/org/${account.orgId}`, label: "Our club" }]
      : [];
  const companyDashboard: NavLink[] =
    account.companyId !== undefined
      ? [{ href: `/company/${account.companyId}`, label: "Company dashboard" }]
      : [];

  switch (account.role) {
    case "club_officer":
      return [
        ...ourClub,
        { href: "/asks/new", label: "Create asks" },
        { href: "/supplies", label: "Plan supplies" },
        SWITCH_ACCOUNT,
      ];
    case "club_member":
      return [...ourClub, SWITCH_ACCOUNT];
    case "club_advisor":
      return [
        { href: "/advisor", label: "Approval queue" },
        { href: "/supplies", label: "Club supplies" },
        SWITCH_ACCOUNT,
      ];
    case "company_liaison":
    case "erg_lead":
      return [...companyDashboard, SWITCH_ACCOUNT];
    default: {
      const _never: never = account.role;
      return _never;
    }
  }
}
