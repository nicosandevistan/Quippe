# Implementation Plan

## Overview

Fix the dev-server bug where each evaluation of `src/lib/data/repo.ts` gets its own in-memory store, so writes through one route or page are invisible to others. The plan follows the bug condition methodology: write the exploration test and the preservation tests first in `tests/unit/repo-singleton.test.ts` and run them on the UNFIXED code, then move the singleton onto `globalThis` under `__quippeRepo`, re-run the same tests, run lint and the full suite, log the work in `docs/kiro-log.md`, and commit and push to `main`.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - One Shared Repository Across Module Evaluations
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to the concrete failing case: one write through evaluation A, one read through evaluation B
  - Create `tests/unit/repo-singleton.test.ts` (Vitest + `fast-check`, `import fc from "fast-check"`, `@/` alias as in the existing suite)
  - Add a `beforeEach`/`afterEach` that calls `vi.resetModules()` and deletes `(globalThis as Record<string, unknown>).__quippeRepo` so each case starts from the seed and leaks nothing
  - Helper `freshEvaluation()`: `vi.resetModules()` then `await import("@/lib/data/repo")`, which simulates a separate Next bundle or a dev-server re-evaluation
  - Bug condition from design (`isBugCondition`): write and read in the same process through two different evaluations of `repo.ts`
  - Assert expected behavior from design (`expectedBehavior`): `A.getRepo() === B.getRepo()`, and an ask saved via `A.getRepo().saveAsk(...)` (unique id via `crypto.randomUUID()`, `orgId: "org-liss"`) is returned by `B.getRepo().getAsk(id)` and `B.getRepo().listAsks({ orgId })`
  - Property (fast-check, small `numRuns`): for a generated write sequence over saveAsk, addTimelineEvent, createOffer, createErg, and saveInventory (schema-valid entities with unique ids) through A, every written entity is readable through B
  - Route-level repro: in graph A import `POST` from `@/app/api/asks/confirm/route` and confirm 1-3 asks as the `org-liss` officer (cookie `${SESSION_COOKIE}=<officer account id>`, following `tests/unit/composer-supplies-routes.test.ts`); in graph B import `GET` from `@/app/api/org/[id]/route` and assert the timeline has a `kind: "ask"` event whose `refs` include each new ask id; also assert `GET /api/company/co-harborview/dashboard` from graph B returns the same ask ids as from graph A
  - Run `npx vitest run tests/unit/repo-singleton.test.ts` on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (expected: `B.getRepo()` is a different object, `B.getRepo().getAsk(id)` returns `null`, org timeline from graph B has only seed events)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Isolated Fresh Repos, Seed Validation, and Expiry Filter
  - **IMPORTANT**: Follow observation-first methodology
  - Add a second `describe` block to `tests/unit/repo-singleton.test.ts`
  - Observe on UNFIXED code: two `createRepoFromSeed()` results and `getRepo()` are distinct objects, and a write to one is not visible in the others
  - Observe on UNFIXED code: with `seed.json` mocked to a malformed document (`vi.doMock("@/lib/data/seed.json", () => ({ default: { accounts: "bad" } }))`, `vi.resetModules()`, global slot cleared, dynamic import), both `createRepoFromSeed()` and the first `getRepo()` throw a `ZodError`; undo with `vi.doUnmock` afterwards
  - Observe on UNFIXED code: `listInventory("2026-10-24")` drops the seeded expired items (for example `inv-hv-expired-taq`)
  - Property-based test (isolation): for random write sequences against a `createRepoFromSeed()` repo, `getRepo()` and a second `createRepoFromSeed()` repo do not contain any written id
  - Property-based test (expiry filter): for random inventory items (random ISO expiry dates, companies from the seed) saved into a fresh repo and a random ISO run date, `listInventory(runDate, filter?)` returns exactly the items (seed plus saved) with `expiry > runDate` that match the company filter
  - Unit test (same-evaluation round trip): writes and reads through one evaluation's `getRepo()` round-trip
  - Run `npx vitest run tests/unit/repo-singleton.test.ts -t "preservation"` (or the describe name chosen) on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for repository store not shared across routes and re-evaluations

  - [x] 3.1 Implement the fix
    - In `src/lib/data/repo.ts`, delete `let repoInstance: InMemoryRepo | null = null;`
    - Add `const GLOBAL_REPO_KEY = "__quippeRepo";` and a typed cast `const globalForRepo = globalThis as typeof globalThis & { [GLOBAL_REPO_KEY]?: Repo };` (no `declare global` / `var`, so lint stays clean)
    - Rewrite `getRepo()` to return `globalForRepo[GLOBAL_REPO_KEY]`, creating `new InMemoryRepo(loadStore())` and storing it only when the slot is `undefined`
    - Keep `createRepoFromSeed()` exactly as it is; it must never read or write the global slot
    - Update the `// --- Singleton ---` comment to explain why the instance lives on `globalThis`, and correct the `SeedSchema` comment that says the seed is validated at module load
    - Do not change the `Repo` interface, `InMemoryRepo`, `loadStore()`, `isExpired()`, or any call site
    - _Bug_Condition: isBugCondition(X) where X.writeEval ≠ X.readEval in the same process (design: Bug Condition)_
    - _Expected_Behavior: expectedBehavior(X, result): every evaluation's getRepo() returns the same instance and the read reflects the write (design: Correctness Properties, Property 1)_
    - _Preservation: createRepoFromSeed isolation, seed validation on first creation, expiry filter, unchanged Repo results, reset on restart (design: Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - One Shared Repository Across Module Evaluations
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run `npx vitest run tests/unit/repo-singleton.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Isolated Fresh Repos, Seed Validation, and Expiry Filter
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Keep `tests/unit/repo-singleton.test.ts` in the suite as the regression test
  - Run `npm run lint` (`next lint && tsc --noEmit`); it must pass
  - Run `npm test` (`vitest run`); every existing and new test must pass
  - Optionally run `npm run seed:check` to confirm seed validation is unaffected
  - Ask the user to restart `npm run dev` and repeat the repro (confirm 3 asks on `/asks/new`, then check the `co-harborview` dashboard and `/org/org-liss`); do not start the dev server from the agent
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 3.6_

- [x] 5. Add a docs/kiro-log.md entry
  - Append one entry under `## Log` in `docs/kiro-log.md` (create the file with the existing header and entry template if it is missing), using the existing fields: Time, Who, Kiro tool, Feature, What we did, What happened (good or bad), Screenshot
  - Describe the bug (writes on one route invisible on others under `npm run dev`; unit tests passed because they share one process)
  - Describe the root cause (module-scoped `repoInstance`; Next 14 dev inlines `repo.ts` into each server entry bundle and `NextJsRequireCacheHotReloader` drops `webpack-runtime.js` from `require.cache` after every compile, so each re-evaluation built a fresh store from the seed)
  - Describe how the Bugfix spec found and confirmed it (bug condition written as "write and read through different module evaluations", exploration test with `vi.resetModules()` failed on unfixed code, preservation tests passed before and after) and the fix (singleton on `globalThis.__quippeRepo`)
  - Include the final test count from `npm test`
  - _Requirements: 2.1_

- [x] 6. Commit and push to main
  - Confirm the current branch is `main` and run `git pull` first; resolve any conflict without discarding others' changes
  - Stage specific files only: `src/lib/data/repo.ts`, `tests/unit/repo-singleton.test.ts`, `docs/kiro-log.md`, `.kiro/specs/shared-repo-singleton/.config.kiro`, `.kiro/specs/shared-repo-singleton/bugfix.md`, `.kiro/specs/shared-repo-singleton/design.md`, `.kiro/specs/shared-repo-singleton/tasks.md`
  - Commit with the exact message `Fix: share one in-memory repository across all routes`
  - Push with `git push origin main`; no force-push, no `--no-verify`; if a hook fails, fix the issue and make a new commit
  - _Requirements: 3.6_

## Notes

- Write and run the exploration test (task 1) and the preservation tests (task 2) on the UNFIXED code before touching `repo.ts`.
- The new tests go in `tests/unit/` rather than `tests/properties/`, because `tests/properties/` holds one file per PROJECT_BRIEF section 9 property and this bugfix property is not one of them.
- Vitest 2 runs each test file in its own isolated worker by default (`isolate: true`), so the `globalThis` slot should not leak between test files; existing route tests already use deltas and unique ids, so they do not assume a pristine store. Within `repo-singleton.test.ts`, clear it in `beforeEach`/`afterEach`.
- Trade-off accepted in the design: editing `repo.ts` itself while `npm run dev` runs keeps the old repository instance until the dev server restarts.
