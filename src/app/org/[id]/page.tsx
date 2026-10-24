import { notFound, redirect } from "next/navigation";
import { GET as getOrgRoute } from "@/app/api/org/[id]/route";
import { Acronym, resetAcronyms } from "@/components/Acronym";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TimelineList } from "@/components/TimelineList";
import { navLinksFor } from "@/components/nav-links";
import type { Organization, TimelineEvent } from "@/lib/schemas";
import { callApi } from "../../_lib/call-api";
import { getCurrentAccount } from "../../session";
import { generateHandoffAction } from "./actions";
import { HandoffButton } from "./HandoffButton";

/**
 * Organization page (Task 23.2, rewired in Task 26.1; Req 2.1–2.6, 3.1).
 *
 * Reads the org and its timeline from `GET /api/org/[id]`, which checks that
 * the viewer belongs to this org and returns the timeline already sorted
 * newest first. Not signed in goes to the account picker; another org's page
 * shows a short message; a missing org is a 404 (Req 2.6). Members see a
 * read-only notice (Req 2.3). Only this org's officer gets the handoff
 * section (Req 3.1).
 */

interface OrgBody {
  organization: Organization;
  timeline: TimelineEvent[];
  emptyTimeline: boolean;
}

export default async function OrgPage({
  params,
}: {
  params: { id: string };
}) {
  resetAcronyms();
  const account = await getCurrentAccount();
  const nav = navLinksFor(account);

  const res = await callApi<OrgBody>(getOrgRoute, {
    path: `/api/org/${encodeURIComponent(params.id)}`,
    params: { id: params.id },
  });
  if (res.status === 401) redirect("/login");
  if (res.status === 404) notFound();
  if (res.status === 403 || !res.ok || res.json === null) {
    return (
      <PageShell role={account?.role} navLinks={nav}>
        <h1 className="text-2xl font-semibold">Club page</h1>
        <div className="mt-4">
          <EmptyState
            title="This page belongs to a different organization."
            message="Use the links above to go to your own pages, or switch account."
          />
        </div>
      </PageShell>
    );
  }

  const { organization: org, timeline } = res.json;
  const isMember = account?.role === "club_member";
  const canGenerateHandoff =
    account?.role === "club_officer" && account.orgId === org.id;

  return (
    <PageShell role={account?.role} navLinks={nav}>
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
        Recent asks, matches, visits, and donations, newest first.
      </p>
      <div className="mt-3">
        <TimelineList events={timeline} />
      </div>

      {canGenerateHandoff ? (
        <>
          <h2 className="mt-8 text-xl font-semibold">End-of-year handoff</h2>
          <p className="mt-1 text-sm text-gray-600">
            Make a short{" "}
            <Acronym
              term="handoff summary"
              expansion="a recap for the next officers"
            />{" "}
            from this club&apos;s timeline.
          </p>
          <HandoffButton orgId={org.id} generate={generateHandoffAction} />
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
