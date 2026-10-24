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
