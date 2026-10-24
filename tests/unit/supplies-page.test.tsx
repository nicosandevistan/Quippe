/**
 * Unit tests for the supplies page (Task 24.2; Req 10.1, 10.2, 11.2, 12.3,
 * 12.6).
 *
 * - Pure helpers and fetch wrappers in `src/app/supplies/supplies-api.ts`,
 *   exercised with a stub `fetch` (no network).
 * - Presentational views rendered to static HTML (`renderToStaticMarkup`, node
 *   environment, no new deps).
 * - The additive `companyNames` field on `POST /api/supplies/coverage`, called
 *   through the real route handler against the genuine seed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as coverageRoute } from "@/app/api/supplies/coverage/route";
import { SESSION_COOKIE } from "@/app/api/_lib/session";
import type { Protocol } from "@/lib/ai";
import type { BOM, CoverageReport } from "@/lib/schemas";
import {
  GENERIC_ERROR,
  NETWORK_ERROR,
  NO_SUPPLIER,
  coverageRows,
  missingItemNames,
  requestBom,
  requestCoverage,
  requestProtocol,
  statusLabel,
  summarizeCoverage,
  summarySentence,
  validateSuppliesInput,
} from "@/app/supplies/supplies-api";
import {
  BOM_FAILED_MESSAGE,
  CoverageTable,
  ProtocolView,
} from "@/app/supplies/SuppliesViews";

// --- Fixtures ------------------------------------------------------------

type LineId = BOM["lines"][number]["id"];
type CovLine = CoverageReport["lines"][number];

const BOM_FIXTURE: BOM = {
  lines: [
    {
      id: "bom-cov" as LineId,
      item: "agarose powder",
      category: "reagent",
      quantity: 10,
      unit: "g",
      purpose: "cast gels",
    },
    {
      id: "bom-part" as LineId,
      item: "TBE buffer 10x",
      category: "buffer",
      quantity: 999,
      unit: "L",
      purpose: "running buffer",
    },
    {
      id: "bom-miss" as LineId,
      item: "unobtainium widget",
      category: "nonexistent-category",
      quantity: 5,
      unit: "unit",
      purpose: "there is nothing like this in inventory",
    },
  ],
};

const COVERAGE_FIXTURE: CoverageReport = {
  runDate: "2027-01-01",
  lines: [
    {
      bomLineId: "bom-cov" as CovLine["bomLineId"],
      status: "covered",
      needed: 10,
      allocated: 10,
      supplyingCompanyId: "co-harborview" as CovLine["supplyingCompanyId"],
      itemRefs: ["inv-hv-agarose" as CovLine["itemRefs"][number]],
    },
    {
      bomLineId: "bom-part" as CovLine["bomLineId"],
      status: "partial",
      needed: 999,
      allocated: 5,
      supplyingCompanyId: "co-harborview" as CovLine["supplyingCompanyId"],
      itemRefs: ["inv-hv-tbe" as CovLine["itemRefs"][number]],
    },
    {
      bomLineId: "bom-miss" as CovLine["bomLineId"],
      status: "missing",
      needed: 5,
      allocated: 0,
      itemRefs: [],
    },
  ],
};

const NAMES = { "co-harborview": "Harborview Therapeutics" };

const PROTOCOL_FIXTURE: Protocol = {
  title: "Gel electrophoresis with what is available",
  steps: ["Cast a 1% agarose gel.", "Run the gel in TBE buffer."],
  missingLineIds: ["bom-miss"],
  itemRefs: ["inv-hv-agarose"],
  hsReviewRequired: false,
  hsReviewText: "",
};

/** A stub fetch that records its calls and returns a fixed response. */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const throwingFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as typeof fetch;

function expectJsonPost(
  call: { url: string; init: RequestInit },
  url: string,
  body: unknown,
) {
  expect(call.url).toBe(url);
  expect(call.init.method).toBe("POST");
  expect(call.init.credentials).toBe("same-origin");
  expect(
    (call.init.headers as Record<string, string>)["Content-Type"],
  ).toBe("application/json");
  expect(JSON.parse(String(call.init.body))).toEqual(body);
}

// --- validateSuppliesInput (Req 10.2) ------------------------------------

describe("validateSuppliesInput", () => {
  it("rejects an empty or over-length experiment with a range message", () => {
    expect(validateSuppliesInput("", "10").experiment).toMatch(/1 to 2000/);
    expect(validateSuppliesInput("x".repeat(2001), "10").experiment).toMatch(
      /1 to 2000/,
    );
  });

  it("rejects group sizes outside 1–500 or not whole numbers", () => {
    for (const raw of ["0", "501", "2.5", "abc", ""]) {
      const errors = validateSuppliesInput("DNA extraction", raw);
      expect(errors.groupSize, raw).toMatch(/1 to 500/);
      expect(errors.experiment).toBeUndefined();
    }
  });

  it("returns no errors for valid input, including the bounds", () => {
    expect(validateSuppliesInput("DNA extraction", "12")).toEqual({});
    expect(validateSuppliesInput("x".repeat(2000), "1")).toEqual({});
    expect(validateSuppliesInput("x", "500")).toEqual({});
  });
});

