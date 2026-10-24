"use client";
import { useState } from "react";
import {
  HandoffSummaryView,
  type HandoffResult,
} from "@/components/HandoffSummaryView";
/**
 * "Write handoff summary" button (Task 23.2, rewired in Task 26.1;
 * Req 3.1, 3.4, 3.5). The server action calls `POST /api/org/[id]/handoff`;
 * the result renders in an announced status region. Visual refresh to match
 * docs/design/club.html: a full-width secondary button (white fill, ink text,
 * line border, 6px radius, no shadow).
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
    <div>
      <button
        type="button"
        onClick={run}
        disabled={state.phase === "loading"}
        className="h-[34px] w-full rounded-control border border-[#D5D9E0] bg-white px-3.5 text-sm font-semibold text-ink hover:bg-bench focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:opacity-60"
      >
        {state.phase === "loading" ? "Writing summary…" : "Write handoff summary"}
      </button>
      {state.phase === "done" ? (
        <HandoffSummaryView result={state.result} />
      ) : null}
    </div>
  );
}
