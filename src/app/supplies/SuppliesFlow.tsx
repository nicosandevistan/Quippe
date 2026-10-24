"use client";
import { useState, type FormEvent } from "react";
import { FormField } from "@/components/FormField";
import type { Protocol } from "@/lib/ai";
import type { BOM, CoverageReport } from "@/lib/schemas";
import {
  EXPERIMENT_MAX,
  GROUP_MAX,
  GROUP_MIN,
  coverageRows,
  missingItemNames,
  requestBom,
  requestCoverage,
  requestProtocol,
  summarizeCoverage,
  summarySentence,
  validateSuppliesInput,
  type SuppliesFieldErrors,
} from "./supplies-api";
import {
  BOM_FAILED_MESSAGE,
  CoverageBar,
  CoverageTable,
  MissingList,
  Notice,
  PROTOCOL_REJECTED_MESSAGE,
  ProtocolView,
} from "./SuppliesViews";
/**
 * The supplies flow (Task 24.2; Req 10.1, 10.2, 11.2, 12.1, 12.3, 12.5, 12.6):
 *   1. The officer describes an experiment and a group size. Both are checked
 *      here first, then by the server; the entered values always stay in the
 *      form (Req 10.2).
 *   2. When the AI returns a supply list, the page checks company inventory
 *      AUTOMATICALLY (no extra click) and shows the coverage report. If that
 *      check fails, a "Check company inventory again" button retries it.
 *   3. "Write the adapted protocol" asks the AI for a protocol that uses only
 *      the matched items, then shows its steps, the items still missing, and,
 *      for high-school clubs, the server's advisor-review text.
 *
 * Safety rules (hs_safe filtering, id scope, HS review flag) are decided on
 * the server. This component only shows what the server returned.
 *
 * Styling matches docs/design/supplies.html (see .kiro/steering/design.md);
 * the flow, requests, and data are unchanged.
 */
type Busy = null | "bom" | "coverage" | "protocol";
interface CoverageState {
  coverage: CoverageReport;
  companyNames: Record<string, string>;
}
const BUTTON_PRIMARY =
  "inline-flex h-[34px] items-center rounded-control bg-pen px-3.5 text-sm font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:cursor-not-allowed disabled:opacity-60";
