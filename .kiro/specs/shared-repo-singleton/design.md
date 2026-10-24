# Shared Repo Singleton Bugfix Design

## Overview

Under `npm run dev`, writes made through one route or page (confirmed asks, accept/decline, advisor approve/reject, offers, ERGs, confirmed inventory) do not show up on other routes or pages. The cause is that the repository singleton in `src/lib/data/repo.ts` is a module-scoped `let repoInstance`, and Next.js evaluates that module more than once in the same Node process. Each evaluation starts with `repoInstance = null`, builds a new store from `seed.json`, and so each copy of the module serves its own store.

The fix keeps the singleton on `globalThis` under a namespaced key (`__quippeRepo`). `globalThis` is the Node process global. It is shared by every bundle that runs in the process and is not cleared when Next drops modules from `require.cache`. `getRepo()` reads the instance from `globalThis` and creates it only if it is absent. `createRepoFromSeed()`, the `Repo` interface, seed validation, and the expired-item filter do not change.

## Glossary

- **Bug_Condition (C)**: A write and a later read go through two different evaluations of `repo.ts` in the same process (two module instances, or one instance before and one after a re-evaluation).
- **Property (P)**: The read observes the write, because every evaluation's `getRepo()` returns the same repository instance.
- **Preservation**: Behavior that must not change: `createRepoFromSeed()` isolation, seed validation on first creation, the expired-item filter, the `Repo` method results, and reset-on-restart.
- **Module evaluation**: One execution of the top level of `repo.ts`. Each evaluation has its own `repoInstance` binding. In Vitest, `vi.resetModules()` followed by a dynamic `import()` produces a new evaluation, which is how the tests simulate Next's behavior.
- **`getRepo()`**: The function in `src/lib/data/repo.ts` that returns the process-wide repository. Called from 17 sites in 16 files under `src/app/api/**`.
- **`createRepoFromSeed()`**: The function in `src/lib/data/repo.ts` that returns a new, isolated repository built from the seed. Used by tests.
- **`loadStore()`**: Private function in `repo.ts` that parses `seed.json` with `SeedSchema` (throws on a malformed seed) and builds the mutable tables.
- **`callApi`**: `src/app/_lib/call-api.ts`. Pages and server actions import route handlers from `@/app/api/...` and call them in-process through it, so the page bundles also contain `repo.ts`.
- **`NextJsRequireCacheHotReloader`**: Next's dev-only webpack plugin (`node_modules/next/dist/build/webpack/plugins/nextjs-require-cache-hot-reloader.js`) that removes server bundles and `webpack-runtime.js` from Node's `require.cache` after each server compile.

## Bug Details

### Bug Condition

The bug manifests when a repository write happens through one evaluation of `repo.ts` and a later read happens through a different evaluation in the same process. In the dev server this happens whenever a page or route is compiled for the first time, or whenever a file is saved. Each new evaluation's `getRepo()` sees `repoInstance === null` and builds a fresh store from the seed, so earlier writes are not visible.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type { writeEval: ModuleEvaluation, readEval: ModuleEvaluation,
                     write: RepoMutation, read: RepoQuery }
  OUTPUT: boolean

  // A mutation goes through one evaluation of repo.ts and a query that
  // depends on it goes through a different evaluation in the same process.
  RETURN X.writeEval.process = X.readEval.process
         AND X.writeEval ≠ X.readEval
         AND X.write IN { saveAsk, setAskStatus, addTimelineEvent, createOffer,
                          updateOffer, createErg, saveInventory }
         AND X.read observes the entity written by X.write
END FUNCTION
```

```
FUNCTION expectedBehavior(X, result)
  INPUT: X satisfying isBugCondition, result = X.read run via X.readEval
  OUTPUT: boolean

  RETURN X.readEval.getRepo() IS X.writeEval.getRepo()        // same instance
         AND result reflects X.write                         // write is visible
