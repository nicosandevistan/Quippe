import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard for the structure.md rule "pages never import from lib/data
 * directly; they go through API routes or server actions" (Task 26.1).
 *
 * Every .ts/.tsx file under src/app (except src/app/api/**) and
 * src/components must not import `@/lib/data` or `@/lib/core`, and may only
 * use `import type` from `@/lib/ai`. The API layer is where those modules are
 * called. A second check makes sure the old stand-in session cookie is gone
 * from src/ entirely, so there is one session: the API's `quippe_session`.
 */

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isCode = (f: string) => /\.(ts|tsx)$/.test(f);
const API_DIR = join(SRC, "app", "api") + sep;

const uiFiles = [
  ...walk(join(SRC, "app")).filter((f) => !f.startsWith(API_DIR)),
  ...walk(join(SRC, "components")),
].filter(isCode);

/** Every import/export-from statement in a file, whitespace-collapsed. */
function importStatements(source: string): string[] {
  const re = /(?:^|\n)\s*(import|export)\s[^;]*?from\s*["'][^"']+["']/g;
  const sideEffect = /(?:^|\n)\s*import\s*["'][^"']+["']/g;
  const found = [...source.matchAll(re), ...source.matchAll(sideEffect)];
  return found.map((m) => m[0].replace(/\s+/g, " ").trim());
}

function moduleOf(statement: string): string {
  const m = statement.match(/["']([^"']+)["']\s*$/);
  return m ? m[1] : "";
}

/** Violations of the UI import rules in one file's source. */
function importViolations(source: string): string[] {
  const bad: string[] = [];
  for (const stmt of importStatements(source)) {
    const mod = moduleOf(stmt);
    if (/^@\/lib\/(data|core)(\/|$)/.test(mod)) bad.push(stmt);
    else if (/^@\/lib\/ai(\/|$)/.test(mod) && !/^(import|export) type\s/.test(stmt)) {
      bad.push(stmt);
    }
  }
  // Dynamic imports and requires of the same modules count too.
  const dynamic = /(?:import|require)\(\s*["'](@\/lib\/(?:data|core|ai)[^"']*)["']\s*\)/g;
  for (const m of source.matchAll(dynamic)) bad.push(m[0]);
  return bad;
}

describe("structure rules (structure.md)", () => {
  it("finds UI files to check", () => {
    expect(uiFiles.length).toBeGreaterThan(10);
  });

  it("the import checker catches what it should", () => {
    expect(importViolations('import { getRepo } from "@/lib/data/repo";')).toHaveLength(1);
    expect(importViolations('import { sortTimeline } from "@/lib/core/timeline";')).toHaveLength(1);
    expect(importViolations('import { handoffSummary } from "@/lib/ai";')).toHaveLength(1);
    expect(importViolations('import type { Protocol } from "@/lib/ai";')).toHaveLength(0);
    expect(importViolations('import type { Ask } from "@/lib/schemas";')).toHaveLength(0);
    expect(importViolations('import {\n  x,\n} from "@/lib/data";')).toHaveLength(1);
  });

  it("no page, action, or component imports lib/data or lib/core, or non-type lib/ai", () => {
    const offenders = uiFiles.flatMap((f) =>
      importViolations(readFileSync(f, "utf8")).map(
        (stmt) => `${relative(ROOT, f)}: ${stmt}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("no file under src/ mentions the old stand-in session cookie", () => {
    const legacy = ["quippe", "demo", "account"].join("_");
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|json)$/.test(f))
      .filter((f) => readFileSync(f, "utf8").includes(legacy))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
