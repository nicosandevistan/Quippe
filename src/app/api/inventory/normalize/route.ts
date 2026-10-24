import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { normalizeInventory } from "@/lib/ai";

import { requireRole } from "../../_lib/guard";

/**
 * Inventory normalization route for Quippe (Task 20.1; Req 13.1, 13.2, 13.3,
 * 13.4, 13.6, 13.7).
 *
 * `POST /api/inventory/normalize` is the "AI suggests" half of the inventory
 * upload flow. A company liaison uploads a messy CSV; the handler runs it
 * through the `Inventory_Normalizer` and returns an EDITABLE REVIEW SET of
 * structured items for the liaison to inspect. It is the half that persists
 * NOTHING — the liaison later edits and explicitly confirms the review set
 * through `POST /api/inventory/confirm`, and only then is anything saved
 * (Req 13.3, 13.4). This route never calls `saveInventory`, so previously saved
 * inventory is always left unchanged.
 *
 * The handler is ordered so a rejected request never calls the model:
 *
 *   authorize (company liaison) → parse body → enforce ≤10MB / ≤5000 rows
 *   → normalizeInventory (schema + single retry + typed fallback in the AI
 *   wrapper) → return the review set OR the manual-table fallback.
 *
 * Upload limits (Req 13.2): the CSV payload must be at most 10 MB and contain
 * at most 5,000 data rows. An oversize or over-row upload is rejected with a
 * message naming the exact limit that was exceeded; because the limit check
 * runs before any repo access, the previously saved items are left unchanged.
 */

/** Only a company liaison uploads/normalizes inventory (Req 13). */
const ALLOWED_ROLE = "company_liaison" as const;

/** Upload size limit: 10 MB measured over the CSV payload bytes (Req 13.2). */
const MAX_CSV_BYTES = 10 * 1024 * 1024;

/** Upload row limit: at most 5,000 DATA rows, excluding the header (Req 13.2). */
const MAX_DATA_ROWS = 5000;

/**
 * Count the DATA rows in a CSV string (Req 13.2). The first non-empty line is
 * treated as the header and excluded from the data-row count; trailing blank
 * lines are ignored so a file that ends in a newline is not over-counted.
 */
function countDataRows(csv: string): number {
  const lines = csv.split(/\r\n|\r|\n/);
  // Drop a single trailing empty line produced by a terminal newline, and any
  // fully blank lines, so only content rows are counted.
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  // The first non-empty line is the header; everything after it is a data row.
  return nonEmpty.length === 0 ? 0 : nonEmpty.length - 1;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Authorize by role first — a denied request never reaches the model and
  //    touches no data (Req 1.4, 1.5).
  const auth = await requireRole(req, ALLOWED_ROLE);
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const companyId = session.companyId ?? null;
  if (companyId === null) {
    return NextResponse.json(
      { error: "Your account is not associated with a company." },
      { status: 403 },
    );
  }

  // 2) Parse the JSON body carrying the uploaded CSV text under `csv`.
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const csv =
    typeof json === "object" &&
    json !== null &&
    typeof (json as { csv?: unknown }).csv === "string"
      ? (json as { csv: string }).csv
      : null;
  if (csv === null) {
    return NextResponse.json(
      { error: "Provide the uploaded CSV text as a string field named `csv`." },
      { status: 400 },
    );
  }

  // 3) Enforce the upload limits BEFORE any normalization or persistence
  //    (Req 13.2). An oversize/over-row upload is rejected with the exact
  //    limit exceeded; nothing is normalized and no saved item is touched.
  const csvBytes = Buffer.byteLength(csv, "utf8");
  if (csvBytes > MAX_CSV_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `The upload is ${Math.ceil(
          csvBytes / (1024 * 1024),
        )} MB, which exceeds the 10 MB limit. Previously saved inventory was left unchanged.`,
      },
      // 413 Payload Too Large is the precise status for an oversize body.
      { status: 413 },
    );
  }

  const dataRows = countDataRows(csv);
  if (dataRows > MAX_DATA_ROWS) {
    return NextResponse.json(
      {
        ok: false,
        error: `The upload contains ${dataRows} data rows, which exceeds the 5000-row limit. Previously saved inventory was left unchanged.`,
      },
      { status: 413 },
    );
  }

  // 4) Normalize. The AI wrapper validates the output against the
  //    InventoryItem[] schema, retries once with the validation error on
  //    failure, and returns the typed `manual_table` fallback when it cannot
  //    produce valid rows (Req 13.1, 13.6, 13.7). The advisory `hsSafe` on
  //    each returned item is NOT authoritative here — it is overridden by
  //    `computeHsSafe` at confirm time (Req 14.1, 14.2).
  const result = await normalizeInventory({ csv, companyId });

  // 5) Return an EDITABLE REVIEW SET — nothing is persisted here (Req 13.3,
  //    13.4). On the fallback, return the manual-table payload so the UI can
  //    render a manually editable table of the uploaded rows (Req 13.7).
  if (result.ok) {
    return NextResponse.json({ ok: true, review: result.value });
  }
  return NextResponse.json({ ok: false, fallback: result.fallback });
}
