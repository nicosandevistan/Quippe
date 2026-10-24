/**
 * Seed validator (Task 10.3; Req 19.3).
 *
 * Validates `src/lib/data/seed.json` against the shared zod schemas and fails
 * with per-field errors if the seed drifts from the schemas. Wired to
 * `npm run seed:check` (package.json) and intended for the Kiro save-hook on
 * `src/lib/schemas/**` so the seed can never silently diverge from the model.
 *
 * Beyond pure schema validation it checks the demo fixtures the brief requires
 * (Req 17.6, 17.7): exactly one account per role, at least three hazardous and
 * two expired inventory items, and roughly six timeline events for the college
 * club so the handoff summary has history to work with.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Role } from "../src/lib/schemas";
import { SeedSchema } from "../src/lib/data/repo";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, "../src/lib/data/seed.json");

function fail(message: string, detail?: unknown): never {
  console.error(`seed:check FAILED — ${message}`);
  if (detail !== undefined) console.error(detail);
  process.exit(1);
}

function main(): void {
  let raw: string;
  try {
    raw = readFileSync(seedPath, "utf8");
  } catch (err) {
    fail(`could not read ${seedPath}`, err);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    fail("seed.json is not valid JSON", err);
  }

  // 1. Schema validation with per-field errors.
  const parsed = SeedSchema.safeParse(json);
  if (!parsed.success) {
    console.error("seed:check FAILED — schema validation errors:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exit(1);
  }
  const seed = parsed.data;

  // 2. Referential integrity — every id a row points at must exist.
  const errors: string[] = [];
  const ids = {
    org: new Set(seed.organizations.map((o) => o.id)),
    company: new Set(seed.companies.map((c) => c.id)),
    erg: new Set(seed.ergs.map((e) => e.id)),
    account: new Set(seed.accounts.map((a) => a.id)),
    offer: new Set(seed.offers.map((o) => o.id)),
  };

  for (const a of seed.accounts) {
    if (a.orgId && !ids.org.has(a.orgId)) {
      errors.push(`account ${a.id} references missing org ${a.orgId}`);
    }
    if (a.companyId && !ids.company.has(a.companyId)) {
      errors.push(`account ${a.id} references missing company ${a.companyId}`);
    }
  }
  for (const e of seed.ergs) {
    if (!ids.company.has(e.companyId)) {
      errors.push(`erg ${e.id} references missing company ${e.companyId}`);
    }
  }
  for (const o of seed.offers) {
    if (!ids.company.has(o.companyId)) {
      errors.push(`offer ${o.id} references missing company ${o.companyId}`);
    }
    if (o.type === "erg_event" && (!o.ergId || !ids.erg.has(o.ergId))) {
      errors.push(`erg_event offer ${o.id} must reference an existing erg`);
    }
  }
  for (const ask of seed.asks) {
    if (!ids.org.has(ask.orgId)) {
      errors.push(`ask ${ask.id} references missing org ${ask.orgId}`);
    }
  }
  for (const item of seed.inventory) {
    if (!ids.company.has(item.companyId)) {
      errors.push(
        `inventory ${item.id} references missing company ${item.companyId}`,
      );
    }
  }

  // 3. Required demo fixtures (Req 17.6, 17.7).
  const roles = Role.options;
  for (const role of roles) {
    const count = seed.accounts.filter((a) => a.role === role).length;
    if (count < 1) errors.push(`no demo account for role ${role}`);
  }

  const hazardous = seed.inventory.filter(
    (i) => i.hazardClass !== "none" && i.hazardClass !== "unknown",
  ).length;
  if (hazardous < 3) {
    errors.push(`expected ≥3 hazardous inventory items, found ${hazardous}`);
  }

  // Two expired items relative to today (a demo fixture, not a seed invariant).
  const today = new Date().toISOString().slice(0, 10);
  const expired = seed.inventory.filter((i) => i.expiry <= today).length;
  if (expired < 2) {
    errors.push(`expected ≥2 expired inventory items, found ${expired}`);
  }

  const collegeClubEvents = seed.timeline.filter(
    (e) => e.orgId === "org-liss",
  ).length;
  if (collegeClubEvents < 5) {
    errors.push(
      `expected ~6 timeline events for the college club, found ${collegeClubEvents}`,
    );
  }

  if (errors.length > 0) {
    console.error("seed:check FAILED — fixture errors:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  console.log(
    `seed:check OK — ${seed.organizations.length} orgs, ${seed.companies.length} companies, ` +
      `${seed.ergs.length} ergs, ${seed.offers.length} offers, ${seed.inventory.length} inventory items ` +
      `(${hazardous} hazardous, ${expired} expired), ${seed.timeline.length} timeline events, ` +
      `${seed.accounts.length} accounts.`,
  );
}

main();
