# Quippe — Project Brief

> **Working name.** Rename freely.
> **How to use:** open a new **Spec** session in Kiro, paste this whole file, and ask Kiro to generate requirements (EARS format), then design, then tasks. Review and edit each stage before moving on.

---

## 1. One-line pitch

Grants fund schools. Nobody funds the student-run clubs. Quippe is one front door between student-run STEM clubs and Massachusetts biotech companies: surplus lab supplies, lab tours, speakers, and meetups with employee resource groups (ERGs, the employee-led affinity groups inside companies), all coordinated through one company liaison.

## 2. The problem

- Student-run clubs (high school clubs, undergraduate clubs, small undergraduate labs) get supplies and industry access by cold-emailing companies. Most emails go unanswered.
- Existing equipment programs and state grants serve public schools through teachers. Student-run clubs cannot apply.
- Companies receive scattered one-off requests with no way to batch, track, or prioritize them. Surplus consumables are often thrown out when labs consolidate or close.
- Club leadership turns over every year, so relationships with companies are lost.

## 3. Users and roles

| Role | Who | Main jobs |
|---|---|---|
| Club officer | Student leader of an organization | Writes asks, reviews matches, runs the org page, generates the handoff summary |
| Club advisor | Adult advisor (required for high school clubs) | Approves in-person requests; is the contact point for anything involving minors |
| Club member | Student in an organization | Views the org page and upcoming events (read-only in MVP) |
| Company liaison | One named staff member per company | Manages offers and inventory, reviews matched asks, accepts or declines |
| ERG lead | Leader of an employee resource group | Opts the ERG in, describes who they want to meet, joins accepted events |

## 4. Core concepts

- **Organization**: type is one of `high_school_club`, `college_club`, `undergrad_lab`, `community_org`. Has name, school, city, size, mission statement, `under_resourced` flag, and an advisor (required when type is `high_school_club`).
- **Company**: name, city, liaison, ERGs, offers, inventory.
- **ERG**: belongs to a company. Name, description, topics and student communities it wants to meet, capacity per semester.
- **Offer**: what a company makes available. Type is one of `supplies`, `lab_tour`, `speaker`, `erg_event`. Fields: capacity (max students), available dates or cadence, `in_person` or `virtual`, city, minimum age (optional), notes.
- **Ask**: what an organization requests. Created from free text, stored as structured fields. Status: `draft`, `pending_advisor_approval`, `open`, `matched`, `accepted`, `declined`, `completed`.
- **Match**: links an ask to an offer (or to inventory items). Has a score and human-readable reasons.
- **InventoryItem**: name, category, quantity, unit, expiry date, hazard class, `hs_safe` boolean, company.
- **TimelineEvent**: every ask, match, visit, and donation, attached to the organization so history survives officer turnover.

## 5. MVP features (must work in the demo)

### F1. Demo accounts and roles
- THE SYSTEM SHALL provide seeded demo accounts for every role, chosen from a login screen. No real sign-up in the MVP.
- WHEN a user signs in, THE SYSTEM SHALL show only the views allowed for their role.

### F2. Organization profile and memory
- THE SYSTEM SHALL show an organization page with its profile and a timeline of all asks, matches, visits, and donations.
- WHEN an officer clicks "Generate handoff summary", THE SYSTEM SHALL write a summary for next year's officers using only timeline records: active company relationships, contacts by role, open asks, and what worked.

### F3. Company offers and liaison dashboard
- THE SYSTEM SHALL let a liaison create and edit offers of each type.
- THE SYSTEM SHALL show the liaison incoming matched asks, sorted by score, each with its match reasons.
- WHEN a liaison accepts or declines an ask, THE SYSTEM SHALL update its status and add an event to both the organization's and the company's timelines.

### F4. ERG opt-in
- THE SYSTEM SHALL let an ERG lead create an ERG profile under their company and post `erg_event` offers.
- ERG offers are open to any organization whose ask fits. Matching uses the organization's own mission and ask text compared with the ERG's description. THE SYSTEM SHALL NOT store or filter on students' personal identity attributes.

### F5. Ask composer with AI structuring
- WHEN an officer submits free text, THE SYSTEM SHALL use the AI to split it into one or more structured asks (type, group size, preferred dates, in-person or virtual, topic, whether supplies are needed) validated against a schema.
- WHEN the AI output fails validation, THE SYSTEM SHALL retry once with the validation error, then fall back to a pre-filled manual form.
- THE SYSTEM SHALL require the officer to review and confirm before any ask is submitted. The AI never submits.
- WHEN the organization is a `high_school_club` and the ask is in person, THE SYSTEM SHALL set status to `pending_advisor_approval` and hide it from companies until the advisor approves.

