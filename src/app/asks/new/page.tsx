import Link from "next/link";

import { Acronym, resetAcronyms } from "@/components/Acronym";
import { PageShell } from "@/components/PageShell";
import { navLinksFor } from "@/components/nav-links";

import { getCurrentAccount } from "../../session";
import { ComposerForm } from "./ComposerForm";

/**
 * New-ask page (Task 24.1; Req 8.1, 8.2, 8.6, 8.7, 8.8).
 *
 * Server component: checks that a club officer is signed in, then renders the
 * client composer. The composer talks to `POST /api/asks/compose` (drafts,
 * nothing saved) and `POST /api/asks/confirm` (one confirmed ask at a time);
 * those routes re-check the role, so this check is only for a friendly page.
 */
export default async function NewAskPage() {
  resetAcronyms();
  const account = await getCurrentAccount();

  if (!account || account.role !== "club_officer") {
    return (
      <PageShell role={account?.role} navLinks={navLinksFor(account)}>
        <h1 className="text-2xl font-semibold">Create asks</h1>
        <p className="mt-4 text-gray-700">
          Only a club officer can create asks. Sign in as the officer to
          continue.{" "}
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
    <PageShell role={account.role} navLinks={navLinksFor(account)}>
      <h1 className="text-2xl font-semibold">Create asks</h1>
      <p className="mt-1 mb-6 text-gray-700">
        Tell us what your group needs, like supplies, a lab tour, a speaker, or
        an <Acronym term="ERG" expansion="employee resource group" /> event.
        We&apos;ll turn it into asks for you to check and confirm one by one.
      </p>
      <ComposerForm />
    </PageShell>
  );
}
