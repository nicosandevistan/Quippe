import Link from "next/link";
import { Acronym, resetAcronyms } from "@/components/Acronym";
import { PageShell } from "@/components/PageShell";
import { getCurrentAccount } from "../session";
import { SuppliesFlow } from "./SuppliesFlow";

/**
 * Supplies page (Task 24.2; Req 10.1, 10.2, 11.2, 12.1, 12.3, 12.5, 12.6).
 *
 * Only a club officer plans supplies, matching the supplies API routes. The
 * interactive BOM → coverage → protocol flow lives in the client component
 * `SuppliesFlow`; every decision (BOM validation, coverage, hs_safe filtering,
 * protocol id scope) is made by the API routes it calls.
 */
export default async function SuppliesPage() {
  resetAcronyms();
  const account = await getCurrentAccount();

  if (account === null || account.role !== "club_officer") {
    return (
      <PageShell role={account?.role}>
        <h1 className="text-2xl font-semibold">Plan supplies</h1>
        <p className="mt-2 text-gray-700">
          Only a club officer can plan supplies. Sign in as the officer to
          continue.
        </p>
        <p className="mt-3">
          <Link
            href="/login"
            className="text-blue-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Go to sign in
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell role={account.role}>
      <h1 className="text-2xl font-semibold">Plan supplies</h1>
      <p className="mt-2 text-gray-700">
        Describe your experiment and the AI drafts a supply list, or{" "}
        <Acronym term="BOM" expansion="bill of materials" />, then Quippe checks
        it against real company inventory.
      </p>
      <SuppliesFlow />
    </PageShell>
  );
}
