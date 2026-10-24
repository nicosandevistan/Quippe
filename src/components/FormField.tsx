import type { ReactNode } from "react";

/**
 * A labeled form field with an accessible error message (Task 22.1; Req 1.4,
 * accessibility cross-cut in design.md).
 *
 * Accessibility:
 * - The `<label>` is tied to the control by a shared `id` (`htmlFor`).
 * - When `error` is set, the control is marked `aria-invalid` and pointed at
 *   the error text with `aria-describedby`, so a screen reader announces the
 *   error WITH the field (design: "validation errors are associated with their
 *   fields for screen readers").
 * - The caller renders the actual control (input/select/textarea) via the
 *   `children` render prop, which receives the `id` and the describedby id so
 *   the wiring is never forgotten.
 *
 * This is presentation only — no data access, no state.
 */
export interface FormFieldProps {
  /** Stable id for the control; label and error are wired to it. */
  id: string;
  /** Visible label text. Always rendered (never placeholder-only). */
  label: string;
  /** Optional hint shown under the label, before the control. */
  hint?: string;
  /** Error message; when present the field is marked invalid. */
  error?: string;
  /** Marks the field required (adds a visible asterisk + `aria-required`). */
  required?: boolean;
  /**
   * Render the control. Receives the props the control MUST spread so the
   * accessibility wiring holds: `id`, `aria-invalid`, `aria-describedby`,
   * `aria-required`.
   */
  children: (controlProps: {
    id: string;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
    "aria-required": boolean | undefined;
  }) => ReactNode;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-red-700">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1 text-sm text-gray-600">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "aria-required": required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
