"use client";

import { useState } from "react";

import { FormField } from "@/components/FormField";

import type { OfferResult } from "./company-types";

/**
 * Create-offer form (Task 25.1, rewired in Task 26.1; Req 4.1, 4.2, 4.6,
 * 7.4). The server action posts to `POST /api/offers`; the route's per-field
 * errors render against their fields. `hasErg` (from `GET /api/offers`)
 * disables the ERG event option when the company has no ERG; the route
 * enforces the same gate.
 *
 * The server action arrives as a prop from the server page instead of being
 * imported here. Next bundles actions imported by client components into a
 * separate server layer with its own copy of the in-memory repo, so writes
 * made there would not show up on the pages or API routes.
 */
export function OfferForm({
  hasErg,
  createOffer,
}: {
  hasErg: boolean;
  createOffer: (formData: FormData) => Promise<OfferResult>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(formData: FormData) {
    setMessage(null);
    const res: OfferResult = await createOffer(formData);
    if (res.ok) {
      setErrors({});
      setDone(true);
    } else {
      setErrors(res.errors);
      setMessage(res.message ?? null);
      setDone(false);
    }
  }

  return (
    <form action={onSubmit} className="max-w-md">
      {message ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="mb-3 text-sm font-medium text-green-800">
          Offer posted.
        </p>
      ) : null}

      <FormField id="offer-type" label="Offer type" required error={errors.type}>
        {(p) => (
          <select
            {...p}
            name="type"
            className="w-full rounded border border-gray-400 px-3 py-2"
          >
            <option value="supplies">Supplies</option>
            <option value="lab_tour">Lab tour</option>
            <option value="speaker">Speaker</option>
            <option value="erg_event" disabled={!hasErg}>
              ERG event{hasErg ? "" : " (create an ERG first)"}
            </option>
          </select>
        )}
      </FormField>

      <FormField
        id="offer-capacity"
        label="Capacity (people)"
        required
        error={errors.capacity}
      >
        {(p) => (
          <input
            {...p}
            name="capacity"
            type="number"
            min={1}
            max={10000}
            defaultValue={20}
            className="w-full rounded border border-gray-400 px-3 py-2"
          />
        )}
      </FormField>

      <FormField
        id="offer-delivery"
        label="Delivery"
        required
        error={errors.deliveryMode}
      >
        {(p) => (
          <select
            {...p}
            name="deliveryMode"
            className="w-full rounded border border-gray-400 px-3 py-2"
          >
            <option value="in_person">In person</option>
            <option value="virtual">Virtual</option>
          </select>
        )}
      </FormField>

      <FormField id="offer-city" label="City" required error={errors.city}>
        {(p) => (
          <input
            {...p}
            name="city"
            type="text"
            className="w-full rounded border border-gray-400 px-3 py-2"
          />
        )}
      </FormField>

      <FormField id="offer-notes" label="Notes" error={errors.notes}>
        {(p) => (
          <textarea
            {...p}
            name="notes"
            rows={3}
            className="w-full rounded border border-gray-400 px-3 py-2"
          />
        )}
      </FormField>

      <button
        type="submit"
        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        Post offer
      </button>
    </form>
  );
}
