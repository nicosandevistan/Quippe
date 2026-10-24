# How to use this folder with Kiro

## 1. Set up the repo (5 minutes)
1. Create a new public GitHub repo.
2. Copy everything in this folder into the repo root, including the hidden `.kiro` folder. On Mac, press Cmd+Shift+. in Finder to see hidden folders.
3. Open the repo in the Kiro IDE.
4. Check that `.kiro/` is not listed in `.gitignore`. Commit and push.

## 2. What each file does
- `PROJECT_BRIEF.md`: the full scope. You paste this into a Kiro spec session.
- `.kiro/steering/product.md`: what the product is and its rules. Kiro reads it on every request.
- `.kiro/steering/tech.md`: the stack and coding conventions. Kiro reads it on every request.
- `.kiro/steering/structure.md`: folder layout. Kiro reads it on every request.
- `.kiro/steering/ai-rules.md`: rules for AI prompt code. Kiro reads it only when working in `src/lib/ai/`.
- `docs/kiro-log.md`: where the team logs Kiro usage all day for the write-up.

## 3. Generate the spec (first 30–45 minutes)
1. In Kiro, start a new **Spec** session.
2. Paste: "Build the project described in PROJECT_BRIEF.md. Start with requirements in EARS format for the MVP features F1–F9 only. Skip nice-to-haves."
3. Review the requirements. Edit anything wrong before approving. Then approve the design, then the task list.
4. Screenshot each stage for the write-up.

Consider splitting into three smaller specs so team members can work in parallel:
- **Core + data:** schemas, seed data, matching engine, safety rules, unit conversion, all property-based tests.
- **AI layer:** provider interface, mock provider, ask structuring, BOM, protocol, inventory normalization, handoff summary.
- **UI:** login picker, org page, ask composer, supplies flow, liaison dashboard, advisor queue.

## 4. Turn on property-based tests
When Kiro writes the design, ask it to map each property in brief section 9 to a fast-check test. Log any bug a property test catches. That's one of the strongest things you can put in the write-up.

## 5. Hooks to create (in the Kiro hooks panel)
Create these with Kiro's hook UI so they are saved under `.kiro/hooks/`:
- **On save in `src/lib/core/**`:** run the related unit and property tests and report failures.
- **On save in `src/lib/schemas/**`:** run `npm run seed:check` so the seed data never drifts from the schemas.
- **On save in `src/lib/ai/prompts/**`:** check that the mock provider has a canned response for every prompt.
- **Manual "Update README" hook:** regenerate the run instructions, environment variables, and demo logins section of the README.

## 6. MCP ideas (pick one)
- GitHub MCP server, to open issues from the task list and keep team members on separate tasks.
- A fetch or documentation MCP server, so Kiro can read Next.js, zod, and fast-check docs instead of guessing.

## 7. Before 8 PM
- `npm test` passes, the app runs with no API key (mock provider), and it is deployed.
- README has demo logins and the challenge track.
- The demo video is under 3 minutes, uses only fictional names, and has no copyrighted music.
- `docs/kiro-log.md` checklist is answered, and the write-up is pasted into the submission form.
