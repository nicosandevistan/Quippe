import type { CoverageStatus } from "@/lib/schemas";
import type { CoverageRow } from "./supplies-api";

/**
 * Presentational-only helpers for the supplies page visual refresh
 * (docs/design/supplies.html; see .kiro/steering/design.md).
 *
 * No React, no data access, no network: these only shape data the page
 * ALREADY has (coverage rows + the company-name map) into the pieces the
 * mockup draws — the coverage bar segments, the "Covered by" company initials
 * badge, and the short supplier name. Behaviour, requests, and the coverage
 * data itself are untouched; this module never invents a number.
 */

/**
 * Initials for a company name, matching the mockup's badges ("Harborview
 * Therapeutics" → "HT"). First letters of the first two words, up to two
 * characters, uppercased. Falls back to the first two letters of a single
 * word, or "?" when there is no name to work from.
 */
export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Short, human supplier name for the "Covered by" column, matching the mockup
 * ("Harborview Therapeutics" is shown as "Harborview"). First word only; if
 * the first word is very short (an article-like token), keep the first two.
 */
export function companyShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name.trim();
  const first = words[0]!;
  if (first.length <= 3 && words.length > 1) {
    return `${first} ${words[1]!}`;
  }
  return first;
}

/** The two badge tints the mockup uses, assigned per distinct supplier. */
export type BadgeTint = "ink" | "muted";

/**
 * One coverage-bar segment per coverage row, in row order (Req 11.2). Colour
 * carries status only: a covered or partly-covered item is a filled segment,
 * a missing item is an amber-outlined empty segment. Covered/partial segments
 * also carry a per-supplier tint so the bar echoes the mockup's grouping, but
 * status — not tint — is the signal, and the bar's text alternative names the
 * counts.
 */
export interface BarSegment {
  bomLineId: string;
  status: CoverageStatus;
  /** Supplier tint for a filled segment; undefined for a missing one. */
  tint?: BadgeTint;
  /** Item name, for a per-segment title/tooltip. */
  item: string;
}

/**
 * Assign each distinct supplier (by display name) a stable tint in order of
 * first appearance: the first supplier is `ink`, every later one `muted`,
 * matching the mockup (Harborview dark, Tidepool grey). Missing rows get no
 * tint.
 */
export function barSegments(rows: CoverageRow[]): BarSegment[] {
  const tintBySupplier = new Map<string, BadgeTint>();
  return rows.map((row) => {
    if (row.status === "missing") {
      return { bomLineId: row.bomLineId, status: row.status, item: row.item };
    }
    let tint = tintBySupplier.get(row.from);
    if (tint === undefined) {
      tint = tintBySupplier.size === 0 ? "ink" : "muted";
      tintBySupplier.set(row.from, tint);
    }
    return { bomLineId: row.bomLineId, status: row.status, tint, item: row.item };
  });
}

/** Tailwind classes for a bar segment, keyed by status + tint. */
export function segmentClassName(segment: BarSegment): string {
  const base = "h-2 rounded-[2px]";
  if (segment.status === "missing") {
    // Amber-outlined empty segment: warm colour only, never red.
    return `${base} bg-white ring-[1.5px] ring-inset ring-needed`;
  }
  return `${base} ${segment.tint === "muted" ? "bg-muted" : "bg-ink"}`;
}
