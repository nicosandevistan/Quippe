# Implementation Plan: Quippe MVP

## Overview

This plan builds Quippe bottom-up along the enforced dependency boundaries from the design: schemas → core (pure) → data (repo + seed) → ai (provider/prompts/mock + wrapper) → api routes → pages/components. The deterministic core and its nine property tests are front-loaded because they carry every safety, eligibility, and matching guarantee; the AI layer is only a schema-validated translator with retry-then-fallback. All work is TypeScript (`strict: true`) with Vitest + fast-check, and every AI path is tested against the mock provider so no network or secret is needed.

Tasks marked with `*` are optional (tests and non-core-demo polish) and can be skipped for a faster MVP, but they encode the correctness guarantees and are strongly recommended.

## Tasks

- [x] 1. Scaffold the project and tooling
  - Initialize a Next.js 14+ App Router project with TypeScript in `strict: true` mode at the repo root, keeping `.kiro/`, `PROJECT_BRIEF.md`, `README.md`, and `docs/` intact
  - Add Tailwind CSS and a minimal global stylesheet; no component library
  - Add dependencies: `zod`, `vitest`, `fast-check`, and TypeScript/ESLint tooling; configure `vitest.config.ts` to pick up `tests/unit` and `tests/properties`
  - Create the directory skeleton exactly per structure.md: `src/lib/schemas`, `src/lib/core`, `src/lib/data`, `src/lib/ai/prompts`, `src/app/api`, `src/app/login`, `src/app/org/[id]`, `src/app/asks/new`, `src/app/supplies`, `src/app/company/[id]`, `src/app/advisor`, `src/components`, `tests/unit`, `tests/properties`
  - Add npm scripts: `dev` (next dev), `test` (vitest run), `lint` (next lint + tsc --noEmit), `seed:check` (run the seed validator), plus `.env.example` documenting `AI_PROVIDER`, `AI_MODEL`, and the provider key; do not commit `.env`; never add `.kiro/` to `.gitignore`
  - _Requirements: 19.1, 19.2_

- [x] 2. Define zod schemas and enums (leaf layer)
  - [x] 2.1 Define enums and branded IDs
    - Create `src/lib/schemas/enums.ts` with `OrgType`, `OfferType`, `AskStatus` (including `rejected`), `DeliveryMode`, `HazardClass` (including `none`/`unknown`), `Unit` (`uL`,`mL`,`L`,`mg`,`g`,`unit`), `CoverageStatus`, and `Role`
    - Define branded ID string types (`OrgId`, `CompanyId`, `ErgId`, `OfferId`, `AskId`, `ItemId`, `EventId`, `BomLineId`, `AccountId`) so the ID-scope validator compares sets without mixing namespaces
    - _Requirements: 4.1, 4.2, 8.1, 9.5, 11.5, 14.3_

  - [x] 2.2 Define entity schemas
    - Create `src/lib/schemas/index.ts` exporting zod schemas (with `z.infer` types) for `Organization`, `Company`, `Erg`, `Offer`, `Ask`, `Match`, `InventoryItem`, `TimelineEvent`, `BomLine`, `BOM`, `CoverageLine`, `CoverageReport`, `HandoffSummary`, `Account`
    - Encode field bounds: Offer capacity int 1..10000, minAge int 0..25 when present, notes ≤ 2000; Erg name 1..120, description 1..2000, topics 1..20, capacityPerSemester int 1..10000; Ask groupSize 1..500; BOM 1..200 lines with non-empty item/category/unit/purpose and quantity > 0; refine `advisorAccountId` required when `type === "high_school_club"`
    - Ensure no student personal-identity field exists anywhere in the model
    - _Requirements: 2.1, 4.5, 4.6, 7.1, 7.2, 7.7, 8.1, 10.1, 17.4_

  - [x]* 2.3 Write unit tests for schema boundaries
    - Test accept/reject at edges: offer capacity 1 and 10000 (and 0, 10001 rejected), minAge 0 and 25, notes length 2000 vs 2001; ERG name/description/topics/capacity bounds; Ask groupSize 1 and 500; BOM line count 1 and 200; invalid offer type rejected
    - _Requirements: 4.2, 4.5, 4.6, 7.1, 7.2, 8.1, 10.1_

