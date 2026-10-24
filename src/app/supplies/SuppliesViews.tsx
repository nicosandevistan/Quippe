import type { ReactNode } from "react";
import type { Protocol } from "@/lib/ai";
import type { CoverageStatus } from "@/lib/schemas";
import type { CoverageRow } from "./supplies-api";

/**
 * Presentational pieces of the supplies flow (Task 24.2; Req 11.2, 12.3,
 * 12.6). No state and no data access, so they render the same on the server
 * and in tests (`renderToStaticMarkup`).
 *
 * Accessibility:
 * - The coverage table has a `<caption>` and `<th scope="col">` headers.
 * - Status is a text label; the icon is decorative (`aria-hidden`), so status
 *   never relies on colour alone.
 * - The high-school review notice is a `role="note"` region with the server's
 *   text rendered verbatim.
 */

/** Plain-language typed fallbacks (Req 10.5, 12.4). */
export const BOM_FAILED_MESSAGE =
  "We couldn't draft a supply list for that experiment. Try describing it differently.";
export const PROTOCOL_REJECTED_MESSAGE =
  "We couldn't write a protocol that only uses the matched items, so none is shown. Your coverage report above is still accurate.";

const STATUS_STYLE: Record<CoverageStatus, { icon: string; className: string }> =
  {
    covered: { icon: "✓", className: "bg-green-50 text-green-900" },
    partial: { icon: "◐", className: "bg-amber-50 text-amber-900" },
    missing: { icon: "✕", className: "bg-red-50 text-red-900" },
  };

export function StatusBadge({
  status,
  label,
}: {
  status: CoverageStatus;
  label: string;
}) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${style.className}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {label}
    </span>
  );
}

export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="mb-2 text-left text-sm text-gray-700">
          Each item on your supply list, how much you need, whether a company
          has it, and which company.
        </caption>
        <thead>
          <tr className="border-b border-gray-300">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Item
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Needed
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Status
            </th>
            <th scope="col" className="py-2 font-semibold">
              From
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.bomLineId} className="border-b border-gray-200 align-top">
              <td className="py-2 pr-3">
                <span className="font-medium">{row.item}</span>
                <span className="block text-gray-600">{row.purpose}</span>
              </td>
              <td className="py-2 pr-3">{row.needed}</td>
              <td className="py-2 pr-3">
                <StatusBadge status={row.status} label={row.statusLabel} />
                {row.status === "partial" ? (
                  <span className="block text-gray-700">
                    {row.allocated} available
                  </span>
                ) : null}
              </td>
              <td className="py-2">{row.from}</td>
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
      <h3 id="still-missing-heading" className="font-semibold">
        Still missing
      </h3>
      <p className="text-sm text-gray-700">
        No company has these yet. You will need to find them another way.
      </p>
      <ul className="mt-1 list-disc pl-6">
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
      className="mt-3 rounded-md border-2 border-amber-700 bg-amber-50 p-3 text-amber-950"
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
      <h3 id="protocol-title" className="text-lg font-semibold">
        {protocol.title}
      </h3>
      {protocol.hsReviewRequired ? (
        <HsReviewNotice text={protocol.hsReviewText} />
      ) : null}
      <ol className="mt-3 list-decimal space-y-1 pl-6">
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
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-gray-300 bg-white text-gray-900";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`mt-3 rounded-md border p-3 text-sm ${className}`}>
      {children}
    </div>
  );
}