END FUNCTION
```

### Examples

- **Confirm then dashboard**: Officer confirms 3 asks through `POST /api/asks/confirm` (response says each is matched). `GET /api/company/co-harborview/dashboard` is then compiled on first visit and returns only seed asks. Expected: the 3 new asks are candidates on the dashboard, subject to `visibleToCompany` and the hard filters.
- **Confirm then org timeline**: After the same confirm, `/org/org-liss` (which calls `GET /api/org/[id]` in-process) shows only the seed timeline. Expected: one `kind: "ask"` timeline event per confirmed ask, with the ask id in `refs`.
- **Simulated in Vitest**: `vi.resetModules()`, import `repo.ts` as A, `A.getRepo().saveAsk(ask)`, `vi.resetModules()`, import `repo.ts` as B. Today `await B.getRepo().getAsk(ask.id)` returns `null` and `A.getRepo() !== B.getRepo()`. Expected: the ask is returned and both are the same instance.
- **Edge case, file save**: Saving any source file while the dev server runs triggers a recompile. Today all writes since start are lost. Expected: writes survive until the process restarts.
- **Edge case, non-bug**: All writes and reads through one evaluation (what every existing unit test does). Works today and must keep working.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `createRepoFromSeed()` returns a new repository with its own copy of the mutable tables on every call. It never returns or touches the shared instance, and writes to it are not visible to `getRepo()` or to other `createRepoFromSeed()` results.
- The first `getRepo()` call in a process runs `loadStore()`, so a malformed `seed.json` still throws a zod error. `createRepoFromSeed()` still validates on every call. `npm run seed:check` is unchanged.
- `listInventory(runDate, filter?)` still drops every item with `expiry <= runDate`, with and without a company filter, on both the shared and the fresh repositories.
- Every `Repo` method returns the same results for the same store contents. The `Repo` interface and the signatures of `getRepo()` and `createRepoFromSeed()` do not change, so no call site changes.
- A process restart still starts from seed data only. Nothing is written to disk.
- All existing tests pass and `npm run lint` (`next lint && tsc --noEmit`) passes.

**Scope:**
All inputs where every write and read go through one evaluation of `repo.ts` should be completely unaffected by this fix. This includes:
- Every existing unit and property test, which import `repo.ts` once per test file
- Any use of `createRepoFromSeed()`
- `scripts/seed-check.ts`, which only imports `SeedSchema`
- A production `next start` process where the module happens to be evaluated once

## Hypothesized Root Cause

The root cause was checked against the codebase and the installed Next.js before writing this design.

**Evidence gathered:**
- Next.js `14.2.35` (`package.json` asks for `^14.2.5`), App Router, webpack bundler (`next dev` without `--turbo`). `next.config.mjs` only sets `reactStrictMode: true`.
- `getRepo()` is called from 17 sites in 16 files under `src/app/api/**`: the route handlers for session, offers, offers/[id], ergs, company/[id]/dashboard, asks/confirm, asks/[id]/accept, asks/[id]/decline, advisor/queue, org/[id], org/[id]/handoff, inventory/confirm, supplies/coverage, supplies/protocol, plus the helpers `api/_lib/session.ts` and `api/_lib/advisor.ts` (used by approve/reject). `api/_lib/accept-decline.ts` and `api/_lib/match-status.ts` take a `Repo` as a parameter. No page imports `lib/data` directly (enforced by `tests/unit/structure-rules.test.ts`). Pages and server actions import route handlers and call them through `callApi`.
- The dev build output contains the module `"(rsc)/./src/lib/data/repo.ts"`, including `repoInstance`, inlined separately into 13 server entry bundles: `.next/server/app/{advisor,org/[id],asks/new,supplies,login,company/[id]}/page.js` and `.next/server/app/api/{org/[id],asks/compose,asks/confirm,supplies/bom,supplies/protocol,supplies/coverage,company/[id]/dashboard}/route.js`. There is no shared chunk for app code; only `vendor-chunks/next` and `vendor-chunks/zod` are shared.

Based on this, the causes are:

1. **Dev require-cache reset (primary)**: Each entry bundle registers its modules into the shared `.next/server/webpack-runtime.js`, whose module cache holds the evaluated `repo.ts`. After every server compile, `NextJsRequireCacheHotReloader`'s `afterEmit` hook calls `deleteCache` on `webpack-runtime.js` and on every `app/` entry. The next request re-requires them, which creates a new webpack module cache, re-evaluates `repo.ts`, and resets `repoInstance` to `null`. In dev, pages and routes compile on demand, so the first visit to the dashboard or the org page after confirming asks triggers a compile and discards the store. This matches the repro exactly.

2. **HMR on file save**: Saving any file triggers the same compile and cache reset, so all writes are lost mid-session.

3. **Separate webpack layers**: The same source file is compiled once per layer (for example `(rsc)` and `(action-browser)`), and each layer copy is a distinct module with its own `repoInstance`. `docs/kiro-log.md` already records this happening in a production build for server actions imported by client components. That case was worked around by passing actions as props. A `globalThis` singleton removes the whole class of problem.

4. **Module-scoped state is the common factor**: All three paths depend on the singleton living in module scope. `globalThis` is the one object shared by every bundle, layer, and re-evaluation in a Node process, and Next does not reset it. This is the standard pattern for dev-server singletons (for example database clients).

What is **not** the cause: `createRepoFromSeed()`, `loadStore()`, the route logic, and `callApi` all behave correctly; the unit tests pass because each test file evaluates `repo.ts` once.

## Correctness Properties

Property 1: Bug Condition - One Shared Repository Across Module Evaluations

_For any_ sequence of repository writes (saveAsk, setAskStatus, addTimelineEvent, createOffer, updateOffer, createErg, saveInventory) made through one evaluation of `repo.ts`, and any later read through a different evaluation of `repo.ts` in the same process (isBugCondition returns true), the fixed `getRepo()` SHALL return the identical repository instance in both evaluations and the read SHALL observe every write, so confirmed asks appear on the company dashboard and in the org timeline served by other routes.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Isolated Fresh Repos, Seed Validation, and Expiry Filter

_For any_ input where the bug condition does NOT hold (all access through one module evaluation, or through `createRepoFromSeed()`), the fixed code SHALL produce the same result as the original code: each `createRepoFromSeed()` call returns a new store isolated from the shared repository and from other fresh stores, a malformed seed throws on first creation, `listInventory` excludes every item with `expiry <= runDate` with and without a company filter, and every other `Repo` method returns the same results for the same store contents.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/lib/data/repo.ts`

**Function**: `getRepo` (and the module-scoped `repoInstance` it uses)

**Specific Changes**:
1. **Remove the module-scoped singleton**: Delete `let repoInstance: InMemoryRepo | null = null;`.

2. **Add a typed, namespaced `globalThis` slot**: Use a typed cast so no `declare global` / `var` is needed (keeps `next lint` and `tsc --noEmit` clean):
   ```ts
   /** Key for the process-wide repo on globalThis. Namespaced to avoid clashes. */
   const GLOBAL_REPO_KEY = "__quippeRepo";

   const globalForRepo = globalThis as typeof globalThis & {
     [GLOBAL_REPO_KEY]?: Repo;
   };
   ```

3. **Read and lazily create through `globalThis`**:
   ```ts
   export function getRepo(): Repo {
     let repo = globalForRepo[GLOBAL_REPO_KEY];
     if (repo === undefined) {
       repo = new InMemoryRepo(loadStore());
       globalForRepo[GLOBAL_REPO_KEY] = repo;
     }
     return repo;
   }
   ```
   `loadStore()` still runs only on first creation, so seed validation is unchanged. The slot is typed as `Repo`, not `InMemoryRepo`, because after a re-evaluation the stored object is an instance of the earlier evaluation's class.

4. **Update comments**: Explain in the `// --- Singleton ---` block why the instance lives on `globalThis` (Next dev evaluates the module per entry bundle and re-evaluates it after each compile). Also correct the `SeedSchema` comment "Validated once at module load", since validation happens on first `getRepo()` or on each `createRepoFromSeed()` call.

