import type { Ask, AskStatus, DeliveryMode, OfferType } from "@/lib/schemas";

/**
 * Pure helpers and fetch wrappers for the ask composer page (Task 24.1;
 * Req 8.1, 8.2, 8.6, 8.7, 8.8).
 *
 * No React here, so every function can be unit-tested with a stub `fetch`.
 * The composer flow is:
 *   1. `composeAsks(text)` → `POST /api/asks/compose` returns drafts for review
 *      (or the manual-form fallback). Nothing is saved by this call.
 *   2. The officer reviews each draft and presses "Confirm this ask".
 *   3. `confirmAsk(input)` → `POST /api/asks/confirm` with exactly ONE ask, so
 *      an ask the officer did not confirm is never sent (Req 8.7, 8.8).
 */

/** Free-text length bounds, matching the compose route (Req 8.1, 8.2). */
export const TEXT_MIN = 1;
export const TEXT_MAX = 5000;

/** Allowed group size range, matching the Ask schema (Req 8.1). */
export const GROUP_SIZE_MIN = 1;
export const GROUP_SIZE_MAX = 500;

const LENGTH_RANGE = `Enter between ${TEXT_MIN} and ${TEXT_MAX} characters.`;

/**
 * Check the free text before sending it. Returns a plain-language error that
 * states the allowed range, or `null` when the text is OK (Req 8.2).
 */
export function validateComposerText(text: string): string | null {
  if (text.length < TEXT_MIN) {
    return `Describe what your group needs first. ${LENGTH_RANGE}`;
  }
  if (text.length > TEXT_MAX) {
    return `That's ${text.length} characters, which is too long. ${LENGTH_RANGE}`;
  }
  return null;
}

/** The fields the officer confirms: the Ask minus server-owned id/org/status. */
export type ConfirmAskInput = Omit<Ask, "id" | "orgId" | "status">;

/** Per-field error messages as returned by the confirm route (zod flatten). */
export type FieldErrors = Partial<Record<string, string[]>>;

export type ComposeResult =
  | { kind: "drafts"; drafts: Ask[] }
  | { kind: "manual"; extracted: Partial<Ask>[] }
  | { kind: "error"; message: string; text: string };

export type ConfirmResult =
  | { kind: "saved"; ask: Ask }
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | { kind: "error"; message: string };

type FetchImpl = typeof fetch;

const NETWORK_ERROR =
  "We couldn't reach Quippe. Check your connection and try again.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

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

/**
 * Send the free text to the composer. Any failure keeps the officer's text so
 * the page can leave it in the box (Req 8.2).
 */
export async function composeAsks(
  text: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ComposeResult> {
  let res: Response;
  try {
    res = await postJson(fetchImpl, "/api/asks/compose", { text });
  } catch {
    return { kind: "error", message: NETWORK_ERROR, text };
  }
  const json = await readJson(res);

  if (!res.ok) {
    const kept = typeof json?.text === "string" ? json.text : text;
    return { kind: "error", message: errorText(json), text: kept };
  }

  if (json?.ok === true && Array.isArray(json.drafts)) {
    return { kind: "drafts", drafts: json.drafts as Ask[] };
  }

  const fallback = json?.fallback as
    | { kind?: unknown; extracted?: unknown }
    | undefined;
  if (json?.ok === false && fallback?.kind === "manual_form") {
    const extracted = Array.isArray(fallback.extracted)
      ? (fallback.extracted as Partial<Ask>[])
      : [];
    return { kind: "manual", extracted };
  }

  return { kind: "error", message: GENERIC_ERROR, text };
}

const CONFIRM_KEYS = [
  "type",
  "groupSize",
  "preferredDates",
  "deliveryMode",
  "topic",
  "needsSupplies",
] as const satisfies readonly (keyof ConfirmAskInput)[];

/**
 * Keep only the fields the officer confirms. Server-owned `id`, `orgId`, and
 * `status` are dropped (the confirm route sets them), as is anything else.
 * For a partial (manual-form) ask, missing fields stay missing.
 */
export function toConfirmInput(ask: Ask | ConfirmAskInput): ConfirmAskInput;
export function toConfirmInput(ask: Partial<Ask>): Partial<ConfirmAskInput>;
export function toConfirmInput(ask: Partial<Ask>): Partial<ConfirmAskInput> {
  const out: Partial<ConfirmAskInput> = {};
  for (const key of CONFIRM_KEYS) {
    if (ask[key] !== undefined) {
      (out as Record<string, unknown>)[key] = ask[key];
    }
  }
  return out;
}

/**
 * Submit ONE ask the officer explicitly confirmed (Req 8.7, 8.8). The body
 * always carries a single-item list, so pressing confirm on one card can never
 * submit another card's ask.
 */
export async function confirmAsk(
  input: ConfirmAskInput,
  fetchImpl: FetchImpl = fetch,
): Promise<ConfirmResult> {
  let res: Response;
  try {
    res = await postJson(fetchImpl, "/api/asks/confirm", {
      asks: [toConfirmInput(input)],
    });
  } catch {
    return { kind: "error", message: NETWORK_ERROR };
  }
  const json = await readJson(res);

  if (res.ok && json?.ok === true && Array.isArray(json.asks) && json.asks[0]) {
    return { kind: "saved", ask: json.asks[0] as Ask };
  }

  if (res.status === 400 && Array.isArray(json?.askErrors)) {
    const entry = (
      json.askErrors as { index?: unknown; fieldErrors?: FieldErrors }[]
    ).find((e) => e.index === 0);
    if (entry) return { kind: "invalid", fieldErrors: entry.fieldErrors ?? {} };
  }

  return { kind: "error", message: errorText(json) };
}

/** Plain-language result of a confirmed ask, based on the server's status. */
export function statusMessage(status: AskStatus): string {
  switch (status) {
    case "open":
      return "Submitted. Companies can now see it.";
    case "pending_advisor_approval":
      return "Sent to your advisor for approval. Companies won't see it until they approve.";
    case "matched":
      return "Submitted and already matched to an offer.";
    default:
      return "Submitted.";
  }
}

// --- Editable card values ------------------------------------------------

/** Readable labels for ask types (shown in the type select). */
export const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  supplies: "Supplies",
  lab_tour: "Lab tour",
  speaker: "Speaker",
  erg_event: "ERG event",
};

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  in_person: "In person",
  virtual: "Virtual",
};

