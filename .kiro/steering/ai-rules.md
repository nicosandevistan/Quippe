---
inclusion: fileMatch
fileMatchPattern: "src/lib/ai/**"
---

# Rules for AI code and prompts

- The model is a translator. It turns free text into JSON matching a zod schema, or writes prose from records it is given. It never makes safety, eligibility, or matching decisions.
- Every prompt lists the exact records the model may use, each with its ID. Every output that references an ID not in that list is rejected.
- Output must be JSON only, no prose around it, for structuring tasks. Parse, validate with zod, retry once with the validation error appended, then return the typed fallback.
- Protocols must say which BOM lines are missing and must include "Advisor must review before running" for high school clubs.
- Handoff summaries use only timeline events passed in. No guessing about contacts or outcomes.
- Keep prompts in their own files (`src/lib/ai/prompts/*.ts`) as exported template functions, not inline strings in route handlers.
- Every new prompt gets a matching canned response in the mock provider so tests and the offline demo keep working.