- [x] 3. Implement pure core: units and conversion
  - [x] 3.1 Implement `convert` in `src/lib/core/units.ts`
    - Convert within volume (µL/mL/L) and mass (mg/g) dimensions; return `null` for cross-dimension pairs and for `unit`
    - _Requirements: 11.5, 11.6_

  - [x]* 3.2 Write Property 7 test: unit conversions round-trip within tolerance
    - **Property 7: unit conversions round-trip within tolerance**
    - Create `tests/properties/prop07-unit-roundtrip.property.test.ts`; for all positive quantities and same-dimension unit pairs, convert-then-back returns the original within relative tolerance 0.0001; cross-dimension returns the non-convertible signal (≥100 iterations)
    - **Validates: Requirements 11.5**

- [x] 4. Implement pure core: safety and high-school rules
  - [x] 4.1 Implement `computeHsSafe`, `visibleToCompany`, `gateHighSchoolInPerson` in `src/lib/core/safety.ts`
    - `computeHsSafe` evaluates hazard class + keyword match against a configured keyword list, overrides any AI suggestion, and collapses to `false` on disagreement or missing/unknown hazard class
    - `visibleToCompany` returns false for `pending_advisor_approval` and `rejected`; `gateHighSchoolInPerson` returns `pending_advisor_approval` for in-person HS asks and `open` otherwise
    - _Requirements: 9.1, 14.1, 14.2, 14.3; Property 1, Property 2_

  - [x]* 4.2 Write Property 1 test: hs_safe items never reach a high school club
    - **Property 1: hs_safe items never reach a high school club**
    - Create `tests/properties/prop01-hs-safe-exclusion.property.test.ts`; for all inventory snapshots and HS-club asks, no item with `hsSafe === false` appears in filtered matches, coverage item refs, or protocol inputs; non-HS orgs keep otherwise-eligible items (exercises `applyHardFilters` + `buildCoverage`; ≥100 iterations)
    - **Validates: Requirements 12.5, 15.9**

  - [x]* 4.3 Write Property 2 test: pending approval asks are hidden from companies
    - **Property 2: pending approval asks are hidden from companies**
    - Create `tests/properties/prop02-pending-hidden.property.test.ts`; for all asks, `pending_advisor_approval`/`rejected` ⇒ `visibleToCompany` false and absent from company-facing filters; company-visible statuses retained (≥100 iterations)
    - **Validates: Requirements 5.6, 9.2**

  - [x]* 4.4 Write unit tests for hs_safe rule edges
    - Test AI/rule disagreement collapses to false; missing/unknown hazard class ⇒ false; keyword hit forces false
    - _Requirements: 14.2, 14.3_

- [x] 5. Implement pure core: capacity and allocation
  - [x] 5.1 Implement `canAccept` and `allocate` in `src/lib/core/capacity.ts`
    - `canAccept(offer, acceptedGroupSizesInPeriod, newGroupSize)` returns true iff the new accept keeps the summed group size ≤ capacity; `allocate(available, demands)` returns per-demand allocations whose sum is ≤ available
    - _Requirements: 6.6, 6.7, 18.1, 18.2; Property 3, Property 4_

  - [x]* 5.2 Write Property 3 test: accepted group size never exceeds offer capacity
    - **Property 3: accepted group size never exceeds offer capacity**
    - Create `tests/properties/prop03-capacity-invariant.property.test.ts`; for all capacities and accept-attempt sequences, folding `canAccept` keeps the accepted total ≤ capacity at every step and refuses exactly when it would overflow (≥100 iterations)
    - **Validates: Requirements 6.7, 18.1**

  - [x]* 5.3 Write Property 4 test: allocated quantity never exceeds available
    - **Property 4: allocated inventory quantity never exceeds available**
    - Create `tests/properties/prop04-allocation-invariant.property.test.ts`; for all available quantities and demand sequences, `allocate` returns allocations whose sum ≤ available (≥100 iterations)
    - **Validates: Requirements 18.2**

