import { TASK_MARKERS } from "./prompts";

/**
 * AI provider interface and implementations for Quippe (Task 11.1; Req 19.1,
 * 19.2).
 *
 * A provider turns a prompt into raw text — JSON for structuring tasks, prose
 * for writing tasks. The wrapper (`run.ts`) is the only caller; it parses and
 * zod-validates whatever text comes back.
 *
 * Two implementations:
 *   - `mockProvider` matches the prompt to a canned, schema-valid response. It
 *     needs no network and no secret, is the DEFAULT when no live key is set,
 *     is used in every test, and is the offline demo backup (tech.md).
 *   - `liveProvider` dispatches to Amazon Bedrock or the Anthropic API by the
 *     `AI_PROVIDER` / `AI_MODEL` env vars plus the provider key.
 *
 * `getProvider()` returns the mock UNLESS a live key is configured, so the app
 * runs end to end with zero secrets.
 */

export interface AiProvider {
  /** Return raw completion text (JSON for structuring, prose for writing). */
  complete(input: { prompt: string; maxTokens?: number }): Promise<string>;
}

// --- Mock provider -------------------------------------------------------

/**
 * Canned, schema-valid responses keyed by the task marker each prompt embeds.
 *
 * These are deliberately minimal but VALID against the output schema for each
 * task, so the wrapper's happy path succeeds offline. Ids used here are generic
 * placeholders for the structuring tasks (composeAsks/generateBom/
 * normalizeInventory); the id-scoped tasks (writeProtocol/handoffSummary) echo
 * only ids the prompt declared as allowed, which the mock extracts from the
 * prompt so it never fabricates an out-of-scope id.
 */