5. **Leave `createRepoFromSeed()` unchanged**: It keeps returning `new InMemoryRepo(loadStore())` and never reads or writes the global slot.

**Known trade-off**: When `repo.ts` itself is edited during `npm run dev`, the stored instance keeps the old class's methods until the dev server restarts. This is acceptable for the demo and is the usual cost of this pattern. No other file changes are needed: all call sites already use `getRepo()`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. All new tests go in one file, `tests/unit/repo-singleton.test.ts` (matched by the `tests/unit/**` include in `vitest.config.ts`), using Vitest and fast-check like the existing suite. The file stays in the suite as the regression test.

Test hygiene: tests that use `vi.resetModules()` must clear `globalThis.__quippeRepo` in `beforeEach`/`afterEach` (and undo any `vi.doMock`) so they start from the seed and do not leak state to other tests in the file. Written entities use unique ids (`crypto.randomUUID()`), following the existing route tests.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Simulate two Next bundles in one process: `vi.resetModules()`, `await import("@/lib/data/repo")` as evaluation A, write through `A.getRepo()`, `vi.resetModules()`, import again as evaluation B, and read through `B.getRepo()`. Do the same at route level by importing the confirm route in A and the dashboard and org routes in B. Run on the UNFIXED code to observe failures.

**Test Cases**:
1. **Instance identity**: `A.getRepo() === B.getRepo()` (will fail on unfixed code)
2. **Ask write visibility**: `saveAsk` through A, `getAsk` and `listAsks({ orgId })` through B find it (will fail on unfixed code)
3. **Property over write kinds**: fast-check generates a sequence of writes across asks, timeline events, offers, ERGs, and inventory through A; each is readable through B (will fail on unfixed code)
4. **Route-level repro**: `POST /api/asks/confirm` from graph A as the `org-liss` officer, then `GET /api/org/org-liss` from graph B includes an `ask` event whose `refs` contain each new ask id (will fail on unfixed code)
5. **Dashboard agreement (edge)**: after the confirm in A, `GET /api/company/co-harborview/dashboard` from graph B returns the same ask ids as the same request from graph A (may fail on unfixed code, depending on whether the new asks survive the hard filters)

