"use client";

import { useState } from "react";
import {
  HandoffSummaryView,
  type HandoffResult,
} from "@/components/HandoffSummaryView";

/**
 * "Generate handoff summary" button (Task 23.2, rewired in Task 26.1;
 * Req 3.1, 3.4, 3.5). The server action calls `POST /api/org/[id]/handoff`;
 * the result renders in an announced status region.
 *
 * The server action arrives as a prop from the server page instead of being
 * imported here. Next bundles actions imported by client components into a
 * separate server layer with its own copy of the in-memory repo, so writes
 * made there would not show up on the pages or API routes.
 */

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: HandoffResult };

export function HandoffButton({
  orgId,
  generate,
}: {
  orgId: string;
  generate: (orgId: string) => Promise<HandoffResult>;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run() {
    setState({ phase: "loading" });
    try {
      const result = await generate(orgId);
      setState({ phase: "done", result });
    } catch {
      setState({
        phase: "done",
        result: {
          kind: "error",
          message: "The handoff summary couldn't be made. Please try again.",
        },
      });
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={run}
        disabled={state.phase === "loading"}
        className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {state.phase === "loading" ? "Writing summary…" : "Generate handoff summary"}
      </button>
      {state.phase === "done" ? <HandoffSummaryView result={state.result} /> : null}
    </div>
  );
}
