import type { ReactNode } from "react";
import type { Protocol } from "@/lib/ai";
import type { CoverageStatus } from "@/lib/schemas";
import type { CoverageRow } from "./supplies-api";
import {
  type BarSegment,
  barSegments,
  companyInitials,
  companyShortName,
  segmentClassName,
} from "./supplies-display";

/**
 * Presentational pieces of the supplies flow (Task 24.2; Req 11.2, 12.3,
 * 12.6), restyled to docs/design/supplies.html (see .kiro/steering/design.md).
 * No state and no data access, so they render the same on the server and in
 * tests (`renderToStaticMarkup`).
 *
 * Accessibility:
 * - The coverage table has a `<caption>` and `<th scope="col">` headers.
 * - Status is always carried in text (the "Covered by" cell names the supplier
 *   for covered/partial items and reads "Still needed" for missing ones), so
 *   status never relies on colour alone.
 * - The coverage bar is a `role="img"` with an `aria-label` summarising the
 *   counts, so a screen reader hears "8 of 10 items covered, 2 still needed"
 *   rather than ten decorative segments.
 * - The high-school review notice is a `role="note"` region with the server's
 *   text rendered verbatim.
 */

/** Plain-language typed fallbacks (Req 10.5, 12.4). */
export const BOM_FAILED_MESSAGE =
  "We couldn't draft a supply list for that experiment. Try describing it differently.";
export const PROTOCOL_REJECTED_MESSAGE =
  "We couldn't write a protocol that only uses the matched items, so none is shown. Your coverage report above is still accurate.";

const STATUS_STYLE: Record<CoverageStatus, string> = {
  covered: "bg-white text-done ring-1 ring-inset ring-line",
  partial: "bg-needed-bg text-needed",
  missing: "bg-needed-bg text-needed",
};

export function StatusBadge({
  status,
  label,
}: {
  status: CoverageStatus;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-control px-2 py-0.5 text-sm font-medium ${STATUS_STYLE[status]}`}
    >
      {label}
    </span>
  );
}

/**
 * A company initials badge + short name, as in the mockup's "Covered by"
 * column. The badge is decorative (`aria-hidden`); the short name carries the
 * text, so the supplier is never signalled by colour alone.
 */
function CoveredBy({
  company,
  tint,
}: {
  company: string;
  tint: BarSegment["tint"];
}) {
  const badge =
    "flex h-5 w-5 flex-none items-center justify-center rounded-control text-[10px] font-bold text-white " +
    (tint === "muted" ? "bg-muted" : "bg-ink");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={badge} aria-hidden="true">
        {companyInitials(company)}
      </span>
      {companyShortName(company)}
    </span>
  );
}

/**
 * The coverage bar: one segment per item, coloured by status (covered/partial
 * filled, missing amber-outlined). The bar as a whole is a labelled image; the
 * `summary` sentence is its text alternative.
 */
export function CoverageBar({
  rows,
  summary,
}: {
  rows: CoverageRow[];
  summary: string;
}) {
  const segments = barSegments(rows);
  return (
    <div
      role="img"
      aria-label={summary}
      className="grid max-w-[420px] flex-[1_1_280px] gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${segments.length}, 1fr)` }}
    >
      {segments.map((segment) => (
        <span
          key={segment.bomLineId}
          className={segmentClassName(segment)}
          title={segment.item}
        />
      ))}
    </div>
  );
}

export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  const tintByLine = new Map(
    barSegments(rows).map((segment) => [segment.bomLineId, segment.tint]),
  );
  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="px-4 py-2 text-left text-sm text-muted">
          Each item on your supply list, how much you need, and which company
          covers it.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="whitespace-nowrap border-b border-line px-4 py-2.5 text-[13px] font-medium text-muted"
            >
              Item
            </th>
            <th
              scope="col"
              className="whitespace-nowrap border-b border-line px-4 py-2.5 text-[13px] font-medium text-muted"
            >
              Amount
            </th>
            <th
              scope="col"
              className="whitespace-nowrap border-b border-line px-4 py-2.5 text-[13px] font-medium text-muted"
            >
              Covered by
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.bomLineId}
              className={`align-top ${row.status === "missing" ? "bg-needed-bg" : ""}`}
            >
              <td className="border-b border-line px-4 py-2.5 text-graphite">
                <span className="font-medium text-ink">{row.item}</span>
                <span className="block text-muted">{row.purpose}</span>
              </td>
              <td className="whitespace-nowrap border-b border-line px-4 py-2.5 tabular-nums text-graphite">
                {row.needed}
              </td>
              <td className="border-b border-line px-4 py-2.5 text-graphite">
                {row.status === "missing" ? (
                  <span className="text-needed">Still needed. {row.from}</span>
                ) : (
                  <span>
                    <CoveredBy
                      company={row.from}
                      tint={tintByLine.get(row.bomLineId)}
                    />
                    {row.status === "partial" ? (
                      <span className="mt-0.5 block text-muted">
                        Partly covered, {row.allocated} available
                      </span>
                    ) : null}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MissingList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="still-missing-heading" className="mt-4">
      <h3 id="still-missing-heading" className="font-semibold text-ink">
        Still needed
      </h3>
      <p className="text-sm text-muted">
        No company has these yet. You will need to find them another way.
      </p>
      <ul className="mt-1 list-disc pl-6 text-graphite">
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function HsReviewNotice({ text }: { text: string }) {
  return (
    <div
      role="note"
      aria-label="Safety review"
      className="mt-3 rounded-panel border border-needed bg-needed-bg p-3 text-needed"
    >
      <p className="font-semibold">{text}</p>
    </div>
  );
}

export function ProtocolView({
  protocol,
  missingItems,
}: {
  protocol: Protocol;
  missingItems: string[];
}) {
  return (
    <article aria-labelledby="protocol-title">
      <h3 id="protocol-title" className="text-lg font-semibold text-ink">
        {protocol.title}
      </h3>
      {protocol.hsReviewRequired ? (
        <HsReviewNotice text={protocol.hsReviewText} />
      ) : null}
      <ol className="steps mt-3 flex list-decimal flex-col gap-2.5 pl-[22px] text-graphite">
        {protocol.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <MissingList items={missingItems} />
    </article>
  );
}

/** A plain-language message for a fallback or error. */
export function Notice({
  tone,
  children,
}: {
  tone: "info" | "error";
  children: ReactNode;
}) {
  const className =
    tone === "error"
      ? "border-needed bg-needed-bg text-needed"
      : "border-line bg-white text-ink";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mt-3 rounded-panel border p-3 text-sm ${className}`}
    >
      {children}
    </div>
  );
}
