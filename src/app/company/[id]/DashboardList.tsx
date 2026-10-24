"use client";
import { useState } from "react";
import {
  offerTypeLabel,
  type DashboardEntry,
  type DecisionResult,
} from "@/components/DashboardEntryView";
import { EmptyState } from "@/components/EmptyState";
import { fitBars, fitPhrase } from "./fit-label";
/**
 * The company dashboard's matched asks as a table, matching
 * docs/design/company-dashboard.html (see .kiro/steering/design.md).
 *
 * Columns: Ask, Club, Fit, Why it matched, and a right-aligned actions cell.
 * The liaison gets Accept / Decline per row; the ERG lead (`canDecide` false)
 * sees the status in words instead. Accept and Decline call server actions
 * that post to `POST /api/asks/[id]/accept|decline` with the entry's matched
 * offer; the route checks role, ownership, and capacity. Behaviour is
 * unchanged from the card version:
 *  - after a decision the page re-renders with fresh data, and an entry the
 *    caller just decided on is kept on screen with its result even if the
 *    fresh dashboard no longer lists it, so the outcome isn't lost;
 *  - the server action arrives as a prop (Next bundles client-imported actions
 *    into a separate server layer with its own repo copy, so writes made there
 *    would not show up on the pages or API routes).
 *
 * Visual-only additions over the card version: a segmented Open / Accepted /
 * All filter driven by client state (no API change — the counts are computed
 * from the entries the page already received), the three-bar fit meter and its
 * word (`fit-label.ts`), and status colour carried only by the "Accepted" and
 * error text per design.md.
 */
interface Decided {
  entry: DashboardEntry;
  result: DecisionResult;
}
export type DecideAction = (askId: string, offerId: string) => Promise<DecisionResult>;
type Filter = "open" | "accepted" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "accepted", label: "Accepted" },
  { key: "all", label: "All" },
];
/**
 * Short date for an ask's first preferred date, e.g. "Nov 14". Returns null
 * when there is no usable date, so the caller can omit the clause rather than
 * invent one.
 */
