import { z } from "zod";

import {
  Ask,
  BOM,
  HandoffSummary,
  InventoryItem,
  type CoverageReport,
  type TimelineEvent,
} from "@/lib/schemas";

import {
  composeAsksPrompt,
  generateBomPrompt,
  handoffSummaryPrompt,
  normalizeInventoryPrompt,
  writeProtocolPrompt,
} from "./prompts";
import { run, type AiResult } from "./run";
import { type AiProvider } from "./provider";

/**
 * AI module functions for Quippe (Tasks 13.1 & 13.2; Req 3, 8, 10, 12, 13).
 *
 * Each function builds its prompt, runs it through the wrapper (`run`) with the
 * right output schema and a typed fallback, and — for the id-scoped tasks —
 * supplies the allowed-ID set so the wrapper rejects any out-of-scope reference
 * (CP9). None of these functions decides safety/eligibility/matching: the
 * `hsSafe` coming out of `normalizeInventory` is advisory and is overwritten by
 * the deterministic `computeHsSafe` before anything is persisted (Req 19.7).
 *
 * A `provider` can be injected for tests; omitted, the wrapper uses
 * `getProvider()` (mock unless a live key is set).
 */

// --- composeAsks (Req 8) -------------------------------------------------

export const ComposeAsksOutput = z.array(Ask).min(1).max(20);
export type ComposeAsksOutput = z.infer<typeof ComposeAsksOutput>;

/** Manual-form fallback carrying whatever fields could be extracted (Req 8.6). */
export interface ComposeAsksFallback {
  kind: "manual_form";
  extracted: Partial<z.infer<typeof Ask>>[];
}

export async function composeAsks(
  input: { text: string; orgId: string },
  provider?: AiProvider,
): Promise<AiResult<ComposeAsksOutput, ComposeAsksFallback>> {
  return run<ComposeAsksOutput, ComposeAsksFallback>({
    prompt: composeAsksPrompt(input),
    schema: ComposeAsksOutput,
    fallback: { kind: "manual_form", extracted: [] },
    provider,
    // Composer is bounded at 30s (Req 13.6 / design composer bound).
    timeoutMs: 30_000,
  });
}

// --- generateBom (Req 10) ------------------------------------------------

export interface GenerateBomFallback {
  kind: "bom_failed";
}

export async function generateBom(
  input: { experiment: string; groupSize: number },
  provider?: AiProvider,
): Promise<AiResult<z.infer<typeof BOM>, GenerateBomFallback>> {
  return run<z.infer<typeof BOM>, GenerateBomFallback>({
    prompt: generateBomPrompt(input),
    schema: BOM,
    fallback: { kind: "bom_failed" },
    provider,
  });
}

// --- writeProtocol (Req 12) ----------------------------------------------

/**
 * Protocol output schema. Defined in the AI layer (not `src/lib/schemas`)
 * because it is the shape of an AI writing task's output, consumed only here
 * and by the supplies route. `itemRefs` must be ⊆ the coverage report's item
 * ids (enforced by the wrapper's id-scope guard, CP9); `missingLineIds` must
 * list every BOM line with no coverage (Req 12.3).
 */
export const Protocol = z.object({
  title: z.string().min(1),
  steps: z.array(z.string().min(1)),
  missingLineIds: z.array(z.string()),
  itemRefs: z.array(z.string()),
  hsReviewRequired: z.boolean(),
  hsReviewText: z.string(),
});
export type Protocol = z.infer<typeof Protocol>;

export interface WriteProtocolFallback {
  kind: "protocol_rejected";
  reason: string;
}

export async function writeProtocol(
  coverage: CoverageReport,
  isHighSchool: boolean,
  provider?: AiProvider,
): Promise<AiResult<Protocol, WriteProtocolFallback>> {
  const allowedIds = Array.from(
    new Set(coverage.lines.flatMap((l) => l.itemRefs as string[])),
  );

  const result = await run<Protocol, WriteProtocolFallback>({
    prompt: writeProtocolPrompt({ coverage, isHighSchool }),
    schema: Protocol,
    fallback: {
      kind: "protocol_rejected",
      reason: "protocol validation or id-scope check failed",
    },
    provider,
    allowedIds,
    // Only the inventory item refs are id-scoped; missingLineIds are BOM line
    // ids by construction, not inventory ids.
    extractReferencedIds: (p) => p.itemRefs,
  });

  // Defense in depth for Req 12.3: even a schema-valid protocol must list every
  // missing BOM line. If it does not, fall back rather than show a protocol
  // that silently drops a gap.
  if (result.ok) {
    const requiredMissing = new Set(
      coverage.lines
        .filter((l) => l.status === "missing")
        .map((l) => l.bomLineId as string),
    );
    const listed = new Set(result.value.missingLineIds);
    for (const id of requiredMissing) {
      if (!listed.has(id)) {
        return {
          ok: false,
          fallback: {
            kind: "protocol_rejected",
            reason: `protocol omitted missing BOM line ${id}`,
          },
          reason: `protocol omitted missing BOM line ${id}`,
        };
      }
    }
  }

  return result;
}

// --- handoffSummary (Req 3) ----------------------------------------------

export interface HandoffFallback {
  kind: "handoff_fallback";
}

export async function handoffSummary(
  events: TimelineEvent[],
  provider?: AiProvider,
): Promise<AiResult<z.infer<typeof HandoffSummary>, HandoffFallback>> {
  // No events ⇒ nothing to summarize; return the fallback without calling the
  // model (Req 3.5).
  if (events.length === 0) {
    return { ok: false, fallback: { kind: "handoff_fallback" }, reason: "no timeline events" };
  }

  const allowedIds = Array.from(new Set(events.flatMap((e) => e.refs)));

  return run<z.infer<typeof HandoffSummary>, HandoffFallback>({
    prompt: handoffSummaryPrompt({ events }),
    schema: HandoffSummary,
    fallback: { kind: "handoff_fallback" },
    provider,
    allowedIds,
    extractReferencedIds: (s) => s.referencedIds,
  });
}

// --- normalizeInventory (Req 13) -----------------------------------------

export const NormalizeInventoryOutput = z.array(InventoryItem);
export type NormalizeInventoryOutput = z.infer<typeof NormalizeInventoryOutput>;

export interface NormalizeInventoryFallback {
  kind: "manual_table";
  rows: string;
}

export async function normalizeInventory(
  input: { csv: string; companyId: string },
  provider?: AiProvider,
): Promise<AiResult<NormalizeInventoryOutput, NormalizeInventoryFallback>> {
  return run<NormalizeInventoryOutput, NormalizeInventoryFallback>({
    prompt: normalizeInventoryPrompt(input),
    schema: NormalizeInventoryOutput,
    fallback: { kind: "manual_table", rows: input.csv },
    provider,
  });
}

// --- Re-exports ----------------------------------------------------------
export { run } from "./run";
export type { AiResult, AiOk, AiFallback } from "./run";
export { getProvider, mockProvider } from "./provider";
export type { AiProvider } from "./provider";