/** Pull the JSON array printed after a label in a prompt, e.g. allowed ids. */
function extractJsonArrayAfter(prompt: string, label: string): string[] {
  const idx = prompt.indexOf(label);
  if (idx === -1) return [];
  const rest = prompt.slice(idx + label.length);
  const start = rest.indexOf("[");
  if (start === -1) return [];
  const end = rest.indexOf("]", start);
  if (end === -1) return [];
  try {
    const parsed = JSON.parse(rest.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Echo the orgId the composeAsks prompt declared, so the ask is in-scope. */
function extractQuoted(prompt: string, before: string): string | null {
  const idx = prompt.indexOf(before);
  if (idx === -1) return null;
  const rest = prompt.slice(idx + before.length);
  const m = rest.match(/"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Canned composer output that follows the demo script (PROJECT_BRIEF.md
 * section 10, step 3; Task 26.1 approved fix 3): the officer's message splits
 * into a supplies ask, a lab tour ask, and an ERG meetup ask for a 25-person
 * club. Dates line up with the seeded Harborview offers so the matching core
 * (not this mock) can find them. The orgId is echoed from the prompt so every
 * ask stays in scope; status is always "draft" (the server decides the real
 * status on confirm).
 */
function mockComposeAsks(prompt: string): string {
  const orgId = extractQuoted(prompt, "belongs to organization id") ?? "org-1";
  return JSON.stringify([
    {
      id: "ask-mock-1",
      orgId,
      type: "supplies",
      groupSize: 25,
      preferredDates: ["2027-02-01"],
      deliveryMode: "in_person",
      topic: "DNA extraction and gel electrophoresis workshop supplies",
      needsSupplies: true,
      status: "draft",
    },
    {
      id: "ask-mock-2",
      orgId,
      type: "lab_tour",
      groupSize: 25,
      preferredDates: ["2027-02-10"],
      deliveryMode: "in_person",
      topic: "Visit a working biotech lab",
      needsSupplies: false,
      status: "draft",
    },
    {
      id: "ask-mock-3",
      orgId,
      type: "erg_event",
      groupSize: 25,
      preferredDates: ["2027-02-20"],
      deliveryMode: "in_person",
      topic: "Meet Latino and first-generation professionals in industry",
      needsSupplies: false,
      status: "draft",
    },
  ]);
}

/** One canned BOM line: [item, category, quantity, unit, purpose]. */
type MockBomRow = [string, string, number, string, string];

/**
 * Canned BOM for a DNA extraction + gel electrophoresis workshop (demo step 4;
 * Task 26.1 approved fix 3). Against the seed inventory the deterministic
 * coverage core marks 8 lines covered across Harborview and Tidepool and 2
 * missing (dish soap: no detergent in stock; meat tenderizer: the only enzyme
 * in stock is expired). For a high school club the ethidium bromide line is
 * also missing, because every stain in stock is hs-unsafe. Those outcomes come
 * from the core; this mock only supplies the list.
 */
const MOCK_BOM_ROWS: readonly MockBomRow[] = [
  ["Agarose powder", "reagent", 15, "g", "cast gels"],
  ["TBE buffer 10x", "buffer", 2, "L", "running buffer"],
  ["1 kb DNA ladder", "reagent", 100, "uL", "size reference"],
  ["Gel loading dye", "reagent", 2, "mL", "load samples"],
  ["P1000 pipette tips", "plasticware", 300, "unit", "liquid handling"],
  ["0.2 mL PCR tubes", "plasticware", 50, "unit", "hold samples"],
  ["Nitrile gloves", "ppe", 50, "unit", "hand protection"],
  ["Ethidium bromide DNA stain", "stain", 1, "mL", "see DNA bands"],
  ["Dish soap", "detergent", 50, "mL", "break open cells"],
  ["Meat tenderizer (protease)", "enzyme", 5, "g", "remove proteins"],
];

function mockGenerateBom(): string {
  return JSON.stringify({
    lines: MOCK_BOM_ROWS.map(([item, category, quantity, unit, purpose], i) => ({
      id: `bom-mock-${i + 1}`,
      item,
      category,
      quantity,
      unit,
      purpose,
    })),
  });
}

function mockWriteProtocol(prompt: string): string {
  const allowedItemIds = extractJsonArrayAfter(
    prompt,
    "You may reference ONLY these inventory item ids:",
  );
  const missingLineIds = extractJsonArrayAfter(
    prompt,
    "You MUST list every missing BOM line id:",
  );
  const isHs = prompt.includes("This is a high school club");
  return JSON.stringify({
    title: "Adapted protocol",
    steps: [
      "Gather the matched materials.",
      "Follow standard safety precautions.",
      "Run the experiment as adapted to the available quantities.",
    ],
    missingLineIds,
    itemRefs: allowedItemIds,
    hsReviewRequired: isHs,
    hsReviewText: isHs ? "Advisor must review before running" : "",
  });
}

function mockHandoffSummary(prompt: string): string {
  const allowedIds = extractJsonArrayAfter(
    prompt,
    "Every id in referencedIds MUST come from these allowed ids:",
  );
  return JSON.stringify({
    activeRelationships: allowedIds.length
      ? ["Ongoing relationship from past events"]
      : [],
    contactsByRole: {},
    openAsks: [],
    whatWorked: allowedIds.length ? ["Past supply pickups succeeded"] : [],
    referencedIds: allowedIds,
  });
}

function mockNormalizeInventory(prompt: string): string {
  const companyId = extractQuoted(prompt, "companyId must be exactly") ?? "co-1";
  return JSON.stringify([
    {
      id: "inv-mock-1",
      companyId,
      name: "pipette tips",
      category: "plasticware",
      quantity: 500,
      unit: "unit",
      expiry: "2029-01-01",
      hazardClass: "none",
      hsSafe: true,
    },
  ]);
}

export const mockProvider: AiProvider = {
  async complete({ prompt }: { prompt: string; maxTokens?: number }) {
    if (prompt.includes(TASK_MARKERS.composeAsks)) return mockComposeAsks(prompt);
    if (prompt.includes(TASK_MARKERS.generateBom)) return mockGenerateBom();
    if (prompt.includes(TASK_MARKERS.writeProtocol)) {
      return mockWriteProtocol(prompt);
    }
    if (prompt.includes(TASK_MARKERS.handoffSummary)) {
      return mockHandoffSummary(prompt);
    }
    if (prompt.includes(TASK_MARKERS.normalizeInventory)) {
      return mockNormalizeInventory(prompt);
    }
    // Unknown prompt: return empty JSON so the wrapper's validation fails
    // deterministically and the typed fallback is returned.
    return "{}";
  },
};

// --- Live provider -------------------------------------------------------

/**
 * Live provider dispatching to Bedrock or Anthropic by env. Implemented as a
 * thin stub that reads the configured provider/model/key — the MVP runs on the
 * mock, so the actual network call is left as the single integration point a
 * team member fills in when a key is available. It throws clearly if invoked
 * without the necessary configuration so a misconfiguration never silently
 * produces empty output.
 */
export function liveProvider(): AiProvider {
  const providerName = process.env.AI_PROVIDER;
  const model = process.env.AI_MODEL;
  return {
    async complete() {
      throw new Error(
        `liveProvider not implemented in the MVP (AI_PROVIDER=${providerName ?? "unset"}, ` +
          `AI_MODEL=${model ?? "unset"}); the app defaults to the mock provider. ` +
          "Wire the Bedrock/Anthropic call here when a key is configured.",
      );
    },
  };
}

// --- Selection -----------------------------------------------------------

/**
 * True when a live model key is configured in the environment. We check the
 * common provider keys; absent all of them, the app uses the mock provider so
 * it runs with zero secrets (Req 19.2).
 */
export function hasLiveKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AI_PROVIDER === "bedrock" &&
        process.env.AWS_ACCESS_KEY_ID),
  );
}

/**
 * Return the provider to use. Mock unless a live key is configured (Req 19.2).
 */
export function getProvider(): AiProvider {
  return hasLiveKey() ? liveProvider() : mockProvider;
}
