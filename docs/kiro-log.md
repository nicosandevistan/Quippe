# Kiro usage log

Add an entry whenever you use a Kiro feature. Take a screenshot when something is worth showing. This becomes the Kiro write-up for the submission, which counts toward the Implementation score.

## Entry template

- **Time:**
- **Who:**
- **Kiro tool:** IDE / CLI / Web / Crew
- **Feature:** spec / steering / hook / MCP / PBT / power / vibe coding
- **What we did:**
- **What happened (good or bad):**
- **Screenshot:** (file name in docs/screenshots/)

## Write-up checklist (answer each by submission time)

- [ ] Which Kiro tools did we use, and how did they differ?
- [ ] Spec-driven development: how we structured the spec, and how it compared to vibe coding (note one feature we vibe coded on purpose for comparison)
- [ ] Agent hooks: which workflows we automated and what they saved us
- [ ] Steering: which steering files made the biggest difference, with a before/after example
- [ ] MCP: what we connected and what it made possible
- [ ] Property-based testing: which properties, and any bug PBT caught that unit tests missed
- [ ] Powers: which ones we tried and what they added

## Log


- **Time:** Morning
- **Who:** Nico
- **Kiro tool:** Crew vs IDE
- **Feature:** agent safety / tool choice
- **What we did:** Asked Kiro Crew to connect the project folder to GitHub and push.
- **What happened (good or bad):** Crew stopped before pushing: its workspace held private memory and knowledge files, not the project. Moved repo work to the Kiro IDE, where the agent works inside the opened project folder.
- **Screenshot:**

- **Time:** Morning
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** agent + git
- **What we did:** Had the IDE agent commit the starter files (brief, steering docs, setup guide) and push to GitHub.
- **What happened (good or bad):** It checked git status and confirmed .kiro/ was not ignored before staging; then committed and pushed. Each command needed approval until Autopilot was turned on.
- **Screenshot:**

- **Time:** Morning
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** spec + steering
- **What we did:** Spec session from PROJECT_BRIEF.md: requirements (EARS) → design → tasks.
- **What happened (good or bad):** 19 requirements covering F1–F9, with all 9 correctness properties written as acceptance criteria. Kiro ran parallel "requirement-detailer" sub-agents to refine each requirement. Design followed tech.md and structure.md (Next.js, zod, fast-check, in-memory data, mock AI) and mapped each property to its own test file (prop01–prop09). Tasks: 26 tasks / 58 subtasks with a dependency graph in waves, which we used to split work across 5 people. Cost: about 13.3 credits (requirements), 5.9 (design), 4.6 (tasks).
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** agent + git
- **What we did:** Renamed the app from "Open Bench" to "Quippe" across the codebase: README, PROJECT_BRIEF, .env.example, steering docs, spec document text, code comments, UI strings (layout.tsx, page.tsx), test descriptions, and the package name. Deliberately left the spec folder `.kiro/specs/open-bench-mvp` and its `Feature: open-bench-mvp` property-test tags unchanged so the Kiro spec keeps working.
- **What happened (good or bad):** Clean rename. Refreshed package-lock.json via npm install; npm run lint and npm test stayed green (107 tests). Committed as "Rename app to Quippe", pushed to main, and merged main into the core branch to keep it in sync.
- **Screenshot:**

