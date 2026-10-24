"use client";
import { useState } from "react";
import {
  AdvisorResultMessage,
  type AdvisorDecision,
  type AdvisorResult,
} from "@/components/AdvisorResultMessage";
import { EmptyState } from "@/components/EmptyState";
import { sentenceCase } from "@/components/text-format";
/**
 * The advisor's approval queue with Approve / Reject buttons (Task 25.2,
 * rewired in Task 26.1; Req 9.3, 9.5, 9.6). The buttons call server actions
 * that post to `POST /api/asks/[id]/approve|reject`.
 *
 * After a decision SUCCEEDS the request leaves the queue immediately: its id is
 * tracked in `decidedIds` and filtered out of the shown list. Because removing
 * the card also removes its per-row result message, the outcome is announced in
 * one persistent polite live region outside the cards (see `lastOutcome`). On
 * failure the row stays on screen with its error message so the advisor can
 * retry.
 *
 * The server action arrives as a prop from the server page instead of being
 * imported here. Next bundles actions imported by client components into a
 * separate server layer with its own copy of the in-memory repo, so writes
 * made there would not show up on the pages or API routes.
 */
export type AdvisorActionResult =
  | { ok: true; status: string }
  | { ok: false; message: string };
export interface AdvisorActions {
  approve: (askId: string) => Promise<AdvisorActionResult>;
  reject: (askId: string) => Promise<AdvisorActionResult>;
}
export interface QueueAsk {
  id: string;
  topic: string;
  groupSize: number;
  deliveryMode: string;
  preferredDates: string[];
}

/** The last successful decision, announced in the persistent live region. */
export interface DecisionOutcome {
  decision: AdvisorDecision;
  topic: string;
}

/**
 * Pure filtering logic for the queue: the asks still waiting, with the ones the
 * advisor has already decided (and whose action succeeded) removed. Decided ids
 * are dropped whether or not the server has yet stopped returning them in
 * `asks`, so a just-decided card leaves the list immediately.
 */
export function visibleAsks(
  asks: QueueAsk[],
  decidedIds: ReadonlySet<string> | readonly string[],
): QueueAsk[] {
  const decided =
    decidedIds instanceof Set ? decidedIds : new Set(decidedIds);
  return asks.filter((a) => !decided.has(a.id));
}

/** The text the persistent live region announces for the last decision. */
export function decisionOutcomeText(outcome: DecisionOutcome): string {
  const topic = sentenceCase(outcome.topic);
  return outcome.decision === "approve"
    ? `Approved: ${topic}.`
    : `Rejected: ${topic}.`;
}

export function AdvisorQueue({
  asks,
  actions,
}: {
  asks: QueueAsk[];
  actions: AdvisorActions;
}) {
  const [decidedIds, setDecidedIds] = useState<Set<string>>(new Set());
  const [lastOutcome, setLastOutcome] = useState<DecisionOutcome | null>(null);
  const shown = visibleAsks(asks, decidedIds);
  // One persistent polite live region, outside the removed cards, so the
  // outcome is still announced after a decided card (and its own status
  // region) is gone. It stays visible alongside the empty state.
  const liveRegion = (
    <div role="status" aria-live="polite" className="text-sm">
      {lastOutcome ? (
        <p className="font-medium text-green-800">
          {decisionOutcomeText(lastOutcome)}
        </p>
      ) : null}
    </div>
  );
  if (shown.length === 0) {
    return (
      <div className="space-y-3">
        {liveRegion}
        <EmptyState
          title="Nothing to approve"
          message="There are no requests waiting for your approval right now."
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {liveRegion}
      <ul className="space-y-3">
        {shown.map((ask) => (
          <AdvisorQueueRow
            key={ask.id}
            ask={ask}
            actions={actions}
            onDecided={(decision) => {
              setDecidedIds((prev) => {
                const next = new Set(prev);
                next.add(ask.id);
                return next;
              });
              setLastOutcome({ decision, topic: ask.topic });
            }}
          />
        ))}
      </ul>
    </div>
  );
}
export function AdvisorQueueRow({
  ask,
  actions,
  onDecided,
}: {
  ask: QueueAsk;
  actions: AdvisorActions;
  onDecided?: (decision: AdvisorDecision) => void;
}) {
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<AdvisorResult | null>(null);
  async function act(decision: AdvisorDecision) {
    setWorking(true);
    try {
      const res =
        decision === "approve"
          ? await actions.approve(ask.id)
          : await actions.reject(ask.id);
      if (res.ok) {
        // Success removes the card; the outcome is announced by the queue's
        // persistent live region, not this row's status region.
        onDecided?.(decision);
      } else {
        setResult({ kind: "error", message: res.message });
      }
    } catch {
      setResult({ kind: "error", message: "That didn't work. Please try again." });
    } finally {
      setWorking(false);
    }
  }
  return (
    <li className="rounded-md border border-gray-200 bg-white p-4">
      <p className="font-medium">{sentenceCase(ask.topic)}</p>
      <p className="mt-1 text-sm text-gray-600">
        Group of {ask.groupSize} ·{" "}
        {ask.deliveryMode === "in_person" ? "In person" : "Virtual"}
        {ask.preferredDates.length > 0
          ? ` · Preferred dates: ${ask.preferredDates.join(", ")}`
          : ""}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => act("approve")}
          disabled={working}
          className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={working}
          className="rounded border border-red-700 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Reject
        </button>
      </div>
      <AdvisorResultMessage result={result} />
    </li>
  );
}