- [x] 6. Implement pure core: coverage (allocation + classification)
  - [x] 6.1 Implement `buildCoverage` in `src/lib/core/coverage.ts`
    - Filter expired items (expiry ≤ `now`) and, for `high_school_club`, items with `hsSafe === false`; normalize names, match by category, convert units via `convert`, allocate via `allocate`, and classify each line covered/partial/missing with supplying company on covered/partial and none on missing; identical BOM + inventory snapshot ⇒ identical report
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7, 12.5, 14.4, 15.8; Property 1, Property 5, Property 8_

  - [x]* 6.2 Write Property 8 test: coverage "fully covered" iff allocated ≥ needed
    - **Property 8: coverage "fully covered" iff allocated ≥ needed**
    - Create `tests/properties/prop08-coverage-biconditional.property.test.ts`; for all BOMs and inventory, each line is `covered` iff allocated ≥ needed, `partial` iff 0 < allocated < needed, `missing` iff allocated === 0 (≥100 iterations)
    - **Validates: Requirements 11.3, 11.4**

  - [x]* 6.3 Write Property 5 test: expired items never appear
    - **Property 5: expired items never appear**
    - Create `tests/properties/prop05-expiry-exclusion.property.test.ts`; for all inventory snapshots and run dates, items with expiry ≤ run date are excluded from coverage and matches, later-expiry items retained (exercises the expiry filter used by `buildCoverage` and `applyHardFilters`; ≥100 iterations)
    - **Validates: Requirements 11.7, 14.4, 15.8**

- [x] 7. Implement pure core: matching engine (hard filters + soft score)
  - [x] 7.1 Implement `applyHardFilters` in `src/lib/core/matching.ts`
    - Receive `now` as an argument; no I/O, no randomness. Exclude pairs on: offer/ask type mismatch, remaining capacity < group size, no preferred/available date overlap, org age < offer minAge, in-person distance over limit or missing coordinates for either side (straight-line from the city-coords table), expired items, and `hsSafe === false` items for HS clubs
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10; Property 1, Property 5_

  - [x] 7.2 Implement `rankMatches`, `topicFit`, and `ergFit`
    - `topicFit(askText, offerText)` → 0..1 from keyword overlap; `ergFit(orgMission, askText, ergDescription)` → 0..1 using only those texts (`src/lib/core/erg.ts`); `rankMatches` computes a weighted soft score (topic fit, distance, under_resourced, fairness) in [0,1], emits one plain-language reason per contributing factor, ranks zero-past-match orgs above matched ones on ties, excludes candidates with missing scoring inputs (recording a reason), and is fully deterministic for identical inputs
    - _Requirements: 7.5, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6; Property 6_

  - [x]* 7.3 Write Property 6 test: matching is deterministic
    - **Property 6: matching is deterministic**
    - Create `tests/properties/prop06-matching-determinism.property.test.ts`; for all offers/asks/orgs/coords/run dates, two `rankMatches` invocations with identical inputs produce identical match sets in identical order, including tie-break fairness (≥100 iterations)
    - **Validates: Requirements 16.6**

  - [x]* 7.4 Write supporting property/unit tests for matching
    - Hard-filter soundness (type mismatch, capacity < group size, no date overlap, under-min-age, over-distance, missing coords always exclude) and soft-score bounds (score ∈ [0,1], one reason per contributing factor) via fast-check; unit test `ergFit` uses only mission/ask/erg-description text
    - _Requirements: 7.5, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 16.1, 16.4_

- [x] 8. Implement pure core: eligibility, timeline sort, id-scope validator
  - [x] 8.1 Implement `rejectsStudentIdentity`, `sortTimeline`, `validateReferencedIds`
    - `src/lib/core/eligibility.ts`: `rejectsStudentIdentity(payload)` flags any student personal-identity attribute (full name, DOB, home address, personal email/phone, photo, government ID) by field/keyword guard
    - `src/lib/core/timeline.ts`: `sortTimeline` orders by date descending then `seq` ascending (stable, identical on repeated calls)
    - `src/lib/core/refs.ts`: `validateReferencedIds(referenced, allowed)` returns true iff every referenced ID is in the allowed set
    - _Requirements: 2.4, 3.3, 7.6, 12.2, 17.5, 19.6; Property 9_

  - [x]* 8.2 Write Property 9 test: AI outputs reference only input IDs
    - **Property 9: AI outputs reference only input IDs**
    - Create `tests/properties/prop09-id-scope.property.test.ts`; for all allowed-ID sets and referenced-ID lists, `validateReferencedIds` accepts iff every referenced ID is in the allowed set (≥100 iterations)
    - **Validates: Requirements 3.3, 12.2, 19.6**

  - [x]* 8.3 Write unit tests for eligibility and timeline sort
    - `rejectsStudentIdentity` rejects each listed identity attribute and passes mission/ask text; `sortTimeline` is stable reverse-chron and identical on repeated calls (same-date tie-break by `seq`)
    - _Requirements: 2.4, 7.6, 17.5_

