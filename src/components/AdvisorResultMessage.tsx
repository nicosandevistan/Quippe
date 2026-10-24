/**
 * The outcome line shown after an advisor approves or rejects a request
 * (Task 26.1; Req 9.3, 9.5). Presentation only: the new status comes from
 * `POST /api/asks/[id]/approve` or `/reject`.
 */

export type AdvisorDecision = "approve" | "reject";

/** Plain-language result for an advisor decision and the ask's new status. */
export function advisorResultText(
  decision: AdvisorDecision,
  status: string,
): string {
  if (decision === "reject") return "Rejected. Companies won't see it.";
  const base = "Approved. Companies can now see it.";
  return status === "matched" ? `${base} It already matches an offer.` : base;
}

export type AdvisorResult =
  | { kind: "done"; decision: AdvisorDecision; status: string }
  | { kind: "error"; message: string };

/**
 * Status region for a queue row. Always rendered (empty until there is a
 * result) so screen readers announce the text when it appears.
 */
export function AdvisorResultMessage({
  result,
}: {
  result: AdvisorResult | null;
}) {
  return (
    <div role="status" aria-live="polite" className="mt-3 text-sm">
      {result === null ? null : result.kind === "done" ? (
        <p className="font-medium text-green-800">
          {advisorResultText(result.decision, result.status)}
        </p>
      ) : (
        <p className="text-red-700">{result.message}</p>
      )}
    </div>
  );
}
