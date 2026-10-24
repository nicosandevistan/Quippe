"use client";

import { useState } from "react";
import {
  DashboardEntryView,
  type DashboardEntry,
  type DecisionResult,
} from "@/components/DashboardEntryView";
import { EmptyState } from "@/components/EmptyState";

/**
 * The company dashboard's matched asks, with Accept / Decline for the
 * liaison (Task 26.1; Req 5, 6). Accept and Decline call server actions that
 * post to `POST /api/asks/[id]/accept|decline` with the entry's matched offer;
 * the route checks the role, ownership, and capacity.
 *
 * After a decision the page is re-rendered with fresh data. An entry the
 * caller just decided on is kept on screen with its result, even if the fresh
 * dashboard no longer lists it, so the outcome isn't lost.
 *
 * The server action arrives as a prop from the server page instead of being
 * imported here. Next bundles actions imported by client components into a
 * separate server layer with its own copy of the in-memory repo, so writes
 * made there would not show up on the pages or API routes.
 */

interface Decided {
  entry: DashboardEntry;
  result: DecisionResult;
}

export type DecideAction = (askId: string, offerId: string) => Promise<DecisionResult>;

export function DashboardList({
  entries,
  canDecide,
  accept,
  decline,
}: {
  entries: DashboardEntry[];
  canDecide: boolean;
  accept: DecideAction;
  decline: DecideAction;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, Decided>>({});

  const shown: DashboardEntry[] = [
    ...entries,
    ...Object.values(decided)
      .map((d) => d.entry)
      .filter((e) => !entries.some((x) => x.askId === e.askId)),
  ];

  async function decide(entry: DashboardEntry, kind: "accept" | "decline") {
    setBusyId(entry.askId);
    let result: DecisionResult;
    try {
      result =
        kind === "accept"
          ? await accept(entry.askId, entry.offer.id)
          : await decline(entry.askId, entry.offer.id);
    } catch {
      result = { kind: "error", message: "That didn't work. Please try again." };
    }
    setDecided((prev) => ({ ...prev, [entry.askId]: { entry, result } }));
    setBusyId(null);
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        title="No matched asks yet"
        message="When a student group's request matches one of your offers, it shows up here."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {shown.map((entry) => (
        <li key={entry.askId}>
          <DashboardEntryView
            entry={entry}
            canDecide={canDecide}
            busy={busyId === entry.askId}
            result={decided[entry.askId]?.result ?? null}
            onAccept={() => decide(entry, "accept")}
            onDecline={() => decide(entry, "decline")}
          />
        </li>
      ))}
    </ul>
  );
}
