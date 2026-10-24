import type { CoverageReport, TimelineEvent } from "@/lib/schemas";

/**
 * Prompt templates for Quippe's AI layer (Task 11.2; Req 19.1, 19.2).
 *
 * Each exported function returns the full prompt string for one AI task. Per
 * ai-rules.md:
 *   - the model is a TRANSLATOR — it turns free text into schema-valid JSON or
 *     writes prose from records it is handed, and never decides safety,
 *     eligibility, or matching;
 *   - every prompt lists the EXACT records (with IDs) the model may use, so the
 *     wrapper can reject any output that references an unknown ID (CP9);
 *   - structuring tasks demand JSON-only output (no prose around it) so the
 *     wrapper can parse and zod-validate it.
 *
 * These are plain string builders with no side effects. The matching canned
 * responses live in the mock provider (`provider.ts`), keyed off a stable
 * marker each prompt embeds (`[[TASK:...]]`) so the mock can route offline.
 */

/** Stable task markers embedded in every prompt so the mock provider can route. */
export const TASK_MARKERS = {
  composeAsks: "[[TASK:composeAsks]]",
  generateBom: "[[TASK:generateBom]]",
  writeProtocol: "[[TASK:writeProtocol]]",
  handoffSummary: "[[TASK:handoffSummary]]",
  normalizeInventory: "[[TASK:normalizeInventory]]",
} as const;

// --- composeAsks (Req 8) -------------------------------------------------

/**
 * Split an officer's free text into one or more structured asks. The model
 * must return JSON only: an array of Ask-shaped objects. It never submits and
 * never invents an org — the orgId is supplied and must be echoed unchanged.
 */
export function composeAsksPrompt(input: {
  text: string;
  orgId: string;
}): string {
  return [
    TASK_MARKERS.composeAsks,
    "You are a translator. Split the student officer's request into one or more",
    "structured asks. Output JSON ONLY — a JSON array, no prose, no code fence.",
    "Each element must have: id (string), orgId (string), type (one of",
    "supplies|lab_tour|speaker|erg_event), groupSize (integer 1..500),",
    "preferredDates (array of ISO date strings), deliveryMode (in_person|virtual),",
    "topic (non-empty string), needsSupplies (boolean), status (\"draft\").",
    `The ask belongs to organization id "${input.orgId}" — use exactly this`,
    "orgId on every ask. Do not invent any other organization id.",
    "",
    "Officer request:",
    input.text,
  ].join("\n");
}

// --- generateBom (Req 10) ------------------------------------------------

/**
 * Turn an experiment description + group size into a bill of materials. JSON
 * only: an object with a `lines` array. The model invents no inventory — it
 * lists what the experiment needs, which the deterministic matcher then
 * compares to real inventory.
 */
export function generateBomPrompt(input: {
  experiment: string;
  groupSize: number;
}): string {
  return [
    TASK_MARKERS.generateBom,
    "You are a translator. Produce a bill of materials for the experiment below.",
    "Output JSON ONLY — an object { \"lines\": [...] }, no prose, no code fence.",
    "Each line: id (string), item (non-empty), category (non-empty),",
    "quantity (number > 0), unit (one of uL|mL|L|mg|g|unit), purpose (non-empty).",
    "Between 1 and 200 lines. Scale quantities for the stated group size.",
    "",
    `Group size: ${input.groupSize}`,
    "Experiment:",
    input.experiment,
  ].join("\n");
}

// --- writeProtocol (Req 12) ----------------------------------------------

/**
 * Write a protocol adapted to a coverage report. The model may reference ONLY
 * the inventory item IDs that appear in the coverage report, and must list
 * every missing BOM line. The allowed-ID set (coverage item refs) is passed to
 * the wrapper so any out-of-scope reference is rejected (CP9).
 */
export function writeProtocolPrompt(input: {
  coverage: CoverageReport;
  isHighSchool: boolean;
}): string {
  const allowedItemIds = Array.from(
    new Set(input.coverage.lines.flatMap((l) => l.itemRefs as string[])),
  );
  const missingLineIds = input.coverage.lines
    .filter((l) => l.status === "missing")
    .map((l) => l.bomLineId as string);

  return [
    TASK_MARKERS.writeProtocol,
    "You are a translator. Write a step-by-step protocol adapted to the matched",
    "items in the coverage report below. Output JSON ONLY — an object matching:",
    "{ title (string), steps (array of non-empty strings), missingLineIds",
    "(array of BOM line ids with no coverage), itemRefs (array of inventory item",
    "ids you relied on), hsReviewRequired (boolean), hsReviewText (string) }.",
    "You may reference ONLY these inventory item ids:",
    JSON.stringify(allowedItemIds),
    "You MUST list every missing BOM line id:",
    JSON.stringify(missingLineIds),
    input.isHighSchool
      ? 'This is a high school club: set hsReviewRequired true and hsReviewText to "Advisor must review before running".'
      : "This is not a high school club: set hsReviewRequired false and hsReviewText to an empty string.",
    "",
    "Coverage report:",
    JSON.stringify(input.coverage),
  ].join("\n");
}

// --- handoffSummary (Req 3) ----------------------------------------------

/**
 * Write a handoff summary for next year's officers using ONLY the timeline
 * events passed in. The model may reference only IDs that appear in those
 * events' `refs` (CP9). No guessing about contacts or outcomes.
 */
export function handoffSummaryPrompt(input: {
  events: TimelineEvent[];
}): string {
  const allowedIds = Array.from(
    new Set(input.events.flatMap((e) => e.refs)),
  );
  return [
    TASK_MARKERS.handoffSummary,
    "You are a translator. Write a handoff summary for next year's club officers",
    "using ONLY the timeline events below. Output JSON ONLY matching:",
    "{ activeRelationships (string[]), contactsByRole (object of role -> string[]),",
    "openAsks (string[]), whatWorked (string[]), referencedIds (string[]) }.",
    "Every id in referencedIds MUST come from these allowed ids:",
    JSON.stringify(allowedIds),
    "Do not guess contacts or outcomes not present in the events.",
    "",
    "Timeline events:",
    JSON.stringify(input.events),
  ].join("\n");
}

// --- normalizeInventory (Req 13) -----------------------------------------

/**
 * Normalize messy CSV rows into InventoryItem-shaped objects. JSON only: an
 * array of items. Any `hsSafe` the model emits is advisory — the deterministic
 * rule (`computeHsSafe`) overwrites it before anything is persisted.
 */
export function normalizeInventoryPrompt(input: {
  csv: string;
  companyId: string;
}): string {
  return [
    TASK_MARKERS.normalizeInventory,
    "You are a translator. Normalize the CSV rows below into inventory items.",
    "Output JSON ONLY — a JSON array, no prose, no code fence. Each item:",
    "id (string), companyId (string), name (non-empty), category (non-empty),",
    "quantity (number > 0), unit (uL|mL|L|mg|g|unit), expiry (ISO date string),",
    "hazardClass (none|flammable|corrosive|toxic|carcinogen|biohazard|oxidizer|unknown),",
    "hsSafe (boolean — advisory only; the system recomputes it by rule).",
    `Every item's companyId must be exactly "${input.companyId}".`,
    "",
    "CSV rows:",
    input.csv,
  ].join("\n");
}
