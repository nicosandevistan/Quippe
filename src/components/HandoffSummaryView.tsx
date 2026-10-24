import type { HandoffSummary } from "@/lib/schemas";

/**
 * Shows the result of "Generate handoff summary" (Task 26.1; Req 3.1, 3.4,
 * 3.5). Presentation only: the summary (or the fallback) comes from
 * `POST /api/org/[id]/handoff`.
 *
 * Everything renders inside one `role="status"` region so a screen reader
 * announces the result when it appears. Empty sections are skipped; when
 * every section is empty, or the API returned its fallback, a plain note is
 * shown instead.
 */

export const HANDOFF_FALLBACK_NOTE =
  "A handoff summary couldn't be written from the timeline yet.";

export type HandoffResult =
  | { kind: "summary"; summary: HandoffSummary }
  | { kind: "fallback" }
  | { kind: "error"; message: string };

function isEmptySummary(s: HandoffSummary): boolean {
  return (
    s.activeRelationships.length === 0 &&
    s.openAsks.length === 0 &&
    s.whatWorked.length === 0 &&
    Object.values(s.contactsByRole).every((names) => names.length === 0)
  );
}

export function HandoffSummaryView({ result }: { result: HandoffResult }) {
  return (
    <div className="mt-3" role="status" aria-live="polite">
      {result.kind === "error" ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {result.message}
        </p>
      ) : result.kind === "fallback" || isEmptySummary(result.summary) ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {HANDOFF_FALLBACK_NOTE}
        </p>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <h3 className="mb-2 text-base font-semibold">Handoff summary</h3>
          <ListSection
            title="Active relationships"
            items={result.summary.activeRelationships}
          />
          <ContactsSection contacts={result.summary.contactsByRole} />
          <ListSection title="Open asks" items={result.summary.openAsks} />
          <ListSection title="What worked" items={result.summary.whatWorked} />
        </div>
      )}
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-3">
      <h4 className="font-medium">{title}</h4>
      <ul className="ml-5 list-disc">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

function ContactsSection({
  contacts,
}: {
  contacts: Record<string, string[]>;
}) {
  const roles = Object.entries(contacts).filter(([, names]) => names.length > 0);
  if (roles.length === 0) return null;
  return (
    <section className="mb-3">
      <h4 className="font-medium">Contacts by role</h4>
      <ul className="ml-5 list-disc">
        {roles.map(([role, names]) => (
          <li key={role}>
            <span className="font-medium">{role}:</span> {names.join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}