- [x] 9. Checkpoint - deterministic core complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build the data layer: repository and seed
  - [x] 10.1 Implement the in-memory repository in `src/lib/data/repo.ts`
    - Implement the `Repo` interface with `Promise`-typed synchronous in-memory methods: accounts/auth, organization + timeline read/add, companies/offers/ERGs CRUD, asks read/save/status, inventory read/save, and `getCityCoords`; `listInventory` applies the expired-item filter on every read using the passed `now`
    - Load and freeze the store from `seed.json` at startup, validating against the schemas
    - _Requirements: 1.1, 2.1, 2.2, 2.6, 4.1, 4.3, 5.1, 6.4, 7.1, 7.3, 13.5, 14.4, 15.6_

  - [x] 10.2 Author `src/lib/data/seed.json` with fictional data only
    - 3 fictional companies (Boston, Cambridge, Worcester), each with one liaison, 1–2 ERGs, 3–4 offers, and 12–20 inventory items including ≥3 hazardous (e.g. ethidium bromide, unpolymerized acrylamide, phenol-chloroform) and 2 expired items
    - 4 fictional organizations: a college affinity STEM club (with ~6 past timeline events), a high school biology club with an advisor, a synthetic biology student team, and a small undergraduate lab
    - A Massachusetts city-coordinates table (~15 cities) and exactly one seeded demo account per role; all companies, people, and schools fictional with no real names or logos
    - _Requirements: 1.1, 2.2, 7.1, 11.1, 14.4, 17.6, 17.7_

  - [x] 10.3 Implement the `seed:check` validator script
    - Validate `seed.json` against the zod schemas and fail with per-field errors; wire it to `npm run seed:check`
    - _Requirements: 19.3_

  - [x]* 10.4 Write unit tests for the repo and seed
    - Not-found org returns null; `listInventory` never returns expired items; `seed.json` parses and contains the required fictional fixtures (≥3 hazardous, 2 expired, ~6 college-club events, one account per role)
    - _Requirements: 2.6, 14.4, 17.6_

- [x] 11. Build the AI provider, prompts, and mock responses
  - [x] 11.1 Implement the provider interface and mock/live providers in `src/lib/ai/provider.ts`
    - Define `AiProvider.complete({ prompt, maxTokens })`; implement `mockProvider` (matches prompt to a canned, schema-valid response, no network) and a `liveProvider` dispatching to Bedrock/Anthropic by env; `getProvider()` returns mock unless a live key is configured
    - _Requirements: 19.1, 19.2_

  - [x] 11.2 Author prompt templates and matching mock responses
    - Add `src/lib/ai/prompts/*.ts` exported template functions for composeAsks, generateBom, writeProtocol, handoffSummary, normalizeInventory; each prompt lists only the records (with IDs) the model may use and requires JSON-only output for structuring tasks; add a matching canned schema-valid response in the mock provider for each
    - _Requirements: 19.1, 19.2_

- [x] 12. Implement the AI wrapper (schema → retry → id-scope → fallback)
  - [x] 12.1 Implement `run` in `src/lib/ai/run.ts`
    - Call `getProvider().complete`, validate output with the given zod schema, retry exactly once with the validation error appended on failure, run `validateReferencedIds` when an allowed-ID set is supplied (reject out-of-scope IDs), and return the typed fallback when validation ultimately fails; enforce the composer 30s bound
    - _Requirements: 8.4, 8.5, 10.4, 12.4, 13.6, 19.3, 19.4, 19.5, 19.6; Property 9_

  - [x]* 12.2 Write wrapper tests with stub providers
    - Using stub providers against the mock: invalid-then-valid payload verifies the single retry includes the validation error; invalid-twice verifies the typed fallback; unknown-id payload verifies reject-and-fallback via `validateReferencedIds`
    - _Requirements: 8.4, 8.6, 10.5, 12.4, 13.7, 19.4, 19.5, 19.6_

