"use client";

import { useState } from "react";

import { approveAskAction, rejectAskAction } from "./actions";

/**
 * One advisor-queue row with Approve / Reject buttons (Task 25.2; Req 9.5,
 * 9.6). Client component so it can show the outcome inline after the action.
 */
export interface QueueAsk {
  id: string;
  topic: string;
  groupSize: number;
  deliveryMode: string;
  preferredDates: string[];
}

type Row =
  | { phase: "pending" }
  | { phase: "working" }
  | { phase: "done"; label: string };

export function AdvisorQueueRow({ ask }: { ask: QueueAsk }) {
  const [row, setRow] = useState<Row>({ phase: "pending" });

  async function act(kind: "approve" | "reject") {
    setRow({ phase: "working" });
    const res =
      kind === "approve"
        ? await approveAskAction(ask.id)
        : await rejectAskAction(ask.id);
    if (res.ok) {
      setRow({
        phase: "done",
        label: kind === "approve" ? "Approved" : "Rejected",
      });
    } else {
      setRow({ phase: "pending" });
      // Surface the message via an alert region appended below.
      setMessage(res.message);
    }
  }

  const [message, setMessage] = useState<string | null>(null);

  return (
    <li className="rounded-md border border-gray-200 bg-white p-4">
      <p className="font-medium">{ask.topic}</p>
      <p className="mt-1 text-sm text-gray-600">
        Group of {ask.groupSize} · {ask.deliveryMode === "in_person" ? "In person" : "Virtual"}
        {ask.preferredDates.length > 0
          ? ` · Preferred: ${ask.preferredDates.join(", ")}`
          : ""}
      </p>

      {row.phase === "done" ? (
        <p role="status" className="mt-3 text-sm font-medium text-green-800">
          {row.label}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => act("approve")}
            disabled={row.phase === "working"}
            className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => act("reject")}
            disabled={row.phase === "working"}
            className="rounded border border-red-700 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {message ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </li>
  );
}
