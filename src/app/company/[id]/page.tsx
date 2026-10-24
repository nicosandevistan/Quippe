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
 * Company page (Task 25.1, rewired in Task 26.1; Req 4, 5, 6, 7, 13),
 * restyled to match docs/design/company-dashboard.html (see
 * .kiro/steering/design.md). Visual only: the data flow and server actions
 * are unchanged.
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
 *
 * The mockup's header "Post an offer" button and the "Edit offers" link are
 * in-page anchors to the composer and offers sections below — the mockup's
 * separate pages don't exist here, so nothing new is fetched or invented.
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
      <PageShell role={account?.role} navLinks={nav} orgName={account?.label}>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.015em]">
          Company page
        </h1>
        <p className="rounded-panel border border-line bg-white px-3 py-2 text-sm text-muted">
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
    <PageShell role={account.role} navLinks={nav} orgName={account.label}>
      {/* Header ------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.015em]">
            Matched asks
          </h1>
          <p className="mt-1 max-w-[60ch] text-muted">
            Requests from student groups that match what {company?.name ?? "your company"}{" "}
            currently offers.
            {isLiaison
              ? ""
              : " You can view these; the company liaison accepts or declines."}
          </p>
        </div>
        <a
          href="#post-offer"
          className="inline-flex h-[34px] items-center rounded-control border border-[#D5D9E0] bg-white px-3.5 text-sm font-semibold text-ink hover:bg-bench focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
        >
          Post an offer
        </a>
      </div>
      {/* Dashboard ---------------------------------------------------- */}
      {dashboardRes.ok && dashboardRes.json !== null ? (
        <DashboardList
          entries={dashboardRes.json.matches}
          canDecide={isLiaison}
          accept={acceptAskAction}
          decline={declineAskAction}
        />
      ) : (
        <p role="alert" className="text-sm text-needed">
          {apiErrorText(dashboardRes.json, "The dashboard couldn't be loaded.")}
        </p>
      )}
      {/* Offers ------------------------------------------------------- */}
      <section aria-labelledby="offers" className="mt-2 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 id="offers" className="text-[17px] font-semibold">
            Your offers
          </h2>
          <a
            href="#post-offer"
            className="text-sm text-pen hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Edit offers
          </a>
        </div>
        {!offersRes.ok ? (
          <p role="alert" className="text-sm text-needed">
            {apiErrorText(offersRes.json, "Your offers couldn't be loaded.")}
          </p>
        ) : offers.length === 0 ? (
          <EmptyState title="No offers yet" message="Post your first offer below." />
        ) : (
          <div className="flex flex-wrap rounded-panel border border-line bg-white">
            {offers.map((o) => (
              <div
                key={o.id}
                className="box-border flex-[1_1_180px] border-r border-[#EDEFF2] px-4 py-3.5 last:border-r-0"
              >
                <div className="text-sm font-semibold">{offerTypeLabel(o.type)}</div>
                <div className="text-[13px] text-muted">
                  Up to {o.capacity}{" "}
                  {o.deliveryMode === "in_person" ? "in person" : "virtual"}, {o.city}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {/* Post an offer ------------------------------------------------ */}
      <section aria-labelledby="post-offer-heading" className="mt-2 flex flex-col gap-2.5">
        <h2 id="post-offer-heading" className="scroll-mt-6 text-[17px] font-semibold">
          <span id="post-offer" />
          Post an offer
        </h2>
        {!hasErg ? (
          <p className="text-sm text-muted">
            To post an{" "}
            <Acronym term="ERG" expansion="employee resource group" /> event,
            create an ERG first.
          </p>
        ) : null}
        <OfferForm hasErg={hasErg} createOffer={createOfferAction} />
      </section>
      {/* Upload inventory -------------------------------------------- */}
      {isLiaison ? (
        <section aria-labelledby="inventory-heading" className="mt-2 flex flex-col gap-2.5">
          <h2 id="inventory-heading" className="text-[17px] font-semibold">
            Upload inventory
          </h2>
          <p className="text-sm text-muted">
            Paste your surplus items. You&apos;ll review them before anything is
            saved.
          </p>
          <InventoryUpload
            actions={{
              normalize: normalizeInventoryAction,
              confirm: confirmInventoryAction,
            }}
          />
        </section>
      ) : null}
    </PageShell>
  );
}
