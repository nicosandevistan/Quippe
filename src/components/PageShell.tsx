import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/lib/schemas";
import { SidebarNav } from "./SidebarNav";

/**
 * Role-aware sidebar shell (visual refresh, matching
 * docs/design/company-dashboard.html, shared by supplies.html and club.html;
 * see .kiro/steering/design.md). Every page renders inside this shell so the
 * wordmark, account box, role nav, and skip link stay consistent.
 *
 * Accessibility (unchanged from the previous shell):
 * - "Skip to main content" is the first focusable element (WCAG 2.4.1).
 * - The nav is a labeled `<nav>` landmark; the content region is
 *   `<main id="main">`.
 * - Links are real `<a>`/`<Link>` elements with a visible `:focus-visible`
 *   ring (2px pen, 2px offset).
 * - The active nav link carries `aria-current="page"` (set in SidebarNav).
 *
 * No data access here. Callers pass the current role, the role-appropriate nav
 * links, and (when they already have it) the signed-in org/company name for the
 * account box. Nothing new is fetched for the shell.
 */
export const ROLE_LABEL: Record<Role, string> = {
  club_officer: "Club officer",
  club_advisor: "Club advisor",
  club_member: "Club member",
  company_liaison: "Company liaison",
  erg_lead: "ERG lead",
};

/** Roles that belong to a company; the rest belong to a club. */
const COMPANY_ROLES: ReadonlySet<Role> = new Set<Role>([
  "company_liaison",
  "erg_lead",
]);

export interface NavLink {
  href: string;
  label: string;
}

export interface PageShellProps {
  /** Current signed-in role, or undefined on the login screen. */
  role?: Role;
  /** Role-appropriate navigation links. */
  navLinks?: NavLink[];
  /**
   * Display name of the signed-in org or company, shown in the account box.
   * When absent, the account box shows the role label only.
   */
  orgName?: string;
  /**
   * Badge initials. Computed from `orgName` when omitted; falls back to the
   * role's initials when there is no name.
   */
  initials?: string;
  /**
   * Badge style. Defaults to "company" for company roles (square dark badge)
   * and "club" otherwise (round pen badge), matching the design.
   */
  accountKind?: "club" | "company";
  children: ReactNode;
}

/** First letters of the first two words, up to two characters, uppercased. */
function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0]![0] ?? "";
  const second = words.length > 1 ? (words[1]![0] ?? "") : "";
  return (first + second).toUpperCase();
}

export function PageShell({
  role,
  navLinks = [],
  orgName,
  initials,
  accountKind,
  children,
}: PageShellProps) {
  const roleLabel = role ? ROLE_LABEL[role] : undefined;
  const kind: "club" | "company" =
    accountKind ?? (role && COMPANY_ROLES.has(role) ? "company" : "club");
  const badgeText =
    initials ??
    (orgName !== undefined && orgName !== ""
      ? initialsFrom(orgName)
      : roleLabel !== undefined
        ? initialsFrom(roleLabel)
        : "");

  return (
    <div className="flex min-h-screen flex-wrap bg-bench text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-white focus:px-3 focus:py-2 focus:border focus:border-line"
      >
        Skip to main content
      </a>
      <aside className="flex max-w-full flex-[1_1_232px] flex-col gap-5 border-r border-line p-[18px_14px] box-border">
        <Link
          href="/"
          className="px-2.5 text-xl font-extrabold tracking-[-0.02em] text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
        >
          Quippe
        </Link>

        {role ? (
          <div className="flex w-full items-center gap-2.5 rounded-panel border border-line bg-white p-2 px-2.5 text-left">
            <span
              className={
                "flex h-[30px] w-[30px] flex-none items-center justify-center text-xs font-bold text-white " +
                (kind === "company"
                  ? "rounded-control bg-ink"
                  : "rounded-full bg-pen")
              }
              aria-hidden="true"
            >
              {badgeText}
            </span>
            <span className="min-w-0 flex-1">
              {orgName !== undefined && orgName !== "" ? (
                <span className="block truncate text-sm font-semibold">
                  {orgName}
                </span>
              ) : null}
              {roleLabel !== undefined ? (
                <span className="block text-xs text-muted">{roleLabel}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        {navLinks.length > 0 ? <SidebarNav links={navLinks} /> : null}

        <div className="mt-auto px-2.5 text-[13px]">
          <Link
            href="/login"
            className="text-pen hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Switch demo account
          </Link>
        </div>
      </aside>

      <main
        id="main"
        className="box-border min-w-0 flex-[999_1_640px] p-7 px-8 pb-12"
      >
        <div className="flex max-w-[1040px] flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
