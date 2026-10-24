# Quippe

Quippe is one front door between student-run STEM organizations and biotech companies. Grants fund schools, but the student-run clubs (high school clubs, college clubs, and small undergraduate labs) usually cold-email companies for help and most of those emails go unanswered. Quippe lets a club write a plain-language ask and have it matched to what a company can offer: surplus lab supplies, lab tours, speakers, and meetups with a company's employee resource groups (ERGs). Each company has one liaison who reviews matched asks and accepts or declines. The AI structures free text and drafts prose; deterministic code makes every matching, safety, and eligibility decision, and nothing is submitted without a person confirming it. Safety for minors is built in: in-person asks from high school clubs wait for advisor approval, and items not marked safe for high schools never reach them.

## Live demo

https://quippe.vercel.app

The live site keeps its data in memory and resets, for example on cold starts or between serverless instances, so a write made in one step may not be visible in the next. To run the full demo path end to end, run it locally.

## Run locally

No secrets are needed. The mock AI provider is the default: when no provider key is set, the app uses canned, schema-valid responses, so it runs offline with zero configuration (see `.env.example` and `.kiro/steering/tech.md`). A live provider (Anthropic or Amazon Bedrock) is used only when you set `AI_PROVIDER` and the matching key.

```
npm install
npm run dev        # open http://localhost:3000
npm test           # unit and property-based tests
```

`package.json` sets no Node engine requirement. A current LTS release of Node is fine.

## Demo accounts

Pick a role on `/login`. There is no sign-up and no password: selecting an account signs you in and routes you to that role's landing page. One account is shown per role.

| Role | Organization or company | What it shows |
|---|---|---|
| Club officer | Latinos in STEM Society (Commonwealth State University) | Lands on the club page at `/org/org-liss` with the profile and timeline. Nav has Club page, New ask, and Supply planner. Write asks, review matches, and generate the handoff summary. |
| Club advisor | Northgate High Biology Club (Northgate High School) | Lands on the approval queue at `/advisor`. Nav has Approval queue and Supply planner. Approve or reject in-person requests from the high school club. |
| Club member | Latinos in STEM Society (Commonwealth State University) | Lands on the club page at `/org/org-liss`, read-only. Nav has Club page only. |
| Company liaison | Harborview Therapeutics (Boston) | Lands on the Matched asks dashboard at `/company/co-harborview`. Manage offers and inventory, and accept or decline matched asks. |
| ERG lead | Harborview Therapeutics (Boston) | Lands on the company page at `/company/co-harborview`. Opt the employee resource group in and post ERG events. |

## Three-minute demo path

1. Sign in as the club officer of Latinos in STEM Society, Commonwealth State University.
2. On New ask, type: "We're a 25-person first-gen club. We want to run a DNA extraction and gel electrophoresis workshop, visit a real lab, and meet people in industry who share our background."
3. The AI splits it into a supplies ask, a lab tour ask, and an ERG meetup ask. Review and confirm.
4. Open Supply planner: the coverage report shows most items covered across two companies, a couple missing, and an adapted protocol.
5. Use Switch demo account to sign in as the liaison at Harborview Therapeutics. The Matched asks dashboard shows the tour ask with its reasons, and the company's Latino Professionals Network ERG has an open offer that fits. Accept it.
6. Switch demo account to the high school advisor. An in-person request waits in the approval queue. Approve it, and note that items not safe for high schools never appear in that club's supply list.
7. Back as the officer, the club page timeline shows everything. Click Generate handoff summary.

## Challenge track: Civic Action (Better college experiences; Pathways to education and opportunity)

## How we used Kiro

### Spec-driven development

The MVP was built from a spec at `.kiro/specs/open-bench-mvp`: [requirements.md](.kiro/specs/open-bench-mvp/requirements.md) in EARS format, [design.md](.kiro/specs/open-bench-mvp/design.md), and [tasks.md](.kiro/specs/open-bench-mvp/tasks.md). The task plan has 26 top-level tasks, split into waves by a dependency graph. (The spec folder keeps its original name, open-bench-mvp, from before the app was renamed to Quippe.)

### Bugfix spec

A second spec at `.kiro/specs/shared-repo-singleton` fixed a dev-server bug: writes made on one route were invisible on the others under `next dev`, because each server bundle evaluated `repo.ts` on its own and built a fresh in-memory store, discarding earlier writes. See [bugfix.md](.kiro/specs/shared-repo-singleton/bugfix.md) and [design.md](.kiro/specs/shared-repo-singleton/design.md). A failing exploration test reproduced the root cause before any code changed; the fix keeps the single repository on `globalThis`, and preservation tests guard against a regression.

### Steering files

Five steering files in `.kiro/steering` shaped the work:

- [product.md](.kiro/steering/product.md): what Quippe is, the roles, and product principles such as safety for minors and "AI suggests, people confirm".
- [tech.md](.kiro/steering/tech.md): the stack and conventions, including zod validation, pure core functions, and the mock-first AI provider.
- [structure.md](.kiro/steering/structure.md): the project layout and import rules between layers.
- [ai-rules.md](.kiro/steering/ai-rules.md): rules for AI code and prompts, loaded by fileMatch on `src/lib/ai/**`.
- [design.md](.kiro/steering/design.md): the visual design system derived from the mockups, loaded by fileMatch on UI files (`src/app/**`, `src/components/**`).

### Sub-agents

Spec tasks were executed by spec-task-execution sub-agents, and parallel workers handled the UI refresh, restyling the dashboard, supplies, and club pages at the same time.

### Tests

`npm test` runs 363 tests across 40 files, including property-based tests written with fast-check. The property tests live in `tests/properties/`, with one file per correctness property group in PROJECT_BRIEF section 9 (`prop01`–`prop09`): HS-safe exclusion, pending asks hidden, capacity invariant, allocation invariant, expiry exclusion, matching determinism, unit round-trip, coverage biconditional, and id-scope. A tenth property file covers the matching hard filters and soft score.

### Running log

A running log of how Kiro was used is in [docs/kiro-log.md](docs/kiro-log.md).
