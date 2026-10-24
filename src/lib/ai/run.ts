import type { z } from "zod";

import { validateReferencedIds } from "@/lib/core/refs";

import { getProvider, type AiProvider } from "./provider";

/**
 * The single AI enforcement point for Quippe (Task 12.1; Req 8.4, 8.5, 10.4,
 * 12.4, 13.6, 19.3, 19.4, 19.5, 19.6; CP9).
 *
 * Every AI call in the app goes through `run`. It:
 *   1. calls the provider's `complete`,
 *   2. parses the text as JSON and validates it with the given zod schema,
 *   3. on failure, retries EXACTLY ONCE with the validation error appended to
 *      the prompt (Req 8.4, 19.4),
 *   4. when an allowed-ID set is supplied, runs `validateReferencedIds` to
 *      reject any output that cites an id it was never given (CP9, Req 19.6),
 *   5. returns a typed FALLBACK the UI can render when validation ultimately
 *      fails (Req 19.5).
 *
 * No AI output ever drives a safety/eligibility/matching decision on its own
 * (Req 19.7); callers that must trust a value (e.g. `hsSafe`) recompute it with
 * the deterministic core after `run` returns.
 */

/** A successful, schema-valid, in-scope result. */
export interface AiOk<T> {
  ok: true;
  value: T;
}

/** A typed fallback — validation (or the id-scope check) ultimately failed. */
export interface AiFallback<F> {
  ok: false;
  fallback: F;
  /** Why it failed, for logging/telemetry (never shown raw to end users). */
  reason: string;
}

export type AiResult<T, F> = AiOk<T> | AiFallback<F>;

export interface RunOptions<T, F> {
  /** The prompt to send (built by a `prompts/*.ts` template). */
  prompt: string;
  /** The zod schema the output must satisfy. */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** The typed fallback returned when validation ultimately fails. */
  fallback: F;
  /**
   * Optional id-scope guard: when supplied, every id returned by
   * `extractReferencedIds(value)` must be present in `allowedIds`, else the
   * result is rejected and the fallback returned (CP9).
   */
  allowedIds?: Iterable<string>;
  extractReferencedIds?: (value: T) => Iterable<string>;
  /** Provider override (tests inject stubs); defaults to `getProvider()`. */
  provider?: AiProvider;
  /** Max tokens hint passed through to the provider. */
  maxTokens?: number;
  /**
   * Optional wall-clock bound in ms for the whole run (Req 13.6 composer 30s).
   * When exceeded the fallback is returned.
   */
  timeoutMs?: number;
}

/** Parse + schema-validate one completion; returns the value or an error string. */
function parseAndValidate<T>(
  text: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `output was not valid JSON: ${(err as Error).message}`,
    };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `schema validation failed: ${issues}` };
  }
  return { ok: true, value: parsed.data };
}

/** Race a promise against an optional timeout. */
async function withTimeout<R>(
  p: Promise<R>,
  timeoutMs: number | undefined,
): Promise<R> {
  if (timeoutMs === undefined) return p;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`AI call exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Run one AI task with schema validation, a single retry, the id-scope guard,
 * and a typed fallback.
 */
export async function run<T, F>(
  opts: RunOptions<T, F>,
): Promise<AiResult<T, F>> {
  const provider = opts.provider ?? getProvider();

  const attempt = async (prompt: string): Promise<string> =>
    withTimeout(
      provider.complete({ prompt, maxTokens: opts.maxTokens }),
      opts.timeoutMs,
    );

  // --- Attempt 1 --------------------------------------------------------
  let firstError: string;
  try {
    const text = await attempt(opts.prompt);
    const result = parseAndValidate(text, opts.schema);
    if (result.ok) {
      const scoped = checkIdScope(result.value, opts);
      if (scoped.ok) return { ok: true, value: result.value };
      firstError = scoped.error;
    } else {
      firstError = result.error;
    }
  } catch (err) {
    firstError = (err as Error).message;
  }

  // --- Attempt 2 (exactly one retry, with the error appended) -----------
  // Req 8.4 / 19.4: the retry prompt includes the validation error so the
  // model can correct itself.
  const retryPrompt = `${opts.prompt}\n\nYour previous response was rejected: ${firstError}\nReturn corrected JSON only.`;
  try {
    const text = await attempt(retryPrompt);
    const result = parseAndValidate(text, opts.schema);
    if (result.ok) {
      const scoped = checkIdScope(result.value, opts);
      if (scoped.ok) return { ok: true, value: result.value };
      return { ok: false, fallback: opts.fallback, reason: scoped.error };
    }
    return { ok: false, fallback: opts.fallback, reason: result.error };
  } catch (err) {
    return {
      ok: false,
      fallback: opts.fallback,
      reason: (err as Error).message,
    };
  }
}

/** Run the optional id-scope guard (CP9). No guard supplied ⇒ always ok. */
function checkIdScope<T, F>(
  value: T,
  opts: RunOptions<T, F>,
): { ok: true } | { ok: false; error: string } {
  if (opts.allowedIds === undefined || opts.extractReferencedIds === undefined) {
    return { ok: true };
  }
  const referenced = opts.extractReferencedIds(value);
  if (validateReferencedIds(referenced, opts.allowedIds)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "output referenced one or more ids outside the allowed set (CP9)",
  };
}
