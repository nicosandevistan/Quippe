"use client";

import { useState } from "react";
import { FormField } from "@/components/FormField";
import {
  HAZARD_OPTIONS,
  rowsFromCsv,
  UNIT_OPTIONS,
  type ConfirmInventoryResult,
  type NormalizeInventoryResult,
  type ReviewItem,
  type SavedItem,
} from "./company-types";

/**
 * Inventory upload flow (Task 25.1, rewired in Task 26.1; Req 13.1–13.7,
 * 14.1–14.2): paste CSV, review and edit the rows, then confirm to save.
 *
 * "Review" calls `POST /api/inventory/normalize`, which saves nothing and
 * enforces the size and row limits. If the AI can't read the file, the route
 * returns the raw rows and this component shows them as a table to fill in by
 * hand. "Confirm and save" calls `POST /api/inventory/confirm`, which decides
 * whether each item is safe for high school clubs with the safety rules. The
 * saved items, with the server's answer, are listed afterwards.
 *
 * The server action arrives as a prop from the server page instead of being
 * imported here. Next bundles actions imported by client components into a
 * separate server layer with its own copy of the in-memory repo, so writes
 * made there would not show up on the pages or API routes.
 */

const inputClass =
  "w-full rounded border border-gray-400 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";

function newRowId(index: number): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
  return `inv-upload-${random}`;
}

export interface InventoryActions {
  normalize: (csv: string) => Promise<NormalizeInventoryResult>;
  confirm: (items: ReviewItem[]) => Promise<ConfirmInventoryResult>;
}

export function InventoryUpload({ actions }: { actions: InventoryActions }) {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ReviewItem[] | null>(null);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedItem[] | null>(null);

  async function review() {
    setMessage(null);
    setSaved(null);
    setBusy(true);
    try {
      const res = await actions.normalize(csv);
      if (!res.ok) {
        setRows(null);
        setMessage(res.message);
      } else if (res.source === "ai") {
        setManual(false);
        setRows(res.items);
      } else {
        setManual(true);
        setRows(rowsFromCsv(res.csv, newRowId));
      }
    } catch {
      setMessage("The inventory couldn't be read. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!rows) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await actions.confirm(rows);
      if (res.ok) {
        setSaved(res.items);
        setRows(null);
        setCsv("");
      } else {
        setMessage(res.message);
      }
    } catch {
      setMessage("The items couldn't be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, patch: Partial<ReviewItem>) {
    setRows((prev) =>
      prev === null ? prev : prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="max-w-3xl">
      <FormField
        id="inv-csv"
        label="Paste inventory as CSV"
        hint="Columns: name, category, quantity, unit, expiry (YYYY-MM-DD), hazardClass"
      >
        {(p) => (
          <textarea
            {...p}
            rows={6}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className="w-full rounded border border-gray-400 px-3 py-2 font-mono text-sm"
            placeholder="name,category,quantity,unit,expiry,hazardClass"
          />
        )}
      </FormField>
      <button
        type="button"
        onClick={review}
        disabled={busy}
        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        Review
      </button>

      {message ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="mt-3">
        {saved !== null ? (
          <div>
            <p className="text-sm font-medium text-green-800">
              Saved {saved.length} item{saved.length === 1 ? "" : "s"}.
            </p>
            <table className="mt-2 w-full border-collapse text-sm">
              <caption className="sr-only">Saved inventory items</caption>
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th scope="col" className="py-1 pr-3">Name</th>
                  <th scope="col" className="py-1 pr-3">Amount</th>
                  <th scope="col" className="py-1 pr-3">Safe for high school clubs</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((it) => (
                  <tr key={it.id} className="border-b border-gray-200">
                    <td className="py-1 pr-3">{it.name}</td>
                    <td className="py-1 pr-3">
                      {it.quantity} {it.unit}
                    </td>
                    <td className="py-1 pr-3">{it.hsSafe ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {rows ? (
        <div className="mt-4">
          <h3 className="font-medium">Review before saving</h3>
          {manual ? (
            <p className="text-sm text-amber-900">
              We couldn&apos;t read this file automatically. Check each row and
              fix anything that looks wrong.
            </p>
          ) : null}
          <p className="text-sm text-gray-600">
            Nothing is saved until you confirm. Whether an item is safe for high
            school clubs is decided by our safety rules when you save.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Inventory rows to review before saving
              </caption>
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th scope="col" className="py-1 pr-2">Name</th>
                  <th scope="col" className="py-1 pr-2">Category</th>
                  <th scope="col" className="py-1 pr-2">Quantity</th>
                  <th scope="col" className="py-1 pr-2">Unit</th>
                  <th scope="col" className="py-1 pr-2">Expiry</th>
                  <th scope="col" className="py-1 pr-2">Hazard</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-200">
                    <td className="py-1 pr-2">
                      <input
                        aria-label={`Name, row ${i + 1}`}
                        value={r.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        aria-label={`Category, row ${i + 1}`}
                        value={r.category}
                        onChange={(e) => update(i, { category: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        aria-label={`Quantity, row ${i + 1}`}
                        type="number"
                        min={0}
                        value={r.quantity}
                        onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        aria-label={`Unit, row ${i + 1}`}
                        value={r.unit}
                        onChange={(e) =>
                          update(i, { unit: e.target.value as ReviewItem["unit"] })
                        }
                        className={inputClass}
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        aria-label={`Expiry, row ${i + 1}`}
                        value={r.expiry}
                        onChange={(e) => update(i, { expiry: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        aria-label={`Hazard, row ${i + 1}`}
                        value={r.hazardClass}
                        onChange={(e) =>
                          update(i, {
                            hazardClass: e.target.value as ReviewItem["hazardClass"],
                          })
                        }
                        className={inputClass}
                      >
                        {HAZARD_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="mt-3 rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Confirm and save
          </button>
        </div>
      ) : null}
    </div>
  );
}
