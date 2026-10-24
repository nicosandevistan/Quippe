import { GET as advisorQueueRoute } from "@/app/api/advisor/queue/route";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { navLinksFor } from "@/components/nav-links";
import type { Ask } from "@/lib/schemas";
import { apiErrorText, callApi } from "../_lib/call-api";
import { getCurrentAccount } from "../session";
import { approveAskAction, rejectAskAction } from "./actions";
import { AdvisorQueue, type QueueAsk } from "./AdvisorQueueRow";

/**
 * Advisor approval queue (Task 25.2, rewired in Task 26.1; Req 9.3, 9.5,
 * 9.6).
 *
 * The queue comes from `GET /api/advisor/queue`, which returns only this
 * advisor's club's requests that are waiting for approval. Approve and Reject
 * go through `POST /api/asks/[id]/approve|reject`, which re-check the role and
 * that the request belongs to the advisor's club.
 */
export default async function AdvisorPage() {
  const account = await getCurrentAccount();
  const nav = navLinksFor(account);

  const res = await callApi<{ asks: Ask[]; empty: boolean }>(advisorQueueRoute, {
    path: "/api/advisor/queue",
  });

  if (res.status === 401 || res.status === 403) {
    return (
      <PageShell role={account?.role} navLinks={nav}>
        <h1 className="text-2xl font-semibold">Approval queue</h1>
        <div className="mt-4">
          <EmptyState
            title="Advisors only"
            message="Sign in as a club advisor to see requests waiting for approval."
          />
        </div>
      </PageShell>
    );
  }

  const rows: QueueAsk[] = (res.json?.asks ?? []).map((a) => ({
    id: a.id,
    topic: a.topic,
    groupSize: a.groupSize,
    deliveryMode: a.deliveryMode,
    preferredDates: a.preferredDates,
  }));

  return (
    <PageShell role={account?.role} navLinks={nav}>
      <h1 className="text-2xl font-semibold">Approval queue</h1>
      <p className="mt-1 text-gray-700">
        In-person requests from your club need your approval before any company
        can see them.
      </p>
      <div className="mt-6">
        {res.ok ? (
          <AdvisorQueue
            asks={rows}
            actions={{ approve: approveAskAction, reject: rejectAskAction }}
          />
        ) : (
          <p role="alert" className="text-sm text-red-700">
            {apiErrorText(res.json, "The approval queue couldn't be loaded.")}
          </p>
        )}
      </div>
    </PageShell>
  );
}