/**
 * What the officer edits on a card. Kept as strings so a half-typed value
 * (or a field the composer could not extract) can sit in the form.
 */
export interface AskFormValues {
  type: OfferType | "";
  groupSize: string;
  /** Comma-separated dates, e.g. "2025-03-14, 2025-03-21". */
  preferredDates: string;
  deliveryMode: DeliveryMode | "";
  topic: string;
  needsSupplies: boolean;
}

/** Pre-fill a card from a draft or from the fields the composer extracted. */
export function formValuesFromAsk(ask: Partial<Ask>): AskFormValues {
  return {
    type: ask.type ?? "",
    groupSize: ask.groupSize !== undefined ? String(ask.groupSize) : "",
    preferredDates: (ask.preferredDates ?? []).join(", "),
    deliveryMode: ask.deliveryMode ?? "",
    topic: ask.topic ?? "",
    needsSupplies: ask.needsSupplies ?? false,
  };
}

/** A blank card, used when the manual fallback extracted nothing. */
export const EMPTY_FORM: AskFormValues = formValuesFromAsk({});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function splitDates(raw: string): string[] {
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

export type CardErrors = Partial<Record<keyof AskFormValues, string>>;

/**
 * Check a card in plain language and turn it into a confirm input. Errors are
 * keyed by field so each shows next to its control.
 */
export function readAskForm(
  values: AskFormValues,
): { ok: true; input: ConfirmAskInput } | { ok: false; errors: CardErrors } {
  const errors: CardErrors = {};

  if (values.type === "") errors.type = "Choose what kind of help you need.";

  const size = Number(values.groupSize);
  if (
    values.groupSize.trim() === "" ||
    !Number.isInteger(size) ||
    size < GROUP_SIZE_MIN ||
    size > GROUP_SIZE_MAX
  ) {
    errors.groupSize = `Enter a whole number from ${GROUP_SIZE_MIN} to ${GROUP_SIZE_MAX}.`;
  }

  const dates = splitDates(values.preferredDates);
  if (dates.some((d) => !ISO_DATE.test(d))) {
    errors.preferredDates =
      "Write dates as year-month-day, like 2025-03-14, separated by commas.";
  }

  if (values.deliveryMode === "") {
    errors.deliveryMode = "Choose in person or virtual.";
  }

  if (values.topic.trim() === "") errors.topic = "Add a short topic.";

  // The `""` checks repeat the ones above so TypeScript narrows the selects.
  if (
    Object.keys(errors).length > 0 ||
    values.type === "" ||
    values.deliveryMode === ""
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    input: {
      type: values.type,
      groupSize: size,
      preferredDates: dates,
      deliveryMode: values.deliveryMode,
      topic: values.topic.trim(),
      needsSupplies: values.needsSupplies,
    },
  };
}

/** Turn server field errors (lists of messages) into one message per field. */
export function cardErrorsFromServer(fieldErrors: FieldErrors): CardErrors {
  const out: CardErrors = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0 && key in EMPTY_FORM) {
      out[key as keyof AskFormValues] = messages.join(" ");
    }
  }
  return out;
}