// --- Fetch wrappers ------------------------------------------------------

describe("requestBom", () => {
  it("posts experiment + groupSize and returns the BOM", async () => {
    const { impl, calls } = stubFetch(200, { ok: true, bom: BOM_FIXTURE });
    const result = await requestBom("Gel lab", 12, impl);
    expectJsonPost(calls[0], "/api/supplies/bom", {
      experiment: "Gel lab",
      groupSize: 12,
    });
    expect(result).toEqual({ kind: "bom", bom: BOM_FIXTURE });
  });

  it("maps the bom_failed fallback", async () => {
    const { impl } = stubFetch(200, {
      ok: false,
      bom: null,
      fallback: { kind: "bom_failed" },
    });
    expect(await requestBom("Gel lab", 12, impl)).toEqual({
      kind: "bom_failed",
    });
  });

  it("maps a 400 to per-field errors (joined server message lists)", async () => {
    const { impl } = stubFetch(400, {
      error: "Please correct the highlighted fields.",
      fieldErrors: {
        experiment: ["Experiment description must be 1 to 2000 characters."],
        groupSize: ["Group size must be from 1 to 500."],
      },
      values: { experiment: "", groupSize: 0 },
    });
    expect(await requestBom("", 0, impl)).toEqual({
      kind: "invalid",
      fieldErrors: {
        experiment: "Experiment description must be 1 to 2000 characters.",
        groupSize: "Group size must be from 1 to 500.",
      },
    });
  });

  it("returns a retry message when fetch throws, and the server error on 401", async () => {
    expect(await requestBom("Gel lab", 12, throwingFetch)).toEqual({
      kind: "error",
      message: NETWORK_ERROR,
    });
    const { impl } = stubFetch(401, { error: "Not signed in." });
    expect(await requestBom("Gel lab", 12, impl)).toEqual({
      kind: "error",
      message: "Not signed in.",
    });
  });
});

describe("requestCoverage", () => {
  it("posts the BOM and returns coverage + company names", async () => {
    const { impl, calls } = stubFetch(200, {
      ok: true,
      coverage: COVERAGE_FIXTURE,
      companyNames: NAMES,
    });
    const result = await requestCoverage(BOM_FIXTURE, impl);
    expectJsonPost(calls[0], "/api/supplies/coverage", { bom: BOM_FIXTURE });
    expect(result).toEqual({
      kind: "coverage",
      coverage: COVERAGE_FIXTURE,
      companyNames: NAMES,
    });
  });

  it("defaults companyNames to {} and maps errors", async () => {
    const { impl } = stubFetch(200, { ok: true, coverage: COVERAGE_FIXTURE });
    const result = await requestCoverage(BOM_FIXTURE, impl);
    expect(result.kind === "coverage" && result.companyNames).toEqual({});

    expect(await requestCoverage(BOM_FIXTURE, throwingFetch)).toEqual({
      kind: "error",
      message: NETWORK_ERROR,
    });
    const bad = stubFetch(200, { ok: true });
    expect(await requestCoverage(BOM_FIXTURE, bad.impl)).toEqual({
      kind: "error",
      message: GENERIC_ERROR,
    });
  });
});

describe("requestProtocol", () => {
  it("posts the coverage report and returns the protocol", async () => {
    const { impl, calls } = stubFetch(200, {
      ok: true,
      protocol: PROTOCOL_FIXTURE,
    });
    const result = await requestProtocol(COVERAGE_FIXTURE, impl);
    expectJsonPost(calls[0], "/api/supplies/protocol", {
      coverage: COVERAGE_FIXTURE,
    });
    expect(result).toEqual({ kind: "protocol", protocol: PROTOCOL_FIXTURE });
  });

  it("maps the protocol_rejected fallback and a thrown fetch", async () => {
    const { impl } = stubFetch(200, {
      ok: false,
      protocol: null,
      fallback: { kind: "protocol_rejected", reason: "out-of-scope item" },
    });
    expect(await requestProtocol(COVERAGE_FIXTURE, impl)).toEqual({
      kind: "protocol_rejected",
      reason: "out-of-scope item",
    });
    expect(await requestProtocol(COVERAGE_FIXTURE, throwingFetch)).toEqual({
      kind: "error",
      message: NETWORK_ERROR,
    });
  });
});

// --- Display helpers (Req 11.2, 12.3) ------------------------------------

