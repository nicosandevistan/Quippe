import type { Ask, AskStatus, HazardClass, Organization } from "@/lib/schemas";

/**
 * Deterministic safety and high-school gating rules (Task 4.1).
 *
 * This module is PURE per structure.md: no I/O, no randomness, no `Date.now()`.
 * It imports only types from `src/lib/schemas`. Every safety, visibility, and
 * eligibility decision is made here by deterministic rules — the AI never
 * decides (Req 14.1, 19.7). The three functions carry Correctness Property 1
 * (hs_safe items never reach a high school club) and Correctness Property 2
 * (pending/rejected asks are hidden from companies).
 *
 * Requirements: 9.1, 14.1, 14.2, 14.3.
 */

/**
 * The configured hazardous-keyword list (Req 14.1).
 *
 * `computeHsSafe` matches an item's text fields against these substrings,
 * case-insensitively, independent of any AI-suggested value. A hit forces
 * `hsSafe` to false even when the hazard class is `none`, so that a benignly
 * classified but dangerous reagent (e.g. mislabeled ethidium bromide) can
 * never reach a high school club. The list is intentionally conservative:
 * marking a borderline-safe item unsafe is the correct bias for minors
 * (design: "conservative on disagreement/unknown"; brief §F7).
 *
 * Each entry is lower-case; matching lower-cases the item text before testing.
 */
export const DEFAULT_HAZARDOUS_KEYWORDS: readonly string[] = [
  // Nucleic-acid stains and mutagens
  "ethidium bromide",
  "etbr",
  "sybr",
  "gelred",
  // Neurotoxic / carcinogenic gel reagents
  "acrylamide",
  "bis-acrylamide",
  "temed",
  // Phenol / chloroform extraction reagents
  "phenol",
  "chloroform",
  "trizol",
  // Generic hazard terms
  "carcinogen",
  "carcinogenic",
  "mutagen",
  "mutagenic",
  "teratogen",
  "teratogenic",
  "toxic",
  "poison",
  "corrosive",
  "flammable",
  "radioactive",
  "biohazard",
  // Common dangerous reagents
  "formaldehyde",
  "formalin",
  "methanol",
  "mercury",
  "cyanide",
  "hydrofluoric",
  "sodium azide",
] as const;

/**
 * The minimal shape `computeHsSafe` evaluates. Accepting a narrow structural
 * type (rather than the full `InventoryItem`) keeps the rule usable both when
 * reviewing AI-normalized rows before they are persisted and when recomputing
 * on an existing item. Only hazard class and text fields participate.
 */
export interface HsSafeInput {
  hazardClass: HazardClass;
  name: string;
  category: string;
  notes?: string;
}

/**
 * Compute the AUTHORITATIVE `hs_safe` value for an inventory item (Req 14.1–14.3).
 *
 * This rule OVERRIDES any AI suggestion. The `aiSuggestedHsSafe` argument is
 * accepted only so the rule can detect disagreement and collapse to `false` —
 * the AI value never decides the outcome on its own. The signature makes this
 * explicit: the rule is computed first, and the AI value can only make the
 * result MORE conservative, never less.
 *
 * The result is `true` only when BOTH of these hold:
 *   - `hazardClass === "none"` (any other class, including `"unknown"` or an
 *     unrecognized value, collapses to `false` — Req 14.3), AND
 *   - no configured hazardous keyword matches the item's text fields.
 *
 * The result collapses to `false` when ANY of these hold:
 *   - the hazard class is missing, `"unknown"`, or unrecognized (Req 14.3),
 *   - the hazard class indicates any hazard (anything other than `"none"`),
 *   - a hazardous keyword matches the name/category/notes (Req 14.1),
 *   - the AI-suggested value disagrees with the rule result (Req 14.2):
 *     if the rule says safe but the AI said unsafe, we trust the conservative
 *     "unsafe"; if the rule says unsafe, the AI can never make it safe.
 *
 * @param item               hazard class + text fields to evaluate
 * @param aiSuggestedHsSafe  the AI's suggestion; used only to detect
 *                           disagreement, never to decide safety
 * @param keywords           the hazardous-keyword list (defaults to
 *                           {@link DEFAULT_HAZARDOUS_KEYWORDS})
 * @returns the authoritative `hsSafe` boolean to persist
 */
export function computeHsSafe(
  item: HsSafeInput,
  aiSuggestedHsSafe: boolean,
  keywords: readonly string[] = DEFAULT_HAZARDOUS_KEYWORDS,
): boolean {
  // Rule 1: hazard class must be exactly "none". Missing, "unknown", or any
  // hazardous class ⇒ false (Req 14.3 and the "anything other than none" rule).
  const hazardClassSafe = item.hazardClass === "none";

  // Rule 2: no hazardous keyword may appear in the item's text fields.
  const haystack = `${item.name} ${item.category} ${item.notes ?? ""}`.toLowerCase();
  const keywordHit = keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));

  // The deterministic rule result, before considering the AI suggestion.
  const ruleHsSafe = hazardClassSafe && !keywordHit;

  // Rule 3: AI/rule disagreement collapses to false (Req 14.2). The rule is
  // authoritative, so the AI value can only pull the result toward false:
  // the final value is true only when the rule says safe AND the AI agreed.
  return ruleHsSafe && aiSuggestedHsSafe;
}

/**
 * Whether an ask may be surfaced to a company (Correctness Property 2, Req 9.2).
 *
 * Asks held for advisor approval (`pending_advisor_approval`) and advisor-
 * rejected asks (`rejected`) are hidden from every company-facing view and
 * query. Every other status is company-visible.
 *
 * @param ask the ask to test
 * @returns `false` for `pending_advisor_approval` and `rejected`, `true` otherwise
 */
export function visibleToCompany(ask: Pick<Ask, "status">): boolean {
  const hidden: readonly AskStatus[] = ["pending_advisor_approval", "rejected"];
  return !hidden.includes(ask.status);
}

/**
 * Gate a confirmed ask into the advisor-approval queue when required (Req 9.1).
 *
 * When an ask is confirmed AND its delivery mode is `in_person` AND the
 * organization is a `high_school_club`, the ask must be held at
 * `pending_advisor_approval` so no company sees it before the advisor reviews
 * it. In every other case the ask is `open`.
 *
 * @param ask the confirmed ask (its delivery mode is read)
 * @param org the ask's organization (its type is read)
 * @returns `pending_advisor_approval` for in-person high-school asks, else `open`
 */
export function gateHighSchoolInPerson(
  ask: Pick<Ask, "deliveryMode">,
  org: Pick<Organization, "type">,
): AskStatus {
  const requiresAdvisor =
    org.type === "high_school_club" && ask.deliveryMode === "in_person";
  return requiresAdvisor ? "pending_advisor_approval" : "open";
}
