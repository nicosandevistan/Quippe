"use client";

import { useState } from "react";

import { FormField } from "@/components/FormField";

import {
  confirmInventoryAction,
  normalizeInventoryAction,
  type ReviewRow,
} from "./actions";

/**
 * Inventory upload flow (Task 25.1; Req 13.1, 13.3, 13.4, 13.5, 14.2):
 * paste CSV -> editable review table -> confirm to save. Nothing persists
 * until confirm. The `hsSafe` column is shown read-only and labeled as
 * rule-computed, so it is clear the uploader cannot override safety.
 *
 * CSV columns: name,category,quantity,unit,expiry,hazardClass
 */
export function InventoryUpload() {
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  async function review() {
    setMessage(null);
    setSaved(null);
    const res = await normalizeInventoryAction(csv);
    if (res.ok) setRows(res.rows);
    else {
      setRows(null);
      setMessage(res.message);
    }
  }

  async function confirm() {
    if (!rows) return;
    const res = await confirmInventoryAction(rows);
    if (res.ok) {
      setSaved(res.saved);
      setRows(null);
      setCsv("");
    } else {
      setMessage(res.message);
    }
  }

  return (
    <div className="max-w-2xl">
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
            placeholder="P200 tips,plasticware,4800,unit,2029-01-01,none"
          />
        )}
      </FormField>

      <button
        type="button"
        onClick={review}
        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        Review
      </button>

      {message ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}
      {saved !== null ? (
        <p role="status" className="mt-3 text-sm font-medium text-green-800">
          Saved {saved} item{saved === 1 ? "" : "s"}.
        </p>
      ) : null}

      {rows ? (
        <div className="mt-4">
          <h3 className="font-medium">Review before saving</h3>
          <p className="text-sm text-gray-600">
            The “HS-safe” column is set by our safety rules, not by the file.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Inventory rows to review before saving
              </caption>
              <thead>
                <tr className="border-b border-gray-300 text-left">
                  <th scope="col" className="py-1 pr-3">Name</th>
                  <th scope="col" className="py-1 pr-3">Category</th>
                  <th scope="col" className="py-1 pr-3">Qty</th>
                  <th scope="col" className="py-1 pr-3">Unit</th>
                  <th scope="col" className="py-1 pr-3">Expiry</th>
                  <th scope="col" className="py-1 pr-3">Hazard</th>
                  <th scope="col" className="py-1 pr-3">HS-safe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1 pr-3">{r.name}</td>
                    <td className="py-1 pr-3">{r.category}</td>
                    <td className="py-1 pr-3">{r.quantity}</td>
                    <td className="py-1 pr-3">{r.unit}</td>
                    <td className="py-1 pr-3">{r.expiry}</td>
                    <td className="py-1 pr-3">{r.hazardClass}</td>
                    <td className="py-1 pr-3">{r.ruleHsSafe ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={confirm}
            className="mt-3 rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
          >
            Confirm and save
          </button>
        </div>
      ) : null}
    </div>
  );
}
