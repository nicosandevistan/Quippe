"use client";

import { useState } from "react";

import type { HandoffSummary } from "@/lib/schemas";

import { generateHandoffAction, HANDOFF_FALLBACK_NOTE } from "./actions";

/**
 * "Generate handoff summary" button (Task 23.2; Req 3.1, 3.4, 3.5).
 *
 * Client component so it can show the result inline after the server action
 * returns. Renders the summary when it has content, or a plain-language
 * "couldn't generate" note when the typed fallback comes back empty (Req 3.5).
 *
 * TODO(api): the action targets a stand-in today; it will call
 * `POST /api/org/[id]/handoff` once Task 16 lands.
 */

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; summary: HandoffSummary };

function isEmpty(s: HandoffSummary): boolean {
  return (
    s.activeRelationships.length === 0 &&
    s.openAsks.length === 0 &&
    s.whatWorked.length === 0 &&
    Object.keys(s.contactsByRole).length === 0
  );
}

export function HandoffButton({ orgId }: { orgId: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run() {
    setState({ phase: "loading" });
    const summary = await generateHandoffAction(orgId);
    setState({ phase: "done", summary });
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={run}
        disabled={state.phase === "loading"}
        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {state.phase === "loading"
          ? "Generating…"
          : "Generate handoff summary"}
      </button>

      {state.phase === "done" ? (
        <div className="mt-3" role="status">
          {isEmpty(state.summary) ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {HANDOFF_FALLBACK_NOTE}
            </p>
          ) : (
            <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
              <HandoffBlock
                title="Active relationships"
                items={state.summary.activeRelationships}
              />
              <HandoffBlock
                title="Open asks"
                items={state.summary.openAsks}
              />
              <HandoffBlock
                title="What worked"
                items={state.summary.whatWorked}
              />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function HandoffBlock({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-2">
      <h3 className="font-medium">{title}</h3>
      <ul className="ml-5 list-disc">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}
