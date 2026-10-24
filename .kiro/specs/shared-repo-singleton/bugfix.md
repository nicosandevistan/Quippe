# Bugfix Requirements Document

## Introduction

While Quippe runs under `npm run dev`, data written through one route or page is not visible to other routes or pages. A Club officer signs in, opens `/asks/new`, and composes and confirms 3 asks; each one reports "Submitted and already matched to an offer". The company liaison dashboard (`GET /api/company/co-harborview/dashboard`) and the officer's `/org/org-liss` timeline then show none of the new asks, only seed data. The same loss applies to every write the demo depends on: confirmed asks, accept/decline, advisor approve/reject, created offers and ERGs, and confirmed inventory.

The unit test suite does not catch this because every test file imports the repository module once, in one process, so all routes in a test share one store.

The impact is that the end-to-end demo path (PROJECT_BRIEF section 10) cannot be shown on a running server: each step appears to succeed, but the next step never sees the result.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the repository module is evaluated more than once in the same running server process (a separate route or page bundle, or a re-evaluation after a dev-server recompile) THEN the system creates a new in-memory store from the seed for each evaluation, so writes made through one evaluation are invisible to the others

1.2 WHEN a Club officer confirms asks on `/asks/new` and then the company liaison dashboard for `co-harborview` is requested THEN the system returns only seed asks and omits the newly confirmed asks

1.3 WHEN a Club officer confirms asks on `/asks/new` and then opens `/org/org-liss` THEN the system shows only seed timeline events and omits the `ask` timeline events written for the newly confirmed asks

1.4 WHEN an ask is accepted, declined, approved, or rejected, or an offer, ERG, or inventory item is saved through one route THEN the system does not show that change on other routes or pages that read the same data

1.5 WHEN the dev server recompiles (first visit to a not-yet-compiled page or route, or a file save) THEN the system discards every write made since the server started and serves seed data again

### Expected Behavior (Correct)

2.1 WHEN the repository module is evaluated more than once in the same running server process THEN the system SHALL return the same single repository instance from `getRepo()` on every evaluation, so a write made through any evaluation is readable through every other

2.2 WHEN a Club officer confirms asks on `/asks/new` and then the company liaison dashboard for `co-harborview` is requested THEN the system SHALL include the newly confirmed asks that are visible to that company under the existing visibility rules

2.3 WHEN a Club officer confirms asks on `/asks/new` and then opens `/org/org-liss` THEN the system SHALL show the `ask` timeline events written for the newly confirmed asks

2.4 WHEN an ask is accepted, declined, approved, or rejected, or an offer, ERG, or inventory item is saved through one route THEN the system SHALL show that change on every other route and page that reads the same data

2.5 WHEN the dev server recompiles THEN the system SHALL keep every write made since the server process started, until the process restarts

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `createRepoFromSeed()` is called THEN the system SHALL CONTINUE TO return a new repository with its own fresh copy of the seed data, isolated from the shared repository and from every other `createRepoFromSeed()` result

3.2 WHEN the shared repository is created for the first time in a process THEN the system SHALL CONTINUE TO validate `seed.json` against `SeedSchema` and throw on a malformed seed

3.3 WHEN inventory is read through either the shared repository or a `createRepoFromSeed()` repository THEN the system SHALL CONTINUE TO exclude every item whose expiry is on or before the run date, with and without a company filter

3.4 WHEN the server process restarts THEN the system SHALL CONTINUE TO start from the seed data only (no persistence across restarts)

3.5 WHEN any repository read or write method is called THEN the system SHALL CONTINUE TO return the same results it returns today for the same store contents, through the same `Repo` interface and the same `getRepo()` and `createRepoFromSeed()` signatures

3.6 WHEN the existing unit and property-based test suite runs THEN the system SHALL CONTINUE TO pass every existing test, and `npm run lint` SHALL CONTINUE TO pass