**Expected Counterexamples**:
- `B.getRepo()` is a different object and `B.getRepo().getAsk(id)` returns `null`
- The org timeline from graph B has only seed events
- Possible causes: module-scoped `repoInstance` re-initialised on each evaluation; separate store per bundle

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  A := fresh evaluation of repo.ts
  apply X.write via A.getRepo()
  B := fresh evaluation of repo.ts
  result := X.read via B.getRepo()
  ASSERT expectedBehavior(X, result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT repo_original(X) = repo_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for `createRepoFromSeed()`, seed validation, and the expiry filter, then write property-based tests capturing that behavior. They must pass before and after the fix.

**Test Cases**:
1. **Fresh-store isolation**: Observe that two `createRepoFromSeed()` results and `getRepo()` are distinct objects and writes to one are invisible to the others. Property: for random write sequences against a fresh repo, `getRepo()` and a second fresh repo still equal the seed for those ids.
2. **Seed validation**: Observe that with `seed.json` replaced by a malformed document (`vi.doMock("@/lib/data/seed.json", ...)` plus `vi.resetModules()` and a cleared global slot), both `createRepoFromSeed()` and the first `getRepo()` throw a zod error.
3. **Expiry filter**: Observe that `listInventory(runDate)` drops `expiry <= runDate`. Property: for random items (random expiry dates, companies) saved into a fresh repo and a random ISO run date, `listInventory(runDate, filter?)` returns exactly the saved-plus-seed items with `expiry > runDate` matching the filter.
4. **Same-evaluation behavior**: Observe that writes and reads through one evaluation's `getRepo()` round-trip; this must still hold.

### Unit Tests

- `getRepo()` returns the same instance across `vi.resetModules()` re-imports, and stores it under `globalThis.__quippeRepo`
- `createRepoFromSeed()` never returns the shared instance and never writes the global slot
- Malformed seed throws on first `getRepo()` and on `createRepoFromSeed()`

### Property-Based Tests

- Random write sequences through evaluation A are all readable through evaluation B (Property 1)
- Random write sequences to a fresh repo never leak to `getRepo()` or another fresh repo (Property 2)
- Random inventory and run dates: expired items never returned, with and without company filter (Property 2)

### Integration Tests

- Confirm asks through the real `POST /api/asks/confirm` handler in one module graph, then read through `GET /api/org/[id]` and `GET /api/company/[id]/dashboard` handlers from a second module graph
- Full existing suite (`npm test`) and `npm run lint` pass after the fix
- Manual check by the user: restart `npm run dev`, repeat the bug report's repro, and confirm the new asks appear on the dashboard and on `/org/org-liss`
