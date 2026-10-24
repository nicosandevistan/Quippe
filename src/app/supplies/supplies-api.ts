import type { Protocol } from "@/lib/ai";
import type {
  BOM,
  CoverageLine,
  CoverageReport,
  CoverageStatus,
  Unit,
} from "@/lib/schemas";

/**
 * Pure helpers and fetch wrappers for the supplies page (Task 24.2;
 * Req 10.1, 10.2, 11.2, 12.1, 12.3, 12.5, 12.6).
 *
 * No React here, so every function can be unit-tested with a stub `fetch`.
 * The supplies flow is:
 *   1. `requestBom(experiment, groupSize)` → `POST /api/supplies/bom`: the AI
 *      drafts a BOM (bill of materials), or returns the `bom_failed` fallback.
 *   2. `requestCoverage(bom)` → `POST /api/supplies/coverage`: deterministic
 *      code checks each line against real company inventory. High-school
 *      hs_safe filtering happens on the server; this module never filters.
 *   3. `requestProtocol(coverage)` → `POST /api/supplies/protocol`: the AI
 *      writes a protocol using only the matched items, or returns the
 *      `protocol_rejected` fallback.
 */

/** Input bounds, matching the BOM route (Req 10.1, 10.2). */
export const EXPERIMENT_MIN = 1;
export const EXPERIMENT_MAX = 2000;
export const GROUP_MIN = 1;
export const GROUP_MAX = 500;

/** One plain-language message per form field. */
export interface SuppliesFieldErrors {
  experiment?: string;
  groupSize?: string;
}

const EXPERIMENT_RANGE = `Use ${EXPERIMENT_MIN} to ${EXPERIMENT_MAX} characters.`;
const GROUP_RANGE = `Enter a whole number from ${GROUP_MIN} to ${GROUP_MAX}.`;

/**
 * Check the form before sending it. Returns an empty object when both fields
 * are OK; otherwise each message states the allowed range (Req 10.2).
 */
export function validateSuppliesInput(
  experiment: string,
  groupSizeRaw: string,
): SuppliesFieldErrors {
  const errors: SuppliesFieldErrors = {};

  if (experiment.trim().length < EXPERIMENT_MIN) {
    errors.experiment = `Describe your experiment first. ${EXPERIMENT_RANGE}`;
  } else if (experiment.length > EXPERIMENT_MAX) {
    errors.experiment = `That's ${experiment.length} characters, which is too long. ${EXPERIMENT_RANGE}`;
  }

  const raw = groupSizeRaw.trim();
  const size = Number(raw);
  if (!/^\d+$/.test(raw) || size < GROUP_MIN || size > GROUP_MAX) {
    errors.groupSize = GROUP_RANGE;
  }

  return errors;
}

// --- Fetch wrappers ------------------------------------------------------

export type BomResult =
  | { kind: "bom"; bom: BOM }
  | { kind: "bom_failed" }
  | { kind: "invalid"; fieldErrors: SuppliesFieldErrors }
  | { kind: "error"; message: string };

export type CoverageResult =
  | {
      kind: "coverage";
      coverage: CoverageReport;
      companyNames: Record<string, string>;
    }
  | { kind: "error"; message: string };

export type ProtocolResult =
  | { kind: "protocol"; protocol: Protocol }
  | { kind: "protocol_rejected"; reason: string }
  | { kind: "error"; message: string };

type FetchImpl = typeof fetch;

export const NETWORK_ERROR =
  "We couldn't reach Quippe. Check your connection and try again.";
export const GENERIC_ERROR = "Something went wrong. Please try again.";

