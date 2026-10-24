import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GET as getOrgRoute } from "@/app/api/org/[id]/route";
import { Acronym, resetAcronyms } from "@/components/Acronym";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TimelineLegend, TimelineList } from "@/components/TimelineList";
import { navLinksFor } from "@/components/nav-links";
import type { Organization, TimelineEvent } from "@/lib/schemas";
import { callApi } from "../../_lib/call-api";
import { getCurrentAccount } from "../../session";
import { generateHandoffAction } from "./actions";
import { HandoffButton } from "./HandoffButton";
/**
 * Organization page (Task 23.2, rewired in Task 26.1; Req 2.1–2.6, 3.1).
 * Visual refresh to match docs/design/club.html (see .kiro/steering/design.md):
 * a header with the org name, a one-line description, and a primary "New ask"
 * action, then a two-column body — the timeline (with a date column and status
 * dots) beside a handoff panel that stacks below on narrow screens.
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
      <PageShell role={account?.role} navLinks={nav} orgName={account?.label}>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.015em]">
          Club page
        </h1>
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
    <PageShell role={account?.role} navLinks={nav} orgName={account?.label}>
      {/* Header: name + one-line description, with the primary action on the
          right. The description is built from the org's own fields (type,
          school, city, size, mission) — no invented copy. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-bold leading-tight tracking-[-0.015em]">
            {org.name}
          </h1>
          <p className="mt-1 max-w-[64ch] text-muted">
            {readableType(org.type)} at {org.school} in {org.city},{" "}
            {org.size} members. {org.mission}
          </p>
        </div>
        {!isMember ? (
          <Link
            href="/asks/new"
            className="inline-flex h-[34px] items-center rounded-control bg-pen px-3.5 text-sm font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            New ask
          </Link>
        ) : null}
      </div>
      {isMember ? (
        <p className="rounded-control bg-bench px-3 py-2 text-sm text-muted">
          You are viewing this page as a member. It is read-only.
        </p>
      ) : null}
      {/* Two-column body: timeline on the left, handoff panel on the right.
          flex-wrap stacks the panel below the timeline on narrow screens. */}
      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="timeline-heading"
          className="min-w-0 flex-[999_1_540px]"
        >
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="timeline-heading"
              className="m-0 text-[17px] font-semibold"
            >
              Timeline
            </h2>
            <TimelineLegend />
          </div>
          <TimelineList events={timeline} />
        </section>
        {canGenerateHandoff ? (
          <section
            aria-labelledby="handoff-heading"
            className="min-w-0 flex-[1_1_300px] rounded-panel border border-line bg-white p-[18px]"
          >
            <h2
              id="handoff-heading"
              className="m-0 text-[17px] font-semibold"
            >
              Handoff for next year&apos;s officers
            </h2>
            <p className="mb-3.5 mt-1.5 text-sm text-graphite">
              Quippe writes a{" "}
              <Acronym
                term="handoff summary"
                expansion="a recap for the next officers"
              />{" "}
              of who you&apos;ve worked with and what&apos;s still open, so the
              next board doesn&apos;t start from zero.
            </p>
            <HandoffButton orgId={org.id} generate={generateHandoffAction} />
          </section>
        ) : null}
      </div>
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