function shortDate(iso: string | undefined): string | null {
  if (iso === undefined || iso === "") return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** The muted sub-line under the ask topic: its type and, if known, a date. */
function askSubline(entry: DashboardEntry): string {
  const type = offerTypeLabel(entry.ask.type);
  const date = shortDate(entry.ask.preferredDates[0]);
  return date ? `${type}, by ${date}` : type;
}
/** The muted sub-line under the club name: group size and delivery mode. */
function clubSubline(entry: DashboardEntry): string {
  const size = `${entry.ask.groupSize} ${entry.ask.groupSize === 1 ? "member" : "members"}`;
  const mode = entry.ask.deliveryMode === "in_person" ? "in person" : "virtual";
  return `${size}, ${mode}`;
}
/** The three-bar fit meter, decorative; the word beside it carries meaning. */
function FitMeter({ score }: { score: number }) {
  const lit = fitBars(score);
  return (
    <span className="mr-2 inline-flex gap-0.5 align-[-1px]" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={
            "h-3 w-1 rounded-[1px] " + (n <= lit ? "bg-pen" : "bg-[#D5D9E0]")
          }
        />
      ))}
    </span>
  );
}
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
  const [filter, setFilter] = useState<Filter>("open");
  const shown: DashboardEntry[] = [
    ...entries,
    ...Object.values(decided)
      .map((d) => d.entry)
      .filter((e) => !entries.some((x) => x.askId === e.askId)),
  ];
  /** The effective status of an entry, honouring a just-made decision. */
  function statusOf(entry: DashboardEntry): string {
    const r = decided[entry.askId]?.result;
    return r?.kind === "done" ? r.status : entry.ask.status;
  }
  const counts = {
    open: shown.filter((e) => statusOf(e) === "matched").length,
    accepted: shown.filter((e) => statusOf(e) === "accepted").length,
    all: shown.length,
  };
  const visible = shown.filter((e) => {
    const status = statusOf(e);
    if (filter === "open") return status === "matched";
    if (filter === "accepted") return status === "accepted";
    return true;
  });
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex overflow-hidden rounded-control border border-[#D5D9E0] bg-white"
          role="group"
          aria-label="Filter asks"
        >
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                className={
                  "border-l border-[#D5D9E0] px-3 py-1.5 text-[13px] font-medium first:border-l-0 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen " +
                  (active
                    ? "bg-[#EEF1FC] text-pen"
                    : "text-graphite hover:bg-bench")
                }
              >
                {label} ({counts[key]})
              </button>
            );
          })}
        </div>
        <span className="text-[13px] text-muted">Sorted by fit</span>
      </div>
      <div className="overflow-x-auto rounded-panel border border-line bg-white">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Matched asks</caption>
          <thead>
            <tr>
              <th scope="col" className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-left text-[13px] font-medium text-muted">
                Ask
              </th>
              <th scope="col" className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-left text-[13px] font-medium text-muted">
                Club
              </th>
              <th scope="col" className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-left text-[13px] font-medium text-muted">
                Fit
              </th>
              <th scope="col" className="whitespace-nowrap border-b border-line px-3.5 py-2.5 text-left text-[13px] font-medium text-muted">
                Why it matched
              </th>
              <th scope="col" className="border-b border-line px-3.5 py-2.5 text-left">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3.5 py-6 text-center text-muted">
                  No asks in this view.
                </td>
              </tr>
            ) : (
              visible.map((entry) => {
                const status = statusOf(entry);
                const result = decided[entry.askId]?.result ?? null;
                const busy = busyId === entry.askId;
                const accepted = status === "accepted";
                const showButtons = canDecide && status === "matched";
                return (
                  <tr
                    key={entry.askId}
                    className={accepted ? "bg-[#FAFBFC]" : undefined}
                  >
                    <td className="border-b border-[#EDEFF2] px-3.5 py-3.5 align-top">
                      <div className="font-semibold">{entry.ask.topic}</div>
                      <div className="text-[13px] text-muted">{askSubline(entry)}</div>
                    </td>
                    <td className="border-b border-[#EDEFF2] px-3.5 py-3.5 align-top">
                      <div>{entry.orgName}</div>
                      <div className="text-[13px] text-muted">{clubSubline(entry)}</div>
                    </td>
                    <td className="whitespace-nowrap border-b border-[#EDEFF2] px-3.5 py-3.5 align-top">
                      <FitMeter score={entry.score} />
                      {fitPhrase(entry.score)}
                    </td>
                    <td className="border-b border-[#EDEFF2] px-3.5 py-3.5 align-top text-graphite">
                      {entry.noReasons || entry.reasons.length === 0 ? (
                        <span className="italic text-muted">No reasons available</span>
                      ) : (
                        entry.reasons.join(" ")
                      )}
                      {result !== null ? (
                        <span
                          role="status"
                          aria-live="polite"
                          className={
                            "mt-1 block text-[13px] " +
                            (result.kind === "done"
                              ? "font-medium text-done"
                              : "text-needed")
                          }
                        >
                          {result.kind === "done"
                            ? `This ask is now ${status}.`
                            : result.message}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#EDEFF2] px-3.5 py-3.5 text-right align-top">
                      {showButtons ? (
                        <span className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => decide(entry, "decline")}
                            disabled={busy}
                            className="h-[34px] rounded-control px-3.5 text-sm font-semibold text-muted hover:text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:opacity-60"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(entry, "accept")}
                            disabled={busy}
                            className="h-[34px] rounded-control bg-pen px-3.5 text-sm font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:opacity-60"
                          >
                            Accept
                          </button>
                        </span>
                      ) : accepted ? (
                        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-done">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                          </svg>
                          Accepted
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted">
                          {statusWord(status)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
/** Sentence-case word for an ask status shown in the read-only actions cell. */
function statusWord(status: string): string {
  const labels: Record<string, string> = {
    matched: "Matched",
    accepted: "Accepted",
    declined: "Declined",
    rejected: "Rejected",
    open: "Open",
    pending_advisor_approval: "Waiting for advisor approval",
    draft: "Draft",
  };
  return labels[status] ?? status;
}
