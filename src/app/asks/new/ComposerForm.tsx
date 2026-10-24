"use client";

import { useRef, useState, type FormEvent } from "react";

import { FormField } from "@/components/FormField";
import type { Ask } from "@/lib/schemas";

import { AskCard, type AskCardState } from "./AskCard";
import {
  TEXT_MAX,
  TEXT_MIN,
  cardErrorsFromServer,
  composeAsks,
  confirmAsk,
  formValuesFromAsk,
  readAskForm,
  statusMessage,
  validateComposerText,
  type AskFormValues,
  type CardErrors,
} from "./composer-api";

/**
 * Ask composer (Task 24.1; Req 8.1, 8.2, 8.6, 8.7, 8.8).
 *
 * 1. The officer describes what the group needs in plain words (1..5000
 *    characters). The text is checked here first and again by the server; on
 *    any error the typed text stays in the box (Req 8.2).
 * 2. The composer splits it into asks, shown as editable cards. If it can't,
 *    the same cards appear pre-filled with whatever it could pick out, and
 *    the officer fills in the rest (Req 8.6).
 * 3. Each card is submitted only when its own "Confirm this ask" button is
 *    pressed, one ask per request. Other cards are untouched (Req 8.7, 8.8).
 *
 * Status updates are announced through one `aria-live="polite"` region.
 */

interface CardModel {
  key: number;
  values: AskFormValues;
  errors: CardErrors;
  formError?: string;
  state: AskCardState;
  savedMessage?: string;
}

const TEXT_ID = "composer-text";

export function ComposerForm() {
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [cards, setCards] = useState<CardModel[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const nextKey = useRef(1);

  function makeCards(asks: Partial<Ask>[]): CardModel[] {
    const source = asks.length > 0 ? asks : [{}];
    return source.map((a) => ({
      key: nextKey.current++,
      // `{}` (nothing extracted) yields one empty card.
      values: formValuesFromAsk(a),
      errors: {},
      state: "editing",
    }));
  }

  function updateCard(key: number, patch: Partial<CardModel>) {
    setCards((prev) =>
      prev ? prev.map((c) => (c.key === key ? { ...c, ...patch } : c)) : prev,
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const localError = validateComposerText(text);
    if (localError) {
      setTextError(localError);
      setAnnouncement("");
      return;
    }
    setTextError(undefined);
    setBusy(true);
    setAnnouncement("Reading your description…");
    const result = await composeAsks(text);
    setBusy(false);

    if (result.kind === "error") {
      // Keep what the officer typed (Req 8.2).
      setText(result.text);
      setTextError(result.message);
      setAnnouncement("");
      return;
    }
    if (result.kind === "drafts") {
      setManual(false);
      setCards(makeCards(result.drafts));
      const n = result.drafts.length;
      setAnnouncement(
        `${n} ${n === 1 ? "ask is" : "asks are"} ready to review. Nothing is submitted until you confirm each one.`,
      );
      return;
    }
    setManual(true);
    setCards(makeCards(result.extracted));
    setAnnouncement(
      "We couldn't split that into asks automatically. Fill in the form below.",
    );
  }

  async function onConfirm(card: CardModel, position: number) {
    const checked = readAskForm(card.values);
    if (!checked.ok) {
      updateCard(card.key, { errors: checked.errors, formError: undefined });
      setAnnouncement(`Ask ${position} needs a few fixes before it can be submitted.`);
      return;
    }
    updateCard(card.key, { errors: {}, formError: undefined, state: "saving" });
    const result = await confirmAsk(checked.input);

    if (result.kind === "saved") {
      const message = statusMessage(result.ask.status);
      updateCard(card.key, { state: "saved", savedMessage: message });
      setAnnouncement(`Ask ${position}: ${message}`);
      return;
    }
    if (result.kind === "invalid") {
      const errors = cardErrorsFromServer(result.fieldErrors);
      updateCard(card.key, {
        state: "editing",
        errors,
        formError:
          Object.keys(errors).length === 0
            ? "This ask couldn't be saved. Check the fields and try again."
            : undefined,
      });
      setAnnouncement(`Ask ${position} needs a few fixes before it can be submitted.`);
      return;
    }
    updateCard(card.key, { state: "editing", formError: result.message });
    setAnnouncement(`Ask ${position} wasn't submitted. ${result.message}`);
  }

  return (
    <div>
      <form onSubmit={onSubmit} noValidate className="max-w-2xl">
        <FormField
          id={TEXT_ID}
          label="Describe what your group needs"
          hint={`Write it in your own words. Use ${TEXT_MIN} to ${TEXT_MAX} characters.`}
          required
          error={textError}
        >
          {(p) => (
            <textarea
              {...p}
              name="text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded border border-gray-400 bg-white px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
          )}
        </FormField>
        <p
          className={`-mt-3 mb-4 text-sm ${
            text.length > TEXT_MAX ? "font-medium text-red-700" : "text-gray-600"
          }`}
        >
          {text.length} of {TEXT_MAX} characters
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-gray-400"
        >
          {busy ? "Working…" : "Turn into asks"}
        </button>
      </form>

      <div aria-live="polite" role="status" className="mt-4 text-sm text-gray-800">
        {announcement}
      </div>

      {cards ? (
        <section aria-labelledby="review-heading" className="mt-8">
          <h2 id="review-heading" className="text-xl font-semibold">
            Review your asks
          </h2>
          {manual ? (
            <p className="mt-1 rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
              We couldn&apos;t split that into asks automatically. Fill in the
              form below.
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-600">
              Check each ask and change anything that&apos;s wrong. Nothing is
              submitted until you press &ldquo;Confirm this ask&rdquo; on it.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {cards.map((card, i) => (
              <li key={card.key}>
                <AskCard
                  idPrefix={`ask-${card.key}`}
                  title={`Ask ${i + 1}`}
                  values={card.values}
                  errors={card.errors}
                  formError={card.formError}
                  state={card.state}
                  savedMessage={card.savedMessage}
                  onChange={(values) => updateCard(card.key, { values })}
                  onConfirm={() => onConfirm(card, i + 1)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