describe("coverage display helpers", () => {
  it("summarizes counts by status", () => {
    const summary = summarizeCoverage(COVERAGE_FIXTURE);
    expect(summary).toEqual({ covered: 1, partial: 1, missing: 1 });
    expect(summarySentence(summary)).toBe(
      "1 of 3 items covered, 1 partly covered, 1 missing.",
    );
  });

  it("labels each status in words", () => {
    expect(statusLabel("covered")).toBe("Covered");
    expect(statusLabel("partial")).toBe("Partly covered");
    expect(statusLabel("missing")).toBe("Missing");
  });

  it("joins BOM lines with coverage and supplier names", () => {
    const rows = coverageRows(BOM_FIXTURE, COVERAGE_FIXTURE, NAMES);
    expect(rows.map((r) => r.item)).toEqual([
      "agarose powder",
      "TBE buffer 10x",
      "unobtainium widget",
    ]);
    expect(rows[0]).toMatchObject({
      needed: "10 g",
      status: "covered",
      statusLabel: "Covered",
      from: "Harborview Therapeutics",
    });
    expect(rows[1]).toMatchObject({
      status: "partial",
      allocated: "5 L",
      from: "Harborview Therapeutics",
    });
    expect(rows[2]).toMatchObject({
      needed: "5 units",
      status: "missing",
      from: NO_SUPPLIER,
    });
    expect(NO_SUPPLIER).toBe("No company has this");
  });

  it("lists missing items by name from the protocol and the report", () => {
    expect(
      missingItemNames(BOM_FIXTURE, COVERAGE_FIXTURE, PROTOCOL_FIXTURE),
    ).toEqual(["unobtainium widget"]);
    // Still listed when there is no protocol (e.g. it was rejected).
    expect(missingItemNames(BOM_FIXTURE, COVERAGE_FIXTURE, null)).toEqual([
      "unobtainium widget",
    ]);
  });
});

// --- Static render of the views ------------------------------------------

describe("supplies views", () => {
  it("renders an accessible coverage table with status text", () => {
    const html = renderToStaticMarkup(
      <CoverageTable
        rows={coverageRows(BOM_FIXTURE, COVERAGE_FIXTURE, NAMES)}
      />,
    );
    expect(html).toContain("<caption");
    for (const header of ["Item", "Needed", "Status", "From"]) {
      expect(html).toContain(`scope="col"`);
      expect(html).toContain(`>${header}</th>`);
    }
    expect(html.match(/scope="col"/g)?.length).toBe(4);
    expect(html).toContain("Covered");
    expect(html).toContain("Partly covered");
    expect(html).toContain("Missing");
    expect(html).toContain("No company has this");
    expect(html).toContain("Harborview Therapeutics");
    // The status icon is decorative; the label carries the meaning.
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the protocol steps and the still-missing list", () => {
    const html = renderToStaticMarkup(
      <ProtocolView
        protocol={PROTOCOL_FIXTURE}
        missingItems={["unobtainium widget"]}
      />,
    );
    expect(html).toContain(PROTOCOL_FIXTURE.title);
    expect(html).toContain("<ol");
    expect(html).toContain("Cast a 1% agarose gel.");
    expect(html).toContain("Still missing");
    expect(html).toContain("unobtainium widget");
    expect(html).not.toContain('role="note"');
  });

  it("renders the server's HS review text verbatim when required", () => {
    const html = renderToStaticMarkup(
      <ProtocolView
        protocol={{
          ...PROTOCOL_FIXTURE,
          hsReviewRequired: true,
          hsReviewText: "Advisor must review before running",
        }}
        missingItems={[]}
      />,
    );
    expect(html).toContain('role="note"');
    expect(html).toContain("Advisor must review before running");
    expect(html).not.toContain("Still missing");
  });

  it("uses plain language for the BOM fallback", () => {
    expect(BOM_FAILED_MESSAGE).toBe(
      "We couldn't draft a supply list for that experiment. Try describing it differently.",
    );
  });
});

// --- Coverage route: companyNames (additive) ------------------------------

describe("POST /api/supplies/coverage companyNames", () => {
  it("maps each supplying company id to its display name", async () => {
    const req = new NextRequest("http://test/api/supplies/coverage", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=acc-officer`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ bom: BOM_FIXTURE }),
    });
    const res = await coverageRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const coverage: CoverageReport = body.coverage;
    const covered = coverage.lines.find((l) => l.bomLineId === "bom-cov");
    expect(covered?.status).toBe("covered");
    expect(covered?.supplyingCompanyId).toBe("co-harborview");
    expect(body.companyNames["co-harborview"]).toBe("Harborview Therapeutics");

    // Only companies that appear in the report are named.
    const supplierIds = new Set(
      coverage.lines.map((l) => l.supplyingCompanyId).filter(Boolean),
    );
    expect(Object.keys(body.companyNames).sort()).toEqual(
      [...supplierIds].sort(),
    );
  });
});
