import Link from "next/link";
import type { ReactNode } from "react";

import type { Role } from "@/lib/schemas";

/**
 * Role-aware page shell and navigation wrapper (Task 22.1; Req 1.4 landing +
 * accessibility cross-cut).
 *
 * Every page renders inside this shell so navigation, the skip link, and the
 * current-role indicator are consistent. Accessibility:
 * - A "Skip to main content" link is the first focusable element, so keyboard
 *   users can jump past the nav (WCAG 2.4.1).
 * - The nav is a labeled `<nav>` landmark; the main region is `<main id="main">`.
 * - Links are real `<a>`/`<Link>` elements, keyboard-focusable by default, with
 *   a visible focus ring from Tailwind's focus utilities.
 *
 * No data access here — the caller passes the current role (if signed in) and
 * the role-appropriate nav links.
 */

export const ROLE_LABEL: Record<Role, string> = {
  club_officer: "Club officer",
  club_advisor: "Club advisor",
  club_member: "Club member",
  company_liaison: "Company liaison",
  erg_lead: "ERG lead",
};

export interface NavLink {
  href: string;
  label: string;
}

export interface PageShellProps {
  /** Current signed-in role, or undefined on the login screen. */
  role?: Role;
  /** Role-appropriate navigation links. */
  navLinks?: NavLink[];
  children: ReactNode;
}

export function PageShell({ role, navLinks = [], children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 p-4">
          <Link
            href="/"
            className="text-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Quippe
          </Link>

          {navLinks.length > 0 ? (
            <nav aria-label="Main" className="flex flex-wrap gap-4">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-sm text-blue-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {role ? (
            <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900">
              Signed in as {ROLE_LABEL[role]}
            </span>
          ) : null}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