function postJson(fetchImpl: FetchImpl, url: string, body: unknown) {
  return fetchImpl(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read a JSON body, or `null` if the response has none / is not JSON. */
async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const json: unknown = await res.json();
    return typeof json === "object" && json !== null
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function errorText(json: Record<string, unknown> | null): string {
  return typeof json?.error === "string" ? json.error : GENERIC_ERROR;
}

/** Join a server field's message list (`string[]`) into one message. */
function joinMessages(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) {
    const text = value.filter((v) => typeof v === "string").join(" ");
    return text || undefined;
  }
  return undefined;
}

/** Ask the AI to draft a BOM for the experiment (Req 10.1, 10.2, 10.5). */
export async function requestBom(
  experiment: string,
  groupSize: number,
  fetchImpl: FetchImpl = fetch,
): Promise<BomResult> {
  let res: Response;
  try {
    res = await postJson(fetchImpl, "/api/supplies/bom", {
      experiment,
      groupSize,
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const json = await readJson(res);

  if (res.status === 400) {
    const raw = json?.fieldErrors as Record<string, unknown> | undefined;
    const fieldErrors: SuppliesFieldErrors = {};
    const exp = joinMessages(raw?.experiment);
    const size = joinMessages(raw?.groupSize);
    if (exp) fieldErrors.experiment = exp;
    if (size) fieldErrors.groupSize = size;
    if (fieldErrors.experiment || fieldErrors.groupSize) {
      return { kind: "invalid", fieldErrors };
    }
    return { kind: "error", message: errorText(json) };
  }

  if (!res.ok) return { kind: "error", message: errorText(json) };

  const bom = json?.bom as BOM | null | undefined;
  if (json?.ok === true && bom && Array.isArray(bom.lines)) {
    return { kind: "bom", bom };
  }
  const fallback = json?.fallback as { kind?: unknown } | undefined;
  if (json?.ok === false && fallback?.kind === "bom_failed") {
    return { kind: "bom_failed" };
  }
  return { kind: "error", message: GENERIC_ERROR };
}

/** Keep only string → string entries from the server's company-name map. */
function readCompanyNames(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const [id, name] of Object.entries(value)) {
    if (typeof name === "string" && name.length > 0) out[id] = name;
  }
  return out;
}

/** Check the BOM against company inventory on the server (Req 11.2). */
export async function requestCoverage(
  bom: BOM,
  fetchImpl: FetchImpl = fetch,
): Promise<CoverageResult> {
  let res: Response;
  try {
    res = await postJson(fetchImpl, "/api/supplies/coverage", { bom });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const json = await readJson(res);
  if (!res.ok) return { kind: "error", message: errorText(json) };

  const coverage = json?.coverage as CoverageReport | undefined;
  if (json?.ok === true && coverage && Array.isArray(coverage.lines)) {
    return {
      kind: "coverage",
      coverage,
      companyNames: readCompanyNames(json.companyNames),
    };
  }
  return { kind: "error", message: GENERIC_ERROR };
}

/** Ask the AI for a protocol that uses only the matched items (Req 12.1–12.4). */
export async function requestProtocol(
  coverage: CoverageReport,
  fetchImpl: FetchImpl = fetch,
): Promise<ProtocolResult> {
  let res: Response;
  try {
    res = await postJson(fetchImpl, "/api/supplies/protocol", { coverage });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const json = await readJson(res);
  if (!res.ok) return { kind: "error", message: errorText(json) };

  const protocol = json?.protocol as Protocol | null | undefined;
  if (json?.ok === true && protocol && Array.isArray(protocol.steps)) {
    return { kind: "protocol", protocol };
  }
  const fallback = json?.fallback as
    | { kind?: unknown; reason?: unknown }
    | undefined;
  if (json?.ok === false && fallback?.kind === "protocol_rejected") {
    const reason = typeof fallback.reason === "string" ? fallback.reason : "";
    return { kind: "protocol_rejected", reason };
  }
  return { kind: "error", message: GENERIC_ERROR };
}

// --- Display helpers -----------------------------------------------------

export interface CoverageSummary {
  covered: number;
  partial: number;
  missing: number;
}

/** Count lines by status. */
export function summarizeCoverage(coverage: CoverageReport): CoverageSummary {
  const summary: CoverageSummary = { covered: 0, partial: 0, missing: 0 };
  for (const line of coverage.lines) summary[line.status] += 1;
  return summary;
}

/** One sentence like "8 of 10 items covered, 1 partly covered, 1 missing." */
export function summarySentence(summary: CoverageSummary): string {
  const total = summary.covered + summary.partial + summary.missing;
  const noun = total === 1 ? "item" : "items";
  return `${summary.covered} of ${total} ${noun} covered, ${summary.partial} partly covered, ${summary.missing} missing.`;
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  covered: "Covered",
  partial: "Partly covered",
  missing: "Missing",
};

/** Text label for a coverage status, so status never relies on colour alone. */
export function statusLabel(status: CoverageStatus): string {
  return STATUS_LABEL[status];
}

const UNIT_LABEL: Record<Unit, string> = {
  uL: "µL",
  mL: "mL",
  L: "L",
  mg: "mg",
  g: "g",
  unit: "unit",
};

/** "10 g", "2.5 mL", "1 unit", "5 units". Rounds to 3 decimal places. */
export function formatQuantity(quantity: number, unit: Unit): string {
  const n = Number.isInteger(quantity)
    ? String(quantity)
    : String(Number(quantity.toFixed(3)));
  if (unit === "unit") return `${n} ${quantity === 1 ? "unit" : "units"}`;
  return `${n} ${UNIT_LABEL[unit] ?? unit}`;
}

export const NO_SUPPLIER = "No company has this";
const UNNAMED_SUPPLIER = "A partner company";

export interface CoverageRow {
  bomLineId: string;
  item: string;
  purpose: string;
  /** Needed amount with unit, e.g. "10 g". */
  needed: string;
  status: CoverageStatus;
  statusLabel: string;
  /** Allocated amount with unit, in the BOM line's unit. */
  allocated: string;
  /** Supplier display name, or "No company has this" for a missing line. */
  from: string;
}

/**
 * Join each BOM line with its coverage line for the table. Rows follow the BOM
 * order. A BOM line the report does not mention is shown as missing (nothing
 * is claimed that the server did not return).
 */
export function coverageRows(
  bom: BOM,
  coverage: CoverageReport,
  companyNames: Record<string, string>,
): CoverageRow[] {
  const byLine = new Map<string, CoverageLine>(
    coverage.lines.map((l) => [l.bomLineId as string, l]),
  );
  return bom.lines.map((line) => {
    const cov = byLine.get(line.id as string);
    const status: CoverageStatus = cov?.status ?? "missing";
    const supplierId = cov?.supplyingCompanyId as string | undefined;
    const from =
      status === "missing" || supplierId === undefined
        ? NO_SUPPLIER
        : (companyNames[supplierId] ?? UNNAMED_SUPPLIER);
    return {
      bomLineId: line.id as string,
      item: line.item,
      purpose: line.purpose,
      needed: formatQuantity(line.quantity, line.unit),
      status,
      statusLabel: statusLabel(status),
      allocated: formatQuantity(cov?.allocated ?? 0, line.unit),
      from,
    };
  });
}

/**
 * Item names still missing, in BOM order: every line the protocol lists in
 * `missingLineIds` plus every line the coverage report marks missing (Req 12.3).
 * Ids that are not BOM lines are ignored rather than shown.
 */
export function missingItemNames(
  bom: BOM,
  coverage: CoverageReport,
  protocol?: Pick<Protocol, "missingLineIds"> | null,
): string[] {
  const ids = new Set<string>(protocol?.missingLineIds ?? []);
  for (const line of coverage.lines) {
    if (line.status === "missing") ids.add(line.bomLineId as string);
  }
  return bom.lines
    .filter((line) => ids.has(line.id as string))
    .map((line) => line.item);
}
