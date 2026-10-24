/**
 * Ask composer page (Task 24.1; Req 8.1, 8.2, 8.6, 8.7, 8.8).
 *
 * Covers the pure helpers and fetch wrappers in `composer-api.ts` with a stub
 * `fetch` (no network), plus static renders of the composer and an ask card to
 * check the accessibility wiring. Deterministic: no timers, no randomness.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AskCard } from "@/app/asks/new/AskCard";
import { ComposerForm } from "@/app/asks/new/ComposerForm";
import {
  TEXT_MAX,
  composeAsks,
  confirmAsk,
  formValuesFromAsk,
  readAskForm,
  statusMessage,
  toConfirmInput,
  validateComposerText,
  type ConfirmAskInput,
} from "@/app/asks/new/composer-api";
import type { Ask } from "@/lib/schemas";

// Fictional data only.
const draft = {
  id: "ask-draft-1",
  orgId: "org-maple-valley-bio",
  type: "lab_tour",
  groupSize: 18,
  preferredDates: ["2025-03-14"],
  deliveryMode: "in_person",
  topic: "Protein purification",
  needsSupplies: false,
  status: "draft",
} as Ask;

const input: ConfirmAskInput = {
  type: "lab_tour",
  groupSize: 18,
  preferredDates: ["2025-03-14"],
  deliveryMode: "in_person",
  topic: "Protein purification",
  needsSupplies: false,
};

function stubFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>): unknown {
  const init = fetchMock.mock.calls[0][1];
  return JSON.parse(String(init?.body));
}

describe("validateComposerText (Req 8.1, 8.2)", () => {
  it("rejects empty text with the allowed range", () => {
    expect(validateComposerText("")).toMatch(/1 and 5000/);
  });
  it("accepts exactly 5000 characters", () => {
    expect(validateComposerText("a".repeat(TEXT_MAX))).toBeNull();
  });
  it("rejects 5001 characters with the allowed range", () => {
    expect(validateComposerText("a".repeat(TEXT_MAX + 1))).toMatch(/1 and 5000/);
  });
});

describe("composeAsks", () => {
  it("POSTs the text as JSON and returns drafts", async () => {
    const f = stubFetch(200, { ok: true, drafts: [draft] });
    const res = await composeAsks("We need a lab tour", f as typeof fetch);
    expect(res).toEqual({ kind: "drafts", drafts: [draft] });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/asks/compose");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(sentBody(f)).toEqual({ text: "We need a lab tour" });
  });

  it("returns the manual fallback with extracted fields (Req 8.6)", async () => {
    const extracted = [{ topic: "Microscopy", groupSize: 12 }];
    const f = stubFetch(200, {
      ok: false,
      fallback: { kind: "manual_form", extracted },
    });
    const res = await composeAsks("microscopes please", f as typeof fetch);
    expect(res).toEqual({ kind: "manual", extracted });
  });

  it("keeps the text on a 400 length error (Req 8.2)", async () => {
    const f = stubFetch(400, {
      ok: false,
      error: "Enter between 1 and 5000 characters.",
      text: "kept text",
    });
    const res = await composeAsks("kept text", f as typeof fetch);
    expect(res).toEqual({
      kind: "error",
      message: "Enter between 1 and 5000 characters.",
      text: "kept text",
    });
  });

  it("keeps the text when fetch throws", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    });
    const res = await composeAsks("my text", f as unknown as typeof fetch);
    expect(res.kind).toBe("error");
    if (res.kind === "error") expect(res.text).toBe("my text");
  });
});

describe("toConfirmInput", () => {
  it("strips id, orgId and status", () => {
    const out = toConfirmInput(draft);
    expect(out).toEqual(input);
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("orgId");
    expect(out).not.toHaveProperty("status");
  });
});

describe("confirmAsk (Req 8.7, 8.8)", () => {
  it("posts exactly one ask and maps 201 to saved", async () => {
    const saved = { ...draft, id: "ask-saved-1", status: "open" } as Ask;
    const f = stubFetch(201, { ok: true, asks: [saved] });
    const res = await confirmAsk(input, f as typeof fetch);
    expect(res).toEqual({ kind: "saved", ask: saved });
    expect(f.mock.calls[0][0]).toBe("/api/asks/confirm");
    expect(f.mock.calls[0][1]?.method).toBe("POST");
    const body = sentBody(f) as { asks: unknown[] };
    expect(body.asks).toHaveLength(1);
    expect(body.asks[0]).toEqual(input);
  });

  it("maps 400 askErrors to that ask's field errors", async () => {
    const fieldErrors = { groupSize: ["Number must be less than or equal to 500"] };
    const f = stubFetch(400, {
      error: "One or more confirmed asks are invalid.",
      askErrors: [{ index: 0, fieldErrors }],
    });
    const res = await confirmAsk({ ...input, groupSize: 900 }, f as typeof fetch);
    expect(res).toEqual({ kind: "invalid", fieldErrors });
  });
});

describe("statusMessage", () => {
  it("explains an open ask", () => {
    expect(statusMessage("open")).toBe("Submitted. Companies can now see it.");
  });
  it("explains an ask waiting for the advisor", () => {
    expect(statusMessage("pending_advisor_approval")).toBe(
      "Sent to your advisor for approval. Companies won't see it until they approve.",
    );
  });
});

describe("readAskForm", () => {
  it("round-trips a draft into the confirm input", () => {
    expect(readAskForm(formValuesFromAsk(draft))).toEqual({ ok: true, input });
  });
  it("leaves missing manual-form fields empty and reports them", () => {
    const res = readAskForm(formValuesFromAsk({ topic: "Microscopy" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(Object.keys(res.errors).sort()).toEqual(
        ["deliveryMode", "groupSize", "type"].sort(),
      );
    }
  });
});

describe("ComposerForm static render", () => {
  it("labels the textarea, states the 5000 limit, and has a submit button", () => {
    const html = renderToStaticMarkup(<ComposerForm />);
    expect(html).toContain('for="composer-text"');
    expect(html).toMatch(/<textarea[^>]*id="composer-text"/);
    expect(html).toContain('aria-describedby="composer-text-hint"');
    expect(html).toMatch(/id="composer-text-hint"[^>]*>[^<]*5000/);
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).toContain('aria-live="polite"');
  });
});

describe("AskCard static render", () => {
  it("wires a field error and offers its own confirm button", () => {
    const html = renderToStaticMarkup(
      <AskCard
        idPrefix="ask-1"
        title="Ask 1"
        values={formValuesFromAsk(draft)}
        errors={{ groupSize: "Enter a whole number from 1 to 500." }}
        state="editing"
        onChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain('for="ask-1-group-size"');
    expect(html).toMatch(/id="ask-1-group-size"[^>]*/);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="ask-1-group-size-error"');
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Confirm this ask<\/button>/);
    expect(html).toContain("Lab tour");
  });

  it("replaces the button with the status message once saved", () => {
    const html = renderToStaticMarkup(
      <AskCard
        idPrefix="ask-2"
        title="Ask 2"
        values={formValuesFromAsk(draft)}
        state="saved"
        savedMessage={statusMessage("open")}
        onChange={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(html).not.toContain("Confirm this ask");
    expect(html).toContain("Submitted. Companies can now see it.");
  });
});