- [x] 13. Implement the AI module functions
  - [x] 13.1 Implement `composeAsks` and `generateBom`
    - `composeAsks(text 1..5000)` → `z.array(Ask).min(1).max(20)` with manual-form fallback carrying extracted fields; `generateBom(experiment 1..2000, groupSize 1..500)` → `BOM` with `bom_failed` fallback; both routed through `run`
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6, 10.1, 10.3, 10.4, 10.5_

  - [x] 13.2 Implement `writeProtocol`, `handoffSummary`, `normalizeInventory`
    - `writeProtocol(coverage)` → Protocol whose item IDs ⊆ coverage item IDs and that lists every missing BOM line, with `protocol_rejected` fallback and the HS "Advisor must review before running" text; `handoffSummary(events)` → `HandoffSummary` with referencedIds ⊆ input refs and `handoff_fallback` (also used when no events); `normalizeInventory(rows)` → `z.array(InventoryItem)` (hsSafe overwritten later by `computeHsSafe`) with `manual_table` fallback
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 12.1, 12.2, 12.3, 12.4, 12.6, 13.1, 13.6, 13.7; Property 9_

  - [x]* 13.3 Write unit tests for AI module functions
    - Mock-provider happy paths for each function produce schema-valid output; protocol lists missing lines and includes the HS review text; handoff with no events returns the fallback; normalizeInventory output has its `hsSafe` overridden by `computeHsSafe`
    - _Requirements: 3.5, 12.3, 12.6, 14.2_

- [x] 14. Checkpoint - core, data, and AI layers complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement session and shared authorization
  - [x] 15.1 Implement `POST /api/session` and the role-authorization guard
    - `POST /api/session` selects a seeded demo account, binds a role session, and returns the role's landing view; terminating/replacing the session on reselect. Add a shared guard used by every route that denies out-of-role requests with a role-appropriate message and changes no data
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [x]* 15.2 Write unit tests for session and authorization
    - One account per role is offered; selecting binds role + landing; reselect replaces session; denied out-of-role action returns role-appropriate message and leaves data unchanged
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

- [ ] 16. Implement organization, timeline, and handoff API routes
  - [ ] 16.1 Implement `GET /api/org/[id]` and `POST /api/org/[id]/handoff`
    - `GET` returns profile + `sortTimeline(events)`; 404 not-found when missing; member view is read-only. `POST .../handoff` generates a summary from this org's timeline only via `handoffSummary`, returning the typed fallback on bad/empty refs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.4, 3.5_

  - [ ]* 16.2 Write unit tests for org/handoff routes
    - Not-found indication for missing org; empty-timeline indicator; handoff fallback on unknown-id and on empty timeline
    - _Requirements: 2.5, 2.6, 3.4, 3.5_

