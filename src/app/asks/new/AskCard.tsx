import { FormField } from "@/components/FormField";
import type { DeliveryMode, OfferType } from "@/lib/schemas";

import {
  DELIVERY_MODE_LABEL,
  GROUP_SIZE_MAX,
  GROUP_SIZE_MIN,
  OFFER_TYPE_LABEL,
  type AskFormValues,
  type CardErrors,
} from "./composer-api";

/**
 * One editable ask for review (Task 24.1; Req 8.6, 8.7, 8.8).
 *
 * Presentation only: the parent owns the values and decides what happens on
 * confirm. Each card has its OWN "Confirm this ask" button, and it is a
 * `type="button"` outside any form, so pressing Enter in a field never submits
 * the ask. Only that explicit click does. Once saved, the button is replaced
 * by the plain-language result and the fields are locked.
 *
 * Accessibility: the card is a `<fieldset>` with a `<legend>`, every control
 * is labeled through `FormField` (which also ties errors to their field), and
 * the button has a visible focus ring.
 */

export type AskCardState = "editing" | "saving" | "saved";

export interface AskCardProps {
  /** Unique prefix for control ids, e.g. "ask-1". */
  idPrefix: string;
  /** Visible heading, e.g. "Ask 1". */
  title: string;
  values: AskFormValues;
  errors?: CardErrors;
  /** A message about the whole ask (e.g. the server could not be reached). */
  formError?: string;
  state: AskCardState;
  /** Shown in place of the button after the ask is saved. */
  savedMessage?: string;
  onChange: (values: AskFormValues) => void;
  onConfirm: () => void;
}

const CONTROL =
  "w-full rounded border border-gray-400 bg-white px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:bg-gray-100";

const OFFER_TYPES = Object.keys(OFFER_TYPE_LABEL) as OfferType[];
const DELIVERY_MODES = Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[];

export function AskCard({
  idPrefix,
  title,
  values,
  errors = {},
  formError,
  state,
  savedMessage,
  onChange,
  onConfirm,
}: AskCardProps) {
  const set = <K extends keyof AskFormValues>(key: K, value: AskFormValues[K]) =>
    onChange({ ...values, [key]: value });
  const locked = state !== "editing";

  return (
    <fieldset
      disabled={locked}
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <legend className="px-1 text-lg font-semibold">{title}</legend>

      {formError ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <FormField id={`${idPrefix}-type`} label="Type of help" required error={errors.type}>
        {(p) => (
          <select
            {...p}
            value={values.type}
            onChange={(e) => set("type", e.target.value as AskFormValues["type"])}
            className={CONTROL}
          >
            <option value="">Choose a type</option>
            {OFFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {OFFER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField
        id={`${idPrefix}-topic`}
        label="Topic"
        hint="A few words, like “PCR basics” or “careers in biotech”."
        required
        error={errors.topic}
      >
        {(p) => (
          <input
            {...p}
            type="text"
            value={values.topic}
            onChange={(e) => set("topic", e.target.value)}
            className={CONTROL}
          />
        )}
      </FormField>

      <FormField
        id={`${idPrefix}-group-size`}
        label="Group size (people)"
        hint={`From ${GROUP_SIZE_MIN} to ${GROUP_SIZE_MAX}.`}
        required
        error={errors.groupSize}
      >
        {(p) => (
          <input
            {...p}
            type="number"
            inputMode="numeric"
            min={GROUP_SIZE_MIN}
            max={GROUP_SIZE_MAX}
            step={1}
            value={values.groupSize}
            onChange={(e) => set("groupSize", e.target.value)}
            className={CONTROL}
          />
        )}
      </FormField>

      <FormField
        id={`${idPrefix}-dates`}
        label="Preferred dates"
        hint="Optional. Year-month-day, separated by commas, like 2025-03-14, 2025-03-21."
        error={errors.preferredDates}
      >
        {(p) => (
          <input
            {...p}
            type="text"
            value={values.preferredDates}
            onChange={(e) => set("preferredDates", e.target.value)}
            className={CONTROL}
          />
        )}
      </FormField>

      <FormField
        id={`${idPrefix}-delivery`}
        label="In person or virtual"
        required
        error={errors.deliveryMode}
      >
        {(p) => (
          <select
            {...p}
            value={values.deliveryMode}
            onChange={(e) =>
              set("deliveryMode", e.target.value as AskFormValues["deliveryMode"])
            }
            className={CONTROL}
          >
            <option value="">Choose one</option>
            {DELIVERY_MODES.map((m) => (
              <option key={m} value={m}>
                {DELIVERY_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField
        id={`${idPrefix}-supplies`}
        label="We need lab supplies for this"
        error={errors.needsSupplies}
      >
        {(p) => (
          <input
            {...p}
            type="checkbox"
            checked={values.needsSupplies}
            onChange={(e) => set("needsSupplies", e.target.checked)}
            className="h-5 w-5 rounded border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        )}
      </FormField>

      {state === "saved" ? (
        <p className="text-sm font-medium text-green-800">{savedMessage}</p>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-gray-400"
        >
          {state === "saving" ? "Saving…" : "Confirm this ask"}
        </button>
      )}
    </fieldset>
  );
}