### F6. Experiment → supplies → adapted protocol (the demo "wow")
- WHEN an officer describes an experiment and group size, THE SYSTEM SHALL use the AI to produce a bill of materials (BOM) as JSON: item, category, quantity, unit, purpose.
- THE SYSTEM SHALL run a deterministic matcher that compares the BOM to available inventory across companies (name normalization, category, unit conversion) and produces a coverage report: each line marked covered, partial, or missing, with which company supplies what.
- THE SYSTEM SHALL then use the AI to write a protocol adapted to the matched items and quantities. The protocol may reference only items in the coverage report and must list gaps.
- WHEN the organization is a `high_school_club`, THE SYSTEM SHALL exclude every item where `hs_safe` is false and show "Advisor must review before running" on the protocol.

### F7. Inventory upload
- WHEN a liaison uploads a messy CSV of surplus items, THE SYSTEM SHALL use the AI to normalize rows into InventoryItems and show them in an editable review table before saving.
- `hs_safe` SHALL be decided by deterministic rules (hazard class plus a keyword list), not by the AI alone. If the AI and the rules disagree, the item is marked not `hs_safe`.
- THE SYSTEM SHALL never show expired items.

### F8. Matching engine
- Deterministic, pure functions.
- Hard filters: offer type, remaining capacity ≥ group size, date overlap, minimum age, in-person distance limit (straight-line distance between city coordinates from a seed table), high school rules, hazard rules, expiry.
- Soft score: topic fit (keyword overlap or embeddings), distance, `under_resourced` flag, and fairness (organizations with no past matches rank higher).
- Every match includes plain-language reasons.

### F9. Safety and privacy (cross-cutting)
- Company users SHALL NOT message high school student members directly. All contact goes through the advisor or the organization account.
- No personal identity attributes are stored about students. Organizations describe their own mission.
- All seed companies, people, and schools are fictional. No real company names or logos anywhere.

## 6. Nice-to-have (only after the MVP works)
- Pooled pickup: group a company's accepted supply asks into one pickup list with a suggested route order.
- Spanish UI toggle.
- Calendar view of recurring tours.
- Mocked email notifications.

## 7. Out of scope
Real authentication and sign-up, payments, chat, real email, mobile app, tax receipts.

## 8. AI design rules
- The AI is a translator, not the decider. It turns text into schema-validated JSON and writes prose from database records. Deterministic code makes every matching, safety, and eligibility decision.
- Every AI call has a schema (zod), validation, one retry with the error message, and a manual fallback.
- The AI never invents inventory, companies, contacts, or past events. Prompts include only the records it may use, and outputs that reference unknown IDs are rejected.
- A provider interface lets the team switch model or provider by environment variable. A mock provider with canned responses is used in tests and as an offline demo backup.

## 9. Correctness properties (for property-based tests)
1. For any inventory and any ask, an item with `hs_safe = false` never appears in a match or protocol for a `high_school_club`.
2. An in-person ask from a `high_school_club` never reaches a company dashboard while its status is `pending_advisor_approval`.
3. The total group size of accepted asks for an offer in a period never exceeds the offer's capacity.
4. Allocated quantity of an inventory item across all asks never exceeds the available quantity.
5. Expired items never appear in matches.
6. Matching is deterministic: identical inputs produce identical ranked output.
7. Unit conversions round-trip within tolerance (µL ↔ mL ↔ L, mg ↔ g).
8. A coverage report says "fully covered" if and only if every BOM line's allocated quantity ≥ needed quantity.
9. Generated protocols and handoff summaries reference only IDs present in their inputs.

## 10. Demo script (target under 2.5 minutes)
1. Sign in as the officer of a fictional college club, "Latinos in STEM, Commonwealth State University."
2. Type: "We're a 25-person first-gen club. We want to run a DNA extraction and gel electrophoresis workshop, visit a real lab, and meet people in industry who share our background."
3. The AI splits it into a supplies ask, a lab tour ask, and an ERG meetup ask. The officer confirms.
4. Supplies: the coverage report shows most items covered across two companies, two missing, and an adapted protocol.
5. Switch to the liaison at a fictional company, "Harborview Therapeutics." The dashboard shows the tour ask with reasons, and the company's Latino professionals ERG has an open offer that fits. Accept.
6. Switch to a high school advisor. An in-person request waits for approval. Approve it. Show that hazardous items never appear in that club's supply list.
7. Back to the officer: the timeline shows everything. Click "Generate handoff summary."

## 11. Seed data
- 3 fictional companies in Boston, Cambridge, and Worcester. Each has a liaison, 1–2 ERGs, 3–4 offers, and 12–20 inventory items, including at least 3 hazardous items (for example ethidium bromide, unpolymerized acrylamide, phenol-chloroform) and 2 expired items.
- 4 fictional organizations: a college affinity STEM club, a high school biology club with an advisor, a synthetic biology student team, and a small undergraduate lab.
- A table of coordinates for about 15 Massachusetts cities.
- About 6 past timeline events for the college club so the handoff summary has history.

## 12. Hackathon submission requirements
- Public GitHub repository with the `.kiro` folder at the root, committed, and NOT in `.gitignore`.
- README: what it does, how to run it locally, environment variables, demo logins, challenge track.
- Deployed URL with demo logins in the testing instructions.
- No third-party trademarks, logos, or copyrighted material. All seed data fictional.
- Demo video under 3 minutes.
