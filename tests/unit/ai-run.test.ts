import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AiProvider } from "@/lib/ai/provider";
import { run } from "@/lib/ai/run";

/**
 * AI wrapper tests (Task 12.2; Req 8.4, 8.6, 10.5, 12.4, 13.7, 19.4, 19.5,
 * 19.6).
 *
 * These use STUB providers (not the mock) so each case controls exactly what
 * text comes back on attempt 1 and attempt 2, and asserts:
 *   - invalid-then-valid: exactly one retry, whose prompt carries the
 *     validation error (Req 8.4 / 19.4), and the corrected value is returned;
 *   - invalid-twice: the typed fallback is returned (Req 19.5);
 *   - unknown-id: the id-scope guard rejects and the fallback is returned,
 *     even though the payload is schema-valid (CP9, Req 19.6).
 */

const Thing = z.object({ value: z.number() });
type Thing = z.infer<typeof Thing>;

const FALLBACK = { kind: "fallback" as const };

/** A provider that returns scripted responses in order and records prompts. */
function scriptedProvider(responses: string[]): {
  provider: AiProvider;
  prompts: string[];
} {
  const prompts: string[] = [];
  let i = 0;
  const provider: AiProvider = {
    async complete({ prompt }) {
      prompts.push(prompt);
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    },
  };
  return { provider, prompts };
}

describe("AI wrapper run()", () => {
  it("retries exactly once with the validation error, then succeeds", async () => {
    const { provider, prompts } = scriptedProvider([
      "{ not json at all",
      JSON.stringify({ value: 42 }),
    ]);

    const result = await run<Thing, typeof FALLBACK>({
      prompt: "base prompt",
      schema: Thing,
      fallback: FALLBACK,
      provider,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ value: 42 });
    // Exactly two attempts: original + one retry.
    expect(prompts).toHaveLength(2);
    // The retry prompt includes the validation error text.
    expect(prompts[1]).toContain("was rejected");
    expect(prompts[1]).toContain("base prompt");
  });

  it("returns the typed fallback when invalid twice", async () => {
    const { provider, prompts } = scriptedProvider([
      JSON.stringify({ value: "not a number" }),
      JSON.stringify({ value: "still not a number" }),
    ]);

    const result = await run<Thing, typeof FALLBACK>({
      prompt: "base prompt",
      schema: Thing,
      fallback: FALLBACK,
      provider,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback).toEqual(FALLBACK);
      expect(result.reason).toContain("schema validation failed");
    }
    // Stopped after exactly one retry — no third attempt.
    expect(prompts).toHaveLength(2);
  });

  it("rejects a schema-valid payload that references an unknown id (CP9)", async () => {
    const Ref = z.object({ ids: z.array(z.string()) });
    type Ref = z.infer<typeof Ref>;

    // Both attempts return the same out-of-scope id; schema-valid but the
    // id-scope guard must reject it.
    const { provider, prompts } = scriptedProvider([
      JSON.stringify({ ids: ["allowed-1", "ROGUE-ID"] }),
    ]);

    const result = await run<Ref, typeof FALLBACK>({
      prompt: "base prompt",
      schema: Ref,
      fallback: FALLBACK,
      provider,
      allowedIds: ["allowed-1", "allowed-2"],
      extractReferencedIds: (v) => v.ids,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback).toEqual(FALLBACK);
      expect(result.reason).toContain("CP9");
    }
    // One retry was attempted (id-scope failure triggers the retry path too).
    expect(prompts).toHaveLength(2);
  });

  it("accepts a schema-valid payload whose ids are all in scope (CP9 happy path)", async () => {
    const Ref = z.object({ ids: z.array(z.string()) });
    type Ref = z.infer<typeof Ref>;

    const { provider } = scriptedProvider([
      JSON.stringify({ ids: ["allowed-1"] }),
    ]);

    const result = await run<Ref, typeof FALLBACK>({
      prompt: "base prompt",
      schema: Ref,
      fallback: FALLBACK,
      provider,
      allowedIds: ["allowed-1", "allowed-2"],
      extractReferencedIds: (v) => v.ids,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.ids).toEqual(["allowed-1"]);
  });

  it("returns the fallback when the provider throws", async () => {
    const provider: AiProvider = {
      async complete() {
        throw new Error("provider exploded");
      },
    };

    const result = await run<Thing, typeof FALLBACK>({
      prompt: "base prompt",
      schema: Thing,
      fallback: FALLBACK,
      provider,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fallback).toEqual(FALLBACK);
  });
});
