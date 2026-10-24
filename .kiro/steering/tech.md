---
inclusion: always
---

# Tech stack and conventions

The team has one day and mixed experience (strong in Python, R, and SQL; less in frontend). Prefer boring, well-documented choices and the simplest thing that works.

## Stack
- **Framework:** Next.js (App Router) with TypeScript in strict mode.
- **UI:** Tailwind CSS. Keep components simple; no component library unless it saves real time.
- **Validation:** zod for every API input, every AI output, and the seed data.
- **Data:** a repository interface (`src/lib/data/repo.ts`) backed by an in-memory store loaded from `src/lib/data/seed.json` at startup. Resetting on restart is fine for the demo. Do not add a database unless asked.
- **AI:** a provider interface (`src/lib/ai/provider.ts`) with two implementations:
  - `mock`: returns canned, schema-valid responses. Default when no API key is set, used in all tests, and the offline demo backup.
  - `live`: calls the model chosen by environment variables (`AI_PROVIDER`, `AI_MODEL`, plus the provider's key). Amazon Bedrock or the Anthropic API.
- **Tests:** Vitest for unit tests, fast-check for property-based tests.
- **Deploy:** Vercel (or AWS Amplify). Must run with zero secrets using the mock provider.

## Conventions
- Business logic (matching, safety rules, unit conversion, coverage) lives in pure functions under `src/lib/core/`. No I/O, no randomness, no `Date.now()` inside them; pass the current date in as an argument.
- API routes are thin: validate input with zod, call core functions and the repo, return JSON.
- Every AI call goes through `src/lib/ai/` with: a zod output schema, one retry that includes the validation error, and a typed fallback result the UI can handle.
- Never put secrets in code or commit `.env` files. Commit `.env.example`.
- Name things after the domain: `Ask`, `Offer`, `Match`, `InventoryItem`, `Organization`, `Company`, `Erg`, `TimelineEvent`.
- Small commits with clear messages.

## Commands (keep these working)
- `npm run dev`: start locally.
- `npm test`: unit and property-based tests.
- `npm run lint`: lint and type-check.
- `npm run seed:check`: validate `seed.json` against the zod schemas.

## Never
- Never add `.kiro/` to `.gitignore`. It must be committed for the hackathon.
- Never use real company names, logos, or real people in code, seed data, or UI.
- Never let AI output decide safety, eligibility, or matching on its own.
