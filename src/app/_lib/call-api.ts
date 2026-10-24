import { cookies } from "next/headers";
import { NextRequest, type NextResponse } from "next/server";

/**
 * In-process API caller for pages and server actions (Task 26.1).
 *
 * SERVER-ONLY. This module reads the incoming request's cookies through
 * `next/headers`, so it must only be imported by server components and server
 * actions, never by a `"use client"` file. (The `server-only` package is not
 * installed in this project, so this comment stands in for that import.)
 *
 * Why this exists: structure.md says pages never import `lib/data`; they go
 * through API routes or server actions. Rather than duplicating role,
 * ownership, and safety checks in the UI, a page or server action imports the
 * real route handler from `@/app/api/...` and calls it through `callApi`:
 *
 *   const res = await callApi(getOrg, { path: `/api/org/${id}`, params: { id } });
 *
 * `callApi` builds a `NextRequest` for `path` (on a placeholder origin, since
 * nothing goes over the network), copies the CURRENT request's cookies onto it
 * so the route's guard sees the same `quippe_session` the browser sent, adds a
 * JSON body and content type when `body` is given, and invokes the handler
 * directly. There is no network hop and no absolute URL to configure, and
 * every role, ownership, and safety decision stays inside the API route.
 *
 * `cookieHeader` defaults to the current request's cookies. Tests pass one
 * explicitly because there is no ambient request outside Next.
 */

/** Placeholder origin for in-process requests. Never contacted. */
const IN_PROCESS_ORIGIN = "http://quippe.local";

export interface CallApiOptions {
  /** HTTP method. Defaults to GET, or POST when a body is given. */
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path of the route, e.g. `/api/org/org-liss`. */
  path: string;
  /** JSON body. Serialized with `JSON.stringify`. */
  body?: unknown;
  /** Dynamic route params, passed to the handler as `{ params }`. */
  params?: Record<string, string>;
  /** Cookie header to send. Defaults to the current request's cookies. */
  cookieHeader?: string;
}

export interface CallApiResult<T> {
  status: number;
  ok: boolean;
  /** Parsed JSON body, or null when the body is empty or not JSON. */
  json: T | null;
  /** The handler's response, e.g. to read `Set-Cookie` via `.cookies`. */
  response: NextResponse;
}

/**
 * Call a route handler in-process with the current request's cookies.
 *
 * The handler's second parameter is typed `never` so any route signature
 * (`(req)` or `(req, { params })`) is accepted; `params` is forwarded as
 * `{ params }` when given.
 */
export async function callApi<T = unknown>(
  handler: (req: NextRequest, ctx: never) => Promise<NextResponse>,
  options: CallApiOptions,
): Promise<CallApiResult<T>> {
  const { path, body, params } = options;
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const cookieHeader = options.cookieHeader ?? cookies().toString();

  const headers = new Headers();
  if (cookieHeader.length > 0) headers.set("cookie", cookieHeader);
  if (body !== undefined) headers.set("content-type", "application/json");

  const req = new NextRequest(new URL(path, IN_PROCESS_ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const ctx = params !== undefined ? { params } : undefined;
  const response = await handler(req, ctx as never);

  let json: T | null = null;
  try {
    json = (await response.clone().json()) as T;
  } catch {
    json = null;
  }

  return { status: response.status, ok: response.ok, json, response };
}

/** Pull the API's `error` text out of a JSON body, with a plain fallback. */
export function apiErrorText(json: unknown, fallback: string): string {
  if (typeof json === "object" && json !== null) {
    const error = (json as { error?: unknown }).error;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
}
