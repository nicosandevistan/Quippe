import Link from "next/link";
import { Acronym, resetAcronyms } from "@/components/Acronym";
import { PageShell } from "@/components/PageShell";
import { navLinksFor } from "@/components/nav-links";
import { getCurrentAccount } from "../session";
import { SuppliesFlow } from "./SuppliesFlow";
/**
 * Supplies page (Task 24.2; Req 10.1, 10.2, 11.2, 12.1, 12.3, 12.5, 12.6).
 *
 * A club officer or the club's advisor plans supplies, matching the supplies
 * API routes (which allow both roles). The
 * interactive BOM → coverage → protocol flow lives in the client component
 * `SuppliesFlow`; every decision (BOM validation, coverage, hs_safe filtering,
 * protocol id scope) is made by the API routes it calls.
 *
 * Styling matches docs/design/supplies.html (see .kiro/steering/design.md):
 * a breadcrumb, a 26px title, and muted intro copy inside the shell.
 */
export default async function SuppliesPage() {
  resetAcronyms();
  const account = await getCurrentAccount();
  if (
    account === null ||
    (account.role !== "club_officer" && account.role !== "club_advisor")
  ) {
    return (
      <PageShell role={account?.role} navLinks={navLinksFor(account)} orgName={account?.label}>
        <h1 className="text-2xl font-bold tracking-[-0.015em] text-ink">
          Supply planner
        </h1>
        <p className="mt-2 text-graphite">
          Only a club officer or advisor can plan supplies. Sign in to
          continue.
        </p>
        <p className="mt-3">
          <Link
            href="/login"
            className="text-pen hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Go to sign in
          </Link>
        </p>
      </PageShell>
    );
  }
  return (
    <PageShell role={account.role} navLinks={navLinksFor(account)} orgName={account.label}>
      <div>
        <nav
          aria-label="Breadcrumb"
          className="mb-1.5 text-[13px] text-muted"
        >
          <Link
            href="/supplies"
            className="text-pen hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Supply planner
          </Link>{" "}
          <span aria-hidden="true">/</span> New plan
        </nav>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.015em] text-ink">
          Supply planner
        </h1>
        <p className="mt-1 text-muted">
          Describe your experiment and the AI drafts a supply list, or{" "}
          <Acronym term="BOM" expansion="bill of materials" />, then Quippe
          checks it against real company inventory.
        </p>
      </div>
      <SuppliesFlow />
    </PageShell>
  );
}
