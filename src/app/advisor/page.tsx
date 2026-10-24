import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { getRepo } from "@/lib/data/repo";
import type { OrgId } from "@/lib/schemas";

import { getCurrentAccount } from "../session";
import { AdvisorQueueRow, type QueueAsk } from "./AdvisorQueueRow";

/**
 * Advisor approval queue (Task 25.2; Req 9.3, 9.5, 9.6).
 *
 * Lists ONLY this advisor's org asks in `pending_advisor_approval`. Approve
 * sets the ask to `open`; reject sets it to `rejected`. Both go through the
 * advisor actions, which re-check org ownership.
 *
 * TODO(api): read the queue from `GET /api/advisor/queue` once Task 18.2 lands;
 * today it reads the repo on the server, scoped to the advisor's org.
 */

export default async function AdvisorPage() {
  const account = await getCurrentAccount();

  if (!account || account.role !== "club_advisor" || !account.orgId) {
    return (
      <PageShell role={account?.role}>
        <h1 className="text-2xl font-semibold">Approval queue</h1>
        <div className="mt-4">
          <EmptyState
            title="Advisors only"
            message="Sign in as a club advisor to see requests awaiting approval."
          />
        </div>
      </PageShell>
    );
  }

  const repo = getRepo();
  const pending = await repo.listAsks({
    orgId: account.orgId as OrgId,
    status: "pending_advisor_approval",
  });

  const rows: QueueAsk[] = pending.map((a) => ({
    id: a.id,
    topic: a.topic,
    groupSize: a.groupSize,
    deliveryMode: a.deliveryMode,
    preferredDates: a.preferredDates,
  }));

  return (
    <PageShell role={account.role}>
      <h1 className="text-2xl font-semibold">Approval queue</h1>
      <p className="mt-1 text-gray-700">
        In-person requests from your club need your approval before any company
        can see them.
      </p>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to approve"
            message="There are no requests waiting for your approval right now."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((ask) => (
              <AdvisorQueueRow key={ask.id} ask={ask} />
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
