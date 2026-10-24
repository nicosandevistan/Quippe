/**
 * One matched ask on the company dashboard (Task 26.1; Req 5.1–5.4, 6.1,
 * 6.2). Presentation only: the entry, its score, and its reasons come from
 * `GET /api/company/[id]/dashboard`, and Accept/Decline results come from
 * `POST /api/asks/[id]/accept|decline`.
 *
 * Accept and Decline appear only when the parent says this viewer may decide
 * (`canDecide`, the company liaison) and the ask is still `matched`. Any other
 * status is shown in words instead. The result of a decision appears in a
 * `role="status"` region that is always present, so it is announced.
 */

/** A dashboard entry as returned by the dashboard route. */
export interface DashboardEntry {
  askId: string;
  orgId: string;
  orgName: string;
  offerId: string;
  score: number;
  reasons: string[];
  noReasons: boolean;
  matchedOfferIds: string[];
  ask: {
    id: string;
    type: string;
    topic: string;
    groupSize: number;
    deliveryMode: string;
    preferredDates: string[];
    status: string;
  };
  offer: { id: string; type: string; notes: string };
}

export type DecisionResult =
  | { kind: "done"; status: string }
  | { kind: "error"; message: string };

/** Plain phrase for a 0..1 match score, with the number. */
export function scorePhrase(score: number): string {
  const label =
    score >= 0.7 ? "Strong match" : score >= 0.4 ? "Good match" : "Possible match";
  return `${label} (score ${score.toFixed(2)})`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_advisor_approval: "Waiting for advisor approval",
  open: "Open",
  matched: "Matched",
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Rejected",
};

/** An ask status in words. */
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

const OFFER_TYPE_LABEL: Record<string, string> = {
  supplies: "Supplies",
  lab_tour: "Lab tour",
  speaker: "Speaker",
  erg_event: "ERG event",
};

/** An offer type in words. */
export function offerTypeLabel(type: string): string {
  return OFFER_TYPE_LABEL[type] ?? type;
}

/** Result line after Accept/Decline. */
export function decisionText(result: DecisionResult): string {
  return result.kind === "done"
    ? `Done. This ask is now ${statusLabel(result.status).toLowerCase()}.`
    : result.message;
}

export interface DashboardEntryViewProps {
  entry: DashboardEntry;
  /** True when the viewer may accept or decline (the company liaison). */
  canDecide: boolean;
  /** True while a decision is being saved. */
  busy?: boolean;
  result?: DecisionResult | null;
  onAccept?: () => void;
  onDecline?: () => void;
}

export function DashboardEntryView({
  entry,
  canDecide,
  busy = false,
  result = null,
  onAccept,
  onDecline,
}: DashboardEntryViewProps) {
  const status =
    result?.kind === "done" ? result.status : entry.ask.status;
  const showButtons = canDecide && status === "matched";
  const headingId = `ask-${entry.askId}-title`;

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <h3 id={headingId} className="font-medium">
        {entry.ask.topic}
      </h3>
      <p className="mt-1 text-sm text-gray-700">From {entry.orgName}</p>
      <p className="mt-1 text-sm text-gray-600">
        Group of {entry.ask.groupSize} ·{" "}
        {entry.ask.deliveryMode === "in_person" ? "In person" : "Virtual"} ·
        Matches your {offerTypeLabel(entry.offer.type).toLowerCase()} offer
      </p>
      <p className="mt-2 text-sm font-medium">{scorePhrase(entry.score)}</p>

      <h4 className="mt-2 text-sm font-medium">Why it matches</h4>
      {entry.noReasons || entry.reasons.length === 0 ? (
        <p className="text-sm italic text-gray-600">No reasons available</p>
      ) : (
        <ul className="ml-5 list-disc text-sm">
          {entry.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {showButtons ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="rounded border border-red-700 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-700">
          Status: {statusLabel(status)}
        </p>
      )}

      <div role="status" aria-live="polite" className="mt-2 text-sm">
        {result === null ? null : (
          <p
            className={
              result.kind === "done" ? "font-medium text-green-800" : "text-red-700"
            }
          >
            {decisionText(result)}
          </p>
        )}
      </div>
    </article>
  );
}
