import { notFound } from "next/navigation";

import { Acronym, resetAcronyms } from "@/components/Acronym";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { visibleToCompany } from "@/lib/core/safety";
import { getRepo } from "@/lib/data/repo";
import type { Ask, CompanyId } from "@/lib/schemas";

import { getCurrentAccount } from "../../session";
import { InventoryUpload } from "./InventoryUpload";
import { OfferForm } from "./OfferForm";

/**
 * Company page (Task 25.1; Req 4, 5, 7, 13):
 * - Dashboard of matched asks the company may see, excluding pending/rejected
 *   via the pure `visibleToCompany` (Correctness Property 2).
 * - Offer list + create form (erg_event gated on an existing ERG).
 * - CSV inventory upload -> review -> confirm.
 *
 * TODO(api): the dashboard's score + reasons come from
 * `GET /api/company/[id]/dashboard` (Task 17.2); until it lands we list the
 * visible matched asks WITHOUT a score and show the "no reasons available yet"
 * state, which is the design's documented empty-reasons case (Req 5.4).
 */

export default async function CompanyPage({
  params,
}: {
  params: { id: string };
}) {
  resetAcronyms();
  const repo = getRepo();
  const companyId = params.id as CompanyId;

  const company = await repo.getCompany(companyId);
  if (!company) notFound();

  const account = await getCurrentAccount();
  const isOwner =
    (account?.role === "company_liaison" || account?.role === "erg_lead") &&
    account.companyId === companyId;

  const offers = await repo.listOffers({ companyId });
  const hasErg = await repo.ergExistsForCompany(companyId);

  // Dashboard: matched asks visible to companies (CP2). The real route sorts by
  // score; without it we just list the visible matched asks.
  const allAsks = await repo.listAsks({ status: "matched" });
  const visibleAsks: Ask[] = allAsks.filter((a) => visibleToCompany(a));

  return (
    <PageShell role={account?.role}>
      <h1 className="text-2xl font-semibold">{company.name}</h1>
      <p className="mt-1 text-gray-700">{company.city}</p>

      {/* Dashboard ---------------------------------------------------- */}
      <h2 className="mt-8 text-xl font-semibold">Matched asks</h2>
      <p className="mt-1 text-sm text-gray-600">
        Requests from student groups that match your offers.
      </p>
      <div className="mt-3">
        {visibleAsks.length === 0 ? (
          <EmptyState
            title="No matched asks yet"
            message="When a student group's request matches one of your offers, it shows up here."
          />
        ) : (
          <ul className="space-y-3">
            {visibleAsks.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-gray-200 bg-white p-4"
              >
                <p className="font-medium">{a.topic}</p>
                <p className="mt-1 text-sm text-gray-600">
                  Group of {a.groupSize} ·{" "}
                  {a.deliveryMode === "in_person" ? "In person" : "Virtual"}
                </p>
                <p className="mt-1 text-sm italic text-gray-500">
                  Match reasons aren&apos;t available yet.
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Owner-only management --------------------------------------- */}
      {isOwner ? (
        <>
          <h2 className="mt-10 text-xl font-semibold">Your offers</h2>
          <div className="mt-3">
            {offers.length === 0 ? (
              <EmptyState title="No offers yet" message="Post your first offer below." />
            ) : (
              <ul className="space-y-2">
                {offers.map((o) => (
                  <li
                    key={o.id}
                    className="rounded border border-gray-200 bg-white p-3 text-sm"
                  >
                    <span className="font-medium">{readableOfferType(o.type)}</span>{" "}
                    · capacity {o.capacity} ·{" "}
                    {o.deliveryMode === "in_person" ? "in person" : "virtual"} ·{" "}
                    {o.city}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <h2 className="mt-10 text-xl font-semibold">Post an offer</h2>
          {!hasErg ? (
            <p className="mt-1 text-sm text-gray-600">
              To post an{" "}
              <Acronym term="ERG" expansion="employee resource group" /> event,
              create an ERG first.
            </p>
          ) : null}
          <div className="mt-3">
            <OfferForm hasErg={hasErg} />
          </div>

          <h2 className="mt-10 text-xl font-semibold">Upload inventory</h2>
          <p className="mt-1 text-sm text-gray-600">
            Paste your surplus items. You&apos;ll review them before anything is
            saved.
          </p>
          <div className="mt-3">
            <InventoryUpload />
          </div>
        </>
      ) : (
        <p className="mt-8 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
          Sign in as this company&apos;s liaison to manage offers and inventory.
        </p>
      )}
    </PageShell>
  );
}

function readableOfferType(type: string): string {
  switch (type) {
    case "supplies":
      return "Supplies";
    case "lab_tour":
      return "Lab tour";
    case "speaker":
      return "Speaker";
    case "erg_event":
      return "ERG event";
    default:
      return type;
  }
}