- [x] 17. Implement offers, ERG, and liaison dashboard API routes
  - [x] 17.1 Implement `POST /api/offers`, `PUT /api/offers/[id]`, `POST /api/ergs`
    - Create/edit offers with zod validation and per-field errors; ownership check on edit (reject edits to another company's offer, leaving it unchanged); create ERG with bounds; require an ERG before any `erg_event` offer; reject payloads containing student identity via `rejectsStudentIdentity`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

  - [x] 17.2 Implement `GET /api/company/[id]/dashboard`
    - Return asks matched to the company's offers, sorted by score descending with a stable secondary tie-break, each with reasons (indicate when none available); exclude `pending_advisor_approval`/`rejected` asks via `visibleToCompany`; empty-state when none
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6; Property 2_

  - [x]* 17.3 Write unit tests for offers/ERG/dashboard routes
    - Invalid offer type and out-of-bounds fields rejected with per-field errors; cross-company edit rejected unchanged; `erg_event` without ERG rejected; dashboard excludes pending HS asks, sorts stably, and shows empty + no-reasons states
    - _Requirements: 4.2, 4.4, 4.6, 5.2, 5.4, 5.5, 5.6, 7.2, 7.4_

- [ ] 18. Implement accept/decline and advisor approval API routes
  - [ ] 18.1 Implement `POST /api/asks/[id]/accept` and `/decline`
    - Transition only from `matched`; run `canAccept` before accepting and reject capacity-exceeding accepts with no status change and no timeline event; on success write one TimelineEvent to the org timeline and one to the company timeline
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 18.1, 18.3; Property 3_

  - [ ] 18.2 Implement `GET /api/advisor/queue`, `POST /api/asks/[id]/approve`, `/reject`
    - Queue lists only `pending_advisor_approval` asks for the advisor's org; approve → `open`, reject → `rejected`; reject the action for an advisor whose org does not match, leaving status unchanged
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [ ]* 18.3 Write unit tests for accept/decline and advisor routes
    - Accept/decline only from `matched`; capacity-exceeding accept rejected with no event; dual timeline events on success; advisor approve/reject only from pending by the matching org; mismatched advisor rejected
    - _Requirements: 6.3, 6.7, 9.3, 9.4, 9.5_

- [ ] 19. Implement ask composer and supplies API routes
  - [ ] 19.1 Implement `POST /api/asks/compose` and `POST /api/asks/confirm`
    - `compose` validates text length 1..5000 and returns drafts (nothing submitted); `confirm` requires explicit per-ask confirmation, runs `gateHighSchoolInPerson` to set `pending_advisor_approval` for in-person HS asks, and saves the ask
    - _Requirements: 8.2, 8.3, 8.7, 8.8, 9.1_

  - [ ] 19.2 Implement `POST /api/supplies/bom`, `/coverage`, `/protocol`
    - `bom` validates experiment/groupSize ranges and returns BOM or fallback; `coverage` reads non-expired inventory across companies and calls `buildCoverage`; `protocol` calls `writeProtocol`, enforces item IDs ⊆ coverage IDs, lists missing lines, and adds the HS review text
    - _Requirements: 10.1, 10.2, 11.1, 11.2, 12.1, 12.2, 12.3, 12.5, 12.6; Property 1, Property 8, Property 9_

  - [ ]* 19.3 Write unit tests for composer and supplies routes
    - Empty/over-length composer text rejected with retained input; unconfirmed ask not submitted; HS in-person confirm → pending; bom range validation; coverage classification wired; protocol rejects out-of-scope IDs and includes missing lines + HS text
    - _Requirements: 8.2, 8.8, 9.1, 10.2, 11.2, 12.2, 12.4, 12.6_

- [ ] 20. Implement inventory upload/normalization API routes
  - [ ] 20.1 Implement `POST /api/inventory/normalize` and `POST /api/inventory/confirm`
    - `normalize` enforces ≤10MB/≤5000 rows (reject with size/row error, keep saved items unchanged), calls `normalizeInventory`, and returns an editable review set without persisting; `confirm` overrides each item's `hsSafe` with `computeHsSafe`, persists only confirmed items, and indicates completion
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 14.1, 14.2, 14.3_

  - [ ]* 20.2 Write unit tests for inventory routes
    - Oversize/over-row upload rejected with limit message and unchanged items; nothing persisted before confirm; on confirm `hsSafe` is rule-computed (AI value overridden) and items persist
    - _Requirements: 13.2, 13.4, 13.5, 14.2_

- [ ] 21. Checkpoint - API surface complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Build shared UI components
  - [ ] 22.1 Implement shared components in `src/components`
    - Build labeled form field, validation-error display (errors associated with their fields for screen readers), empty-state, timeline list, and a role-aware nav wrapper; WCAG AA contrast, keyboard navigation, and acronym explanation on first use
    - _Requirements: 1.4, 2.3, 5.4_

- [ ] 23. Build the login and organization pages
  - [ ] 23.1 Implement `src/app/login` demo account picker
    - Render exactly one demo account per role; selecting signs in via `POST /api/session` and routes to the role landing; no sign-up/registration control
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [ ] 23.2 Implement `src/app/org/[id]` profile, timeline, and handoff
    - Show profile fields + reverse-chron timeline; hide create/edit/delete controls for members; empty-timeline indicator; "Generate handoff summary" button rendering the summary or its typed fallback
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.4, 3.5_

- [ ] 24. Build the asks composer and supplies pages
  - [ ] 24.1 Implement `src/app/asks/new` composer
    - Free-text input with 1..5000 validation and retained text on error; render structured drafts for per-ask review; require explicit confirm per ask; render the manual-form fallback pre-filled with extracted fields
    - _Requirements: 8.1, 8.2, 8.6, 8.7, 8.8_

  - [ ] 24.2 Implement `src/app/supplies` BOM → coverage → protocol flow
    - Experiment + group-size form with range validation; show the coverage report (covered/partial/missing + supplying company); render the adapted protocol with missing lines and, for HS clubs, the "Advisor must review before running" text; render typed fallbacks
    - _Requirements: 10.1, 10.2, 11.2, 12.1, 12.3, 12.5, 12.6_

- [ ] 25. Build the company and advisor pages
  - [ ] 25.1 Implement `src/app/company/[id]` dashboard, offers, and inventory upload
    - Dashboard of matched asks sorted by score with reasons (and no-reasons/empty states); offer create/edit forms with per-field validation and ownership enforcement; ERG event posting gated on an existing ERG; CSV upload → editable normalization review table → confirm-to-save
    - _Requirements: 4.1, 4.3, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 7.3, 7.4, 13.3, 13.4, 13.5_

  - [ ] 25.2 Implement `src/app/advisor` approval queue
    - List only this advisor's org `pending_advisor_approval` asks; approve and reject actions wired to the advisor routes; confirmation of outcome
    - _Requirements: 9.3, 9.5, 9.6_

  - [ ]* 25.3 Write accessibility checks for key pages
    - Verify labeled fields, keyboard navigation, and error-to-field association on login, composer, supplies, and advisor pages (automated checks; note full AA needs manual assistive-tech review)
    - _Requirements: 1.4, 2.3_

- [ ] 26. Final checkpoint - wire the end-to-end demo path
  - [ ] 26.1 Verify and wire the demo flow across pages and routes
    - Walk the officer → supplies coverage → liaison accept → advisor approve → handoff path end to end through the API routes, fixing any integration gaps so no page imports `lib/data` directly
    - _Requirements: 1.3, 2.2, 3.1, 5.1, 6.4, 9.3, 12.1_

  - [ ] 26.2 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (property tests, unit tests, accessibility checks) and can be skipped for a faster MVP, but they encode the nine correctness guarantees and are strongly recommended.
- Each task references specific requirement clauses and, where applicable, the correctness properties it supports for traceability.
- The deterministic core (tasks 3–8) and its nine property tests are front-loaded because they carry every safety, eligibility, and matching guarantee.
- Each of the nine correctness properties has its own named fast-check test file under `tests/properties/` with the property number in the name (`prop01`–`prop09`).
- All AI paths are tested against the mock provider, so tests need no network and no secrets; the retry-then-fallback and id-scope behavior is exercised with stub providers.
- Checkpoints provide incremental validation at layer boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "8.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "4.3", "4.4", "5.2", "5.3", "6.1", "7.1", "8.2", "8.3"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.2", "10.1", "10.2"] },
    { "id": 5, "tasks": ["7.3", "7.4", "10.3", "10.4", "11.1"] },
    { "id": 6, "tasks": ["11.2", "12.1"] },
    { "id": 7, "tasks": ["12.2", "13.1", "13.2"] },
    { "id": 8, "tasks": ["13.3", "15.1", "16.1", "17.1", "17.2"] },
    { "id": 9, "tasks": ["15.2", "16.2", "17.3", "18.1", "18.2", "19.1", "19.2", "20.1"] },
    { "id": 10, "tasks": ["18.3", "19.3", "20.2", "22.1"] },
    { "id": 11, "tasks": ["23.1", "23.2", "24.1", "24.2", "25.1", "25.2"] },
    { "id": 12, "tasks": ["25.3", "26.1"] }
  ]
}
```
