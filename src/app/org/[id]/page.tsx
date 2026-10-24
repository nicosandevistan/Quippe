import { notFound } from "next/navigation";

import { Acronym, resetAcronyms } from "@/components/Acronym";
import { PageShell } from "@/components/PageShell";
import { TimelineList } from "@/components/TimelineList";
import { sortTimeline } from "@/lib/core/timeline";
import { getRepo } from "@/lib/data/repo";
import type { OrgId } from "@/lib/schemas";

import { getCurrentAccount } from "../../session";
import { HandoffButton } from "./HandoffButton";

/**
 * Organization page (Task 23.2; Req 2.1–2.6, 3.1, 3.4, 3.5).
 *
 * Shows the org profile and its timeline in reverse-chronological order via the
 * pure core `sortTimeline`. A missing org 404s (Req 2.6). Create/edit/delete
 * controls are HIDDEN for members (Req 2.3) — this page is read-only for
 * everyone in the MVP, and members simply never see write actions. The
 * "Generate handoff summary" button renders the summary or its typed fallback.
 *
 * TODO(api): read the org + timeline from `GET /api/org/[id]` once Task 16
 * lands; today it reads the repo on the server.
 */

export default async function OrgPage({
  params,
}: {
  params: { id: string };
}) {
  resetAcronyms();
  const repo = getRepo();
  const orgId = params.id as OrgId;

  const org = await repo.getOrganization(orgId);
  if (!org) {
    notFound();
  }

  const events = sortTimeline(await repo.listTimelineEvents(orgId));
  const account = await getCurrentAccount();
  const isMember = account?.role === "club_member";
  // Only an officer of THIS org gets the handoff action in the MVP.
  const canGenerateHandoff =
    account?.role === "club_officer" && account.orgId === orgId;

  return (
    <PageShell role={account?.role}>
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="mt-1 text-gray-700">
        {org.school} · {org.city}
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gray-600">Type</dt>
          <dd>{readableType(org.type)}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-600">Members</dt>
          <dd>{org.size}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm font-medium text-gray-600">Mission</dt>
          <dd>{org.mission}</dd>
        </div>
      </dl>

      {isMember ? (
        <p className="mt-4 rounded bg-gray-100 px-3 py-2 text-sm text-gray-700">
          You are viewing this page as a member. It is read-only.
        </p>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">Timeline</h2>
      <p className="mt-1 text-sm text-gray-600">
        Recent asks, matches, visits, and donations — newest first.
      </p>
      <div className="mt-3">
        <TimelineList events={events} />
      </div>

      {canGenerateHandoff ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">End-of-year handoff</h2>
          <p className="mt-1 text-sm text-gray-600">
            Make a short <Acronym term="handoff summary" expansion="a recap for the next officers" />{" "}
            from this org&apos;s timeline.
          </p>
          <HandoffButton orgId={orgId} />
        </>
      ) : null}
    </PageShell>
  );
}

function readableType(type: string): string {
  switch (type) {
    case "high_school_club":
      return "High school club";
    case "college_club":
      return "College club";
    case "undergrad_lab":
      return "Undergraduate lab";
    case "community_org":
      return "Community organization";
    default:
      return type;
  }
}