export function SuppliesFlow() {
  const [experiment, setExperiment] = useState("");
  const [groupSize, setGroupSize] = useState("");
  const [errors, setErrors] = useState<SuppliesFieldErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [announcement, setAnnouncement] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [bomFailed, setBomFailed] = useState(false);
  const [bom, setBom] = useState<BOM | null>(null);
  const [coverage, setCoverage] = useState<CoverageState | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [protocolRejected, setProtocolRejected] = useState(false);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  function resetResults() {
    setFormError(null);
    setBomFailed(false);
    setBom(null);
    setCoverage(null);
    setCoverageError(null);
    resetProtocol();
  }
  function resetProtocol() {
    setProtocol(null);
    setProtocolRejected(false);
    setProtocolError(null);
  }
  async function checkCoverage(forBom: BOM) {
    setBusy("coverage");
    setCoverageError(null);
    const result = await requestCoverage(forBom);
    setBusy(null);
    if (result.kind === "coverage") {
      setCoverage({
        coverage: result.coverage,
        companyNames: result.companyNames,
      });
      setAnnouncement(
        `Coverage checked. ${summarySentence(summarizeCoverage(result.coverage))}`,
      );
    } else {
      setCoverageError(result.message);
      setAnnouncement("");
    }
  }
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy !== null) return;
    const clientErrors = validateSuppliesInput(experiment, groupSize);
    setErrors(clientErrors);
    if (clientErrors.experiment || clientErrors.groupSize) return;
    resetResults();
    setBusy("bom");
    setAnnouncement("");
    const result = await requestBom(experiment, Number(groupSize.trim()));
    switch (result.kind) {
      case "bom":
        setBom(result.bom);
        setAnnouncement("Supply list ready. Checking company inventory.");
        await checkCoverage(result.bom);
        return;
      case "bom_failed":
        setBusy(null);
        setBomFailed(true);
        return;
      case "invalid":
        setBusy(null);
        setErrors(result.fieldErrors);
        return;
      case "error":
        setBusy(null);
        setFormError(result.message);
        return;
    }
  }
  async function onWriteProtocol() {
    if (busy !== null || coverage === null) return;
    resetProtocol();
    setBusy("protocol");
    setAnnouncement("");
    const result = await requestProtocol(coverage.coverage);
    setBusy(null);
    switch (result.kind) {
      case "protocol":
        setProtocol(result.protocol);
        setAnnouncement("Protocol ready.");
        return;
      case "protocol_rejected":
        setProtocolRejected(true);
        return;
      case "error":
        setProtocolError(result.message);
        return;
    }
  }
  const rows =
    bom !== null && coverage !== null
      ? coverageRows(bom, coverage.coverage, coverage.companyNames)
      : [];
  const missingItems =
    bom !== null && coverage !== null
      ? missingItemNames(bom, coverage.coverage, protocol)
      : [];
  const coverageSentence =
    coverage !== null ? summarySentence(summarizeCoverage(coverage.coverage)) : "";
  return (
    <div className="mt-6">
      {/* Step progress for screen readers. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>
      {/* Step 1: describe the experiment ---------------------------------- */}
      <form onSubmit={onSubmit} noValidate className="max-w-xl">
        <FormField
          id="supplies-experiment"
          label="Describe your experiment"
          hint={`What will your group do? Up to ${EXPERIMENT_MAX} characters.`}
          required
          error={errors.experiment}
        >
          {(p) => (
            <textarea
              {...p}
              name="experiment"
              rows={5}
              value={experiment}
              onChange={(e) => setExperiment(e.target.value)}
              className="w-full rounded-control border border-line px-3 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            />
          )}
        </FormField>
        <FormField
          id="supplies-group-size"
          label="Group size (people)"
          hint={`A whole number from ${GROUP_MIN} to ${GROUP_MAX}.`}
          required
          error={errors.groupSize}
        >
          {(p) => (
            <input
              {...p}
              name="groupSize"
              type="number"
              inputMode="numeric"
              min={GROUP_MIN}
              max={GROUP_MAX}
              step={1}
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
              className="w-32 rounded-control border border-line px-3 py-2 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            />
          )}
        </FormField>
        <button type="submit" disabled={busy !== null} className={BUTTON_PRIMARY}>
          {busy === "bom" ? "Working…" : "Draft supply list"}
        </button>
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        {bomFailed ? <Notice tone="info">{BOM_FAILED_MESSAGE}</Notice> : null}
      </form>
      {/* Step 2: coverage report ----------------------------------------- */}
      {bom !== null ? (
        <section aria-labelledby="coverage-heading" className="mt-8">
          <h2
            id="coverage-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            What companies can supply
          </h2>
          {busy === "coverage" ? (
            <p className="mt-2 text-sm text-muted">
              Working… checking company inventory.
            </p>
          ) : null}
          {coverageError ? (
            <>
              <Notice tone="error">{coverageError}</Notice>
              <button
                type="button"
                onClick={() => void checkCoverage(bom)}
                disabled={busy !== null}
                className={`${BUTTON_PRIMARY} mt-3`}
              >
                Check company inventory again
              </button>
            </>
          ) : null}
          {coverage !== null ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3">
                <p className="text-xl font-semibold tracking-[-0.01em] tabular-nums text-ink">
                  {coverageSentence}
                </p>
                <CoverageBar rows={rows} summary={coverageSentence} />
              </div>
              <div className="mt-4">
                <CoverageTable rows={rows} />
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      {/* Step 3: adapted protocol ---------------------------------------- */}
      {coverage !== null ? (
        <section aria-labelledby="protocol-heading" className="mt-8">
          <h2
            id="protocol-heading"
            className="text-lg font-semibold tracking-[-0.01em] text-ink"
          >
            Adapted protocol
          </h2>
          <p className="mt-1 text-sm text-muted">
            The AI writes steps that use only the items companies have.
          </p>
          <button
            type="button"
            onClick={() => void onWriteProtocol()}
            disabled={busy !== null}
            className={`${BUTTON_PRIMARY} mt-3`}
          >
            {busy === "protocol" ? "Working…" : "Write the adapted protocol"}
          </button>
          {protocolError ? <Notice tone="error">{protocolError}</Notice> : null}
          {protocolRejected ? (
            <>
              <Notice tone="info">{PROTOCOL_REJECTED_MESSAGE}</Notice>
              <MissingList items={missingItems} />
            </>
          ) : null}
          {protocol !== null ? (
            <div className="mt-4 rounded-panel border border-line bg-white p-4">
              <ProtocolView protocol={protocol} missingItems={missingItems} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