- **Time:** 2026-10-24 afternoon
- **Who:** Garrett (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution (Start task) + environment setup
- **What we did:** Pulled main, branched `feat/ai-layer-provider`, installed Node 24 LTS (winget), ran `npm install` once, and continued the spec from the next unchecked task. Tasks 1–9 (deterministic core, 107 tests) were already on main; the next open work was Task 10 (data layer).
- **What happened (good or bad):** Implemented Task 10 end to end: the in-memory `Repo` (`src/lib/data/repo.ts`) matching the design interface with `listInventory` applying the expired-item filter on every read; `seed.json` with all-fictional data (3 companies in Boston/Cambridge/Worcester, 4 orgs incl. a HS club with advisor and the college club with 6 past timeline events, 3 ERGs, 9 offers, 27 inventory items with 6 hazardous + 2 expired, a 15-city MA coordinate table, one account per role); and a `seed:check` validator (`scripts/seed-check.ts`) that schema-validates the seed, checks referential integrity, and asserts the required demo fixtures. Added 12 repo/seed unit tests. `npm run seed:check`, `npm run lint`, and `npm test` all green (119 tests). One gotcha logged: zod `.optional()` rejects JSON `null`, so non-HS orgs omit `advisorAccountId` entirely.
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Jonat (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution / steering
- **What we did:** Executed Task 22 (shared UI components) on a `ui` branch: FormField (label + aria error wiring), EmptyState, Acronym (explains on first use), TimelineList, and a role-aware PageShell with a skip link.
- **What happened (good or bad):** Steering (product.md principles 5–6: plain language + accessible) drove the component API — every field is labeled and errors are tied to their field with aria-describedby. Built against design.md contracts; pages read the repo on the server as a temporary stand-in with TODOs to switch to the API routes once they land. Lint + 119 tests stayed green.
- **Screenshot:**

- **Time:** 2026-10-24 afternoon
- **Who:** Garrett (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution — AI layer (mock-first)
- **What we did:** Task 11 — AI provider interface + mock/live providers (`src/lib/ai/provider.ts`) and prompt templates with matching canned mock responses (`src/lib/ai/prompts/index.ts`).
- **What happened (good or bad):** The app defaults to the mock provider so it runs with zero secrets: `getProvider()` returns the mock unless a live key (Anthropic/Bedrock) is configured. Each prompt embeds a stable `[[TASK:...]]` marker so the mock routes offline without any network. The id-scoped mocks (writeProtocol, handoffSummary) extract the allowed-id list straight from the prompt and echo only those, so the mock can never fabricate an out-of-scope id — which keeps the CP9 id-scope guard exercising the happy path rather than the fallback. lint + test green (119).
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Jonat (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution
- **What we did:** Task 23 — login demo-account picker (one account per role, no sign-up) and the org page (profile, reverse-chron timeline via the pure `sortTimeline`, member read-only, empty-timeline indicator, and a "Generate handoff summary" button).
- **What happened (good or bad):** Sign-in is a server action setting an httpOnly cookie (stand-in for POST /api/session, TODO to switch). The handoff button calls a server action that returns the typed fallback shape today, so the "couldn't generate" state and the result rendering are already wired for when Task 16 lands. 404 on a missing org via Next's notFound(). lint green.
- **Screenshot:**

- **Time:** 2026-10-24 afternoon
- **Who:** Garrett (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution — AI wrapper + stub-provider tests
- **What we did:** Task 12 — `src/lib/ai/run.ts`, the single AI enforcement point: provider → JSON parse → zod validate → one retry with the error appended → optional id-scope guard (CP9) → typed fallback. Added 5 wrapper tests driven by scripted stub providers.
- **What happened (good or bad):** Worth noting for the write-up — the retry/fallback paths are exercised directly by stub providers rather than the mock: (1) invalid-then-valid proves exactly ONE retry fires and the retry prompt literally contains the prior validation error; (2) invalid-twice returns the typed fallback and stops (no third attempt); (3) a payload that is schema-valid but cites an out-of-scope id ("ROGUE-ID") is still rejected by `validateReferencedIds` and falls back — the case a plain schema check would have missed. lint + test green (124).
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Jonat (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution / property-minded safety wiring
- **What we did:** Task 25 — company page (dashboard of matched asks, offer create form, ERG-gated event posting, CSV inventory upload → review → confirm) and the advisor approval queue (approve/reject, org-ownership checked). Plus Task 25.3 accessibility tests.
- **What happened (good or bad):** Two safety guarantees are wired through the UI even before the API routes exist: the company dashboard filters asks through the pure `visibleToCompany` so pending/rejected HS asks never show (Property 2), and inventory confirm sets `hsSafe` via `computeHsSafe` — the uploaded value is never trusted (Req 14.2). The review table labels the HS-safe column as rule-set, so the UI itself communicates "AI/human suggests, rules decide". Accessibility tests render components with `react-dom/server` (no new deps) and assert label↔control and error↔field wiring; needed `esbuild.jsx: "automatic"` in vitest config so `.tsx` tests compile without importing React. 25.3 scope note: login + advisor are owned here; composer/supplies (Task 24) are a teammate's, so those page-level checks fall to them — the shared components they reuse are covered. lint + tests green.
- **Screenshot:**

- **Time:** 2026-10-24 afternoon
- **Who:** Garrett (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution — AI module functions (bug caught by type-check)
- **What we did:** Task 13 — `src/lib/ai/index.ts` wires the five AI functions (composeAsks, generateBom, writeProtocol, handoffSummary, normalizeInventory) through the wrapper with each one's output schema, typed fallback, and (for the id-scoped ones) the allowed-id set. Added 8 unit tests against the mock provider. Defined the `Protocol` schema locally in the AI layer (it is an AI-output shape, not a core domain entity, and the spec places no Protocol schema in `src/lib/schemas`).
- **What happened (good or bad):** `tsc --noEmit` (part of `npm run lint`) caught a real type bug the unit tests passed straight through: `run()` typed its `schema` as `z.ZodType<T>`, which a zod schema containing BRANDED id types (ZodBranded, where input ≠ output) does not satisfy — so `run({ schema: BOM })` failed to compile. Fixed by widening the parameter to `z.ZodType<T, z.ZodTypeDef, unknown>`. A good example of the type-checker catching something the runtime tests could not. Also enforced Req 12.3 defensively: even a schema-valid protocol is rejected to the fallback if it omits any missing BOM line. lint + test green (132).
- **Screenshot:**

- **Time:** 2026-10-24 afternoon
- **Who:** Garrett (via Kiro Crew)
- **Kiro tool:** Crew
- **Feature:** spec task execution — Task 14 checkpoint
- **What we did:** Task 14 checkpoint — core + data + AI layers complete. Ran seed:check, lint, and the full test suite.
- **What happened (good or bad):** All green: `seed:check` OK, `npm run lint` clean, `npm test` 132 passed across 17 files. The whole AI layer runs on the mock provider with no API key. No open questions at the checkpoint; next layer is the API routes (Task 15+).
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** spec tasks + parallel sub-agents + git (branch per person)
- **What we did:** Built the API layer (Tasks 15, 17, 18) on an `api` branch while teammates worked `ai` and `ui` branches: session + shared role guard, offers/ERG/liaison dashboard, and accept/decline + advisor approval routes, with their optional unit tests. Routes stay thin (validate → authorize → core/repo → JSON) and every eligibility/capacity/visibility decision goes through the pure core (canAccept, visibleToCompany, applyHardFilters/rankMatches).
- **What happened (good or bad):** Dependency note: the task DAG serialized 15/17/18 behind the AI-layer wave, but they only need core + data, so we ran them early in parallel — fine because routes import the AI module only where needed (none of these do). One design call worth recording: there is no persisted Match linking an ask to an offer, so the accept/decline routes take an explicit `offerId` and the capacity gate derives already-committed group sizes conservatively from `accepted` timeline events. After each top-level task we merged origin/main (picking up the ai and ui branches) with no conflicts; suite grew 131 → 144 → 165 → 178 tests, all green.
- **Screenshot:**

- **Time:** Afternoon
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** spec tasks + sub-agents + an end-to-end demo test
- **What we did:** Built the asks composer and supplies pages (Task 24), then wired the PROJECT_BRIEF section 10 demo path across every page and route (Task 26). Pages now call the real API route handlers in-process through one helper (`src/app/_lib/call-api.ts`), there is one session cookie (`quippe_session`), and a structure test fails if any page imports `lib/data` or `lib/core`. `tests/unit/demo-path.test.ts` runs the whole 7-step demo script through the real routes on the mock AI.
- **What happened (good or bad):** Tracing the demo through the code before building found bugs that unit tests had not: (1) `.gitignore`'s `coverage/` pattern silently hid the `/api/supplies/coverage` route, so it was never committed; (2) nothing ever set an ask to `matched`, so a composed ask could never be accepted; (3) the min-age filter compared a student age (14) with the club's founding age (2-5 years), so no lab tour ever matched; (4) coverage matched by category only and filled "pipette tips" with inoculation loops, and could never fill count items like tubes and gloves; (5) a flammable seed item was marked safe for high schools; (6) accept events were written twice to the org timeline, which doubled capacity use. All fixed with tests. A production build also caught that server actions imported by client components got their own copy of the in-memory store, so approvals didn't show up; the pages now pass actions down as props. Suite: 247 → 303 tests.
- **Screenshot:**

- **Time:** 2026-10-24 16:10 EDT
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** Bugfix spec (spec-driven, `.kiro/specs/shared-repo-singleton`) + PBT
- **What we did:** Fixed a dev-server bug with a Bugfix spec. Under `npm run dev`, writes made on one route were invisible on the others. Confirming 3 asks on `/asks/new` reported "Submitted and already matched to an offer", but `GET /api/company/co-harborview/dashboard` showed none of them and the `/org/org-liss` timeline had only seed events. The unit tests all passed because each test file evaluates the data module once in one process. Root cause: the repository singleton in `src/lib/data/repo.ts` was a module-scoped `let repoInstance`. Next 14.2.35 dev inlines `repo.ts` into each of 13 server entry bundles, and `NextJsRequireCacheHotReloader` drops `webpack-runtime.js` and the app bundles from `require.cache` after every compile. Each re-evaluation started with `repoInstance = null` and built a fresh store from the seed, so the first visit to a newly compiled page discarded every earlier write. This is the same class of problem as the earlier production-build finding where server actions imported by client components got their own copy of the store. Fix: the singleton now lives on `globalThis.__quippeRepo` through a typed cast, and `getRepo()` creates it only when the slot is empty. `createRepoFromSeed()`, the `Repo` interface, seed validation, and the expired-item filter are unchanged, and no call site changed.
- **What happened (good or bad):** The spec made us state the bug condition precisely: a write and a later read go through different evaluations of `repo.ts` in one process. That turned into a test we could run without a dev server. The exploration test uses `vi.resetModules()` plus a dynamic import to get two module graphs, and also confirms asks through the real `POST /api/asks/confirm` in graph A, then reads the org and dashboard routes from graph B. On the unfixed code it failed 4 of 4, which confirmed the root cause before we touched `repo.ts`. Counterexamples: `B.getRepo()` was a different object, `getAsk` returned `null`, fast-check shrank to `[[{"kind":"saveAsk","n":1}]]` (a single saved ask is enough), and the org timeline from graph B had only seed refs. The 6 preservation tests (fresh-repo isolation, malformed seed still throws, expiry filter, same-evaluation round trip) passed before and after the fix. After the fix: `npm run lint` clean, `npm test` 34 files and 313 tests passed. `tests/unit/repo-singleton.test.ts` (10 tests) stays in the suite as the regression test. Known trade-off: editing `repo.ts` itself while `next dev` runs keeps the old instance until the dev server restarts.
- **Screenshot:**
- **Time:** 2026-10-24 17:17 EDT
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** steering (design system) + parallel sub-agents + UI vibe coding
- **What we did:** Wrote `.kiro/steering/design.md`, a visual design system derived from the static mockups in `docs/design/*.html` (and their `.png` renders): `landing.html`, `company-dashboard.html`, `supplies.html`, and `club.html`. The steering file pins the Schibsted Grotesk font (loaded via `next/font/google` in `layout.tsx`), the color tokens (`ink`, `muted`, `line`, `bench`, `pen`, `done`, `needed`, plus `graphite`), sentence case with no all-caps labels and no "·" separators, 6px control / 8px panel radii, no shadows for elevation (regions are separated with the `line` border and the `bench` background), lists of records rendered as HTML tables rather than stacks of cards, and the rule that color carries status only. It has `inclusion: fileMatch` on `src/app/**,src/components/**`, so it loads automatically whenever Kiro edits a UI file and never while touching core, data, or API code. Parallel sub-agents then used it to restyle the company dashboard, supplies, and club pages and to build the new landing page at `/`. A decision we recorded: `/` is now the marketing landing page, and `/login` stays the demo account picker so "Switch demo account" keeps working for every role.
- **What happened (good or bad):** The shared steering file kept four pages consistent without re-explaining the system to each worker. Where the mockups showed data the API does not provide, we adapted or omitted rather than inventing numbers: the sidebar nav shows labels without the counts the mockup drew, "Companies you've worked with" and inter-city distances were dropped because no route returns them, and the account box shows only the org/company name and role the session already carries. A truthfulness fix came out of the sweep: the dashboard header read "Sorted by fit, then date", but the dashboard route orders matches by score descending and then by ask id (never by date), so the copy was corrected to "Sorted by fit" instead of changing the ordering. The landing checkmark draw-on animation is disabled under `prefers-reduced-motion`. Final suite: `npm run lint` clean, `npm test` 338 tests across 37 files, and `npm run build` passed.
- **Screenshot:**

## Powers and MCP

- **Time:** 2026-10-24 18:44 EDT
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** power (Context7)
- **What we did:** Used the Context7 power to look up the Next.js 14 docs (`/vercel/next.js`, v14.3.0-canary.87) and the Vercel docs (`/websites/vercel`) on whether in-memory state is shared across serverless functions. Wrote `docs/deployment-notes.md` from what it returned.
- **What happened (good or bad):** Good. Context7 returned the exact passages we needed instead of us guessing: Vercel creates an invocation per request, shares global state only inside one instance, scales to zero, and still has cold starts, and the Next.js self-hosting docs say to replace the in-memory cache when running more than one instance. That explains why the live demo resets even after the `shared-repo-singleton` fix, which only covers one process. It also gave us the production plan: Postgres from the Vercel Marketplace behind our existing `Repo` interface, with `attachDatabasePool` from `@vercel/functions`.
- **Screenshot:**

- **Time:** 2026-10-24 18:59 EDT
- **Who:** Nico
- **Kiro tool:** IDE
- **Feature:** MCP (Playwright)
- **What we did:** Added the Playwright MCP server to `.kiro/settings/mcp.json` and had Kiro drive the full demo path against `localhost:3000` at 1280x800: landing, login, club officer, new ask (3 asks drafted and confirmed), supply planner (DNA extraction and gel electrophoresis, 25 people), company liaison accepting the ERG meetup ask, club advisor approving the pending request, and the club officer writing the handoff summary.
- **What happened (good or bad):** It ran, and every step passed. Getting it connected took two fixes: the config needed the full path `/opt/homebrew/bin/npx` (plus a `PATH` env) because Kiro could not find `npx` on its own, and the Kiro window had to be reloaded before the tools showed up. During the run, the MCP snapshot tool sometimes read a stale page after Next.js client-side navigation, and one browser session hung on screenshots until we restarted it. Driving each step with Playwright code through the same MCP server (`browser_run_code`, waiting for each redirect) made it reliable. The only console error was a missing `favicon.ico` (404).
- **Screenshot:** `docs/screenshots/01-landing.png` through `docs/screenshots/14-handoff-summary.png`
