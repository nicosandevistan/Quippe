import type { ReactNode } from "react";

/**
 * A friendly empty-state panel shown when a list has no items (Task 22.1;
 * Req 5.5 and the various "empty-state when none" clauses).
 *
 * Plain language, calm styling, and an optional action slot. Uses a `status`
 * role so assistive tech announces that the area has content but nothing to
 * list.
 */
export interface EmptyStateProps {
  /** Short, plain-language headline, e.g. "No matches yet". */
  title: string;
  /** Optional one-line explanation of why it is empty / what to do. */
  message?: string;
  /** Optional action (e.g. a link or button). */
  action?: ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-700"
    >
      <p className="font-medium">{title}</p>
      {message ? <p className="mt-1 text-sm text-gray-600">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
