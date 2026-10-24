import type { TimelineEvent, TimelineEventKind } from "@/lib/schemas";

import { EmptyState } from "./EmptyState";

/**
 * Render an organization's timeline in reverse-chronological order (Task 22.1;
 * Req 2.2, 2.3, 2.5).
 *
 * The caller passes events ALREADY sorted by the pure core `sortTimeline`
 * (date desc, seq asc). This component is presentation only — it does not sort,
 * so the deterministic ordering stays owned by `lib/core`. An empty list shows
 * the empty-timeline indicator (Req 2.5).
 *
 * Each event shows a plain-language kind badge, its date, and summary. Dates
 * are the schema's ISO strings; we show them verbatim (no locale parsing) so
 * the output is deterministic and matches the seed.
 */

const KIND_LABEL: Record<TimelineEventKind, string> = {
  ask: "Ask sent",
  match: "Matched",
  visit: "Visit",
  donation: "Donation",
  accepted: "Accepted",
  declined: "Declined",
};

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
    <ol className="space-y-3">
      {events.map((e) => (
        <li
          key={e.id}
          className="rounded-md border border-gray-200 bg-white p-3"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
              {KIND_LABEL[e.kind]}
            </span>
            <time className="text-sm text-gray-600">{e.date}</time>
          </div>
          <p className="mt-1 text-sm text-gray-900">{e.summary}</p>
        </li>
      ))}
    </ol>
  );
}
