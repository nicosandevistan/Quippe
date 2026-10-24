import { notFound } from "next/navigation";
import { GET as dashboardRoute } from "@/app/api/company/[id]/dashboard/route";
import { GET as offersRoute } from "@/app/api/offers/route";
import { Acronym, resetAcronyms } from "@/components/Acronym";
import type { DashboardEntry } from "@/components/DashboardEntryView";
import { offerTypeLabel } from "@/components/DashboardEntryView";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { navLinksFor } from "@/components/nav-links";
import type { Offer } from "@/lib/schemas";
import { apiErrorText, callApi } from "../../_lib/call-api";
import { getCurrentAccount } from "../../session";
import {
  acceptAskAction,
  confirmInventoryAction,
  createOfferAction,
  declineAskAction,
  normalizeInventoryAction,
} from "./actions";
import { DashboardList } from "./DashboardList";
import { InventoryUpload } from "./InventoryUpload";
import { OfferForm } from "./OfferForm";

/**
 * Company page (Task 25.1, rewired in Task 26.1; Req 4, 5, 6, 7, 13).
 *
 * Data comes from two API routes, called in-process:
 * - `GET /api/offers`: the signed-in account's company, its offers, and
 *   whether it has an ERG;
 * - `GET /api/company/[id]/dashboard`: matched asks with score and reasons,
 *   already filtered so asks waiting for advisor approval never appear.
 *
 * Both routes are limited to this company's liaison and ERG lead. Anyone else
 * sees a short sign-in message. The liaison can accept or decline matched
 * asks; the ERG lead sees the dashboard read-only. Offers can be posted by
 * both; inventory upload is the liaison's.
 */

interface OffersBody {
  company: { id: string; name: string; city: string };
  offers: Offer[];
  hasErg: boolean;
}

interface DashboardBody {
  companyId: string;
  matches: DashboardEntry[];
  empty: boolean;
}

export default async function CompanyPage({
  params,
}: {
  params: { id: string };
}) {
  resetAcronyms();
  const account = await getCurrentAccount();
  const nav = navLinksFor(account);
  const [offersRes, dashboardRes] = await Promise.all([
    callApi<OffersBody>(offersRoute, { path: "/api/offers" }),
    callApi<DashboardBody>(dashboardRoute, {
      path: `/api/company/${encodeURIComponent(params.id)}/dashboard`,
      params: { id: params.id },
    }),
  ]);

  // The dashboard route decides who may see this company's page: 401 when
  // nobody is signed in, 403 for any other role or another company's account.
  if (
    account === null ||
    dashboardRes.status === 401 ||
    dashboardRes.status === 403
  ) {
    return (
      <PageShell role={account?.role} navLinks={nav}>
        <h1 className="text-2xl font-semibold">Company page</h1>
        <p className="mt-4 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
          Sign in as this company&apos;s liaison to manage offers and inventory.
        </p>
      </PageShell>
    );
  }
  if (dashboardRes.status === 404) notFound();

  const isLiaison = account.role === "company_liaison";
  const company = offersRes.json?.company;
  const offers = offersRes.json?.offers ?? [];
  const hasErg = offersRes.json?.hasErg ?? false;

  return (
    <PageShell role={account.role} navLinks={nav}>
      <h1 className="text-2xl font-semibold">{company?.name ?? "Company page"}</h1>
      {company ? <p className="mt-1 text-gray-700">{company.city}</p> : null}

      {/* Dashboard ---------------------------------------------------- */}
      <h2 className="mt-8 text-xl font-semibold">Matched asks</h2>
      <p className="mt-1 text-sm text-gray-600">
        Requests from student groups that match your offers, best match first.
        {isLiaison ? "" : " You can view these; the company liaison accepts or declines."}
      </p>
      <div className="mt-3">
        {dashboardRes.ok && dashboardRes.json !== null ? (
          <DashboardList
            entries={dashboardRes.json.matches}
            canDecide={isLiaison}
            accept={acceptAskAction}
            decline={declineAskAction}
          />
        ) : (
          <p role="alert" className="text-sm text-red-700">
            {apiErrorText(dashboardRes.json, "The dashboard couldn't be loaded.")}
          </p>
        )}
      </div>

      {/* Offers ------------------------------------------------------- */}
      <h2 className="mt-10 text-xl font-semibold">Your offers</h2>
      <div className="mt-3">
        {!offersRes.ok ? (
          <p role="alert" className="text-sm text-red-700">
            {apiErrorText(offersRes.json, "Your offers couldn't be loaded.")}
          </p>
        ) : offers.length === 0 ? (
          <EmptyState title="No offers yet" message="Post your first offer below." />
        ) : (
          <ul className="space-y-2">
            {offers.map((o) => (
              <li
                key={o.id}
                className="rounded border border-gray-200 bg-white p-3 text-sm"
              >
                <span className="font-medium">{offerTypeLabel(o.type)}</span>{" "}
                · up to {o.capacity} people ·{" "}
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
        <OfferForm hasErg={hasErg} createOffer={createOfferAction} />
      </div>

      {isLiaison ? (
        <>
          <h2 className="mt-10 text-xl font-semibold">Upload inventory</h2>
          <p className="mt-1 text-sm text-gray-600">
            Paste your surplus items. You&apos;ll review them before anything is
            saved.
          </p>
          <div className="mt-3">
            <InventoryUpload
              actions={{
                normalize: normalizeInventoryAction,
                confirm: confirmInventoryAction,
              }}
            />
          </div>
        </>
      ) : null}
    </PageShell>
  );
}
