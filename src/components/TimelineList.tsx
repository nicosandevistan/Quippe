import type { TimelineEvent, TimelineEventKind } from "@/lib/schemas";
import { EmptyState } from "./EmptyState";
/**
 * Render an organization's timeline in reverse-chronological order (Task 22.1;
 * Req 2.2, 2.3, 2.5). Visual refresh to match docs/design/club.html: a date
 * column, a status dot, and the summary, laid out as a grid inside a single
 * `line`-bordered panel.
 *
 * The caller passes events ALREADY sorted by the pure core `sortTimeline`
 * (date desc, seq asc). This component is presentation only — it does not sort,
 * so the deterministic ordering stays owned by `lib/core`. An empty list shows
 * the empty-timeline indicator (Req 2.5).
 *
 * Each event shows its date, a status dot, a plain-language status word, and
 * the summary. Dates keep the schema's ISO string in `<time dateTime>` for
 * assistive tech and determinism; a short human label is shown alongside it.
 *
 * Status is carried by BOTH a colored dot and a text word, so color is never
 * the only signal (design.md accessibility cross-cut). The dot color maps the
 * event kind onto the three states the mock shows:
 *  - done (green):  accepted, donation, visit — a completed outcome.
 *  - matched (pen): match — paired with an offer, in progress.
 *  - waiting (gray outline): ask — sent, awaiting a response.
 *  - declined keeps the muted/gray dot and its own "Declined" word.
 */
const KIND_LABEL: Record<TimelineEventKind, string> = {
  ask: "Ask sent",
  match: "Matched",
  visit: "Visit",
  donation: "Donation",
  accepted: "Accepted",
  declined: "Declined",
};
type DotState = "waiting" | "matched" | "done" | "declined";
const KIND_DOT: Record<TimelineEventKind, DotState> = {
  ask: "waiting",
  match: "matched",
  visit: "done",
  donation: "done",
  accepted: "done",
  declined: "declined",
};
/** The three legend states the mock shows, in its order. */
const LEGEND: { state: DotState; label: string }[] = [
  { state: "waiting", label: "Waiting" },
  { state: "matched", label: "Matched" },
  { state: "done", label: "Done" },
];
export interface TimelineListProps {
  events: TimelineEvent[];
}
export function TimelineList({ events }: TimelineListProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        message="This organization has no timeline events so far."
      />
    );
  }
  return (
    <ol className="m-0 list-none rounded-panel border border-line bg-white p-0">
      {events.map((e, i) => {
        const state = KIND_DOT[e.kind];
        return (
          <li
            key={e.id}
            className={
              "grid grid-cols-[72px_16px_1fr] gap-x-3 px-4 py-3 text-sm" +
              (i < events.length - 1 ? " border-b border-line" : "")
            }
          >
            <time
              dateTime={e.date}
              className="pt-px text-[13px] tabular-nums text-muted"
            >
              {shortDate(e.date)}
            </time>
            <StatusDot state={state} />
            <div>
              <span className="font-semibold text-ink">
                {e.summary}
              </span>{" "}
              <span className="text-graphite">{KIND_LABEL[e.kind]}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
/** The legend row above the timeline. Dots plus words, never color alone. */
export function TimelineLegend() {
  return (
    <span className="flex gap-3.5 text-[13px] text-muted">
      {LEGEND.map((item) => (
        <span key={item.state} className="flex items-center">
          <StatusDot state={item.state} inline />
          {item.label}
        </span>
      ))}
    </span>
  );
}
function StatusDot({
  state,
  inline = false,
}: {
  state: DotState;
  inline?: boolean;
}) {
  const base = inline
    ? "mr-1.5 inline-block h-2 w-2 flex-none box-border rounded-full"
    : "mt-1.5 inline-block h-2.5 w-2.5 flex-none box-border rounded-full";
  const color =
    state === "done"
      ? "bg-done"
      : state === "matched"
        ? "bg-pen"
        : state === "declined"
          ? "bg-muted"
          : "border-2 border-[#9AA1AD]";
  return <span className={`${base} ${color}`} aria-hidden="true" />;
}
/**
 * A short, deterministic date label for display only ("Feb 20", "Apr 5").
 * The machine-readable ISO value stays in `<time dateTime>`. Parsed as UTC so
 * the label does not shift with the runtime timezone; falls back to the raw
 * string if it is not the expected YYYY-MM-DD shape.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (month === undefined) return iso;
  const day = Number(m[3]);
  return `${month} ${day}`;
}
