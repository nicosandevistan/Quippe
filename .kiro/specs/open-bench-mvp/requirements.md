# Requirements Document

## Introduction

Open Bench is a single coordination front door between student-run STEM organizations (high school clubs, college clubs, small undergraduate labs, community organizations) and Massachusetts biotech companies. Companies offer surplus lab supplies, lab tours, speakers, and meetups with employee resource groups (ERGs). Each company is represented by one liaison who manages its offers and inventory.

This document specifies the Minimum Viable Product (MVP) scope only: features F1 through F9 from `PROJECT_BRIEF.md` section 5. Nice-to-have items (pooled pickup, Spanish UI toggle, calendar view, mocked email notifications) and out-of-scope items (real authentication and sign-up, payments, chat, real email, mobile app, tax receipts) are explicitly excluded.

The product follows four governing principles that shape every requirement below:

1. **Safety first for minors.** High school in-person asks require advisor approval before any company sees them. Company users never message high school student members directly. Items not marked `hs_safe` never reach high school clubs.
2. **AI suggests, people confirm.** The AI structures free text into schema-validated JSON and drafts prose from supplied records only. Deterministic code makes every matching, safety, and eligibility decision. Nothing is submitted without a human confirmation.
3. **Never invent records.** AI output may reference only records passed to it; outputs referencing unknown identifiers are rejected.
4. **No identity data about students.** Organizations describe their own mission. ERG offers are open to any organization whose ask fits.

Accessibility (WCAG AA) applies across all user-facing views.

## Glossary

- **System**: The Open Bench application, comprising its user interface, API routes, deterministic core logic, AI provider layer, and in-memory data store.
- **Organization**: A student-run group with a type of `high_school_club`, `college_club`, `undergrad_lab`, or `community_org`. Has a name, school, city, size, mission statement, `under_resourced` flag, and (required for `high_school_club`) an advisor.
- **Company**: A biotech company with a name, city, one liaison, ERGs, offers, and inventory.
- **Erg**: An employee resource group belonging to a Company. Has a name, description, the topics and student communities it wants to meet, and a capacity per semester.
- **Offer**: Something a Company makes available. Offer type is one of `supplies`, `lab_tour`, `speaker`, `erg_event`. Fields include capacity (maximum students), available dates or cadence, delivery mode (`in_person` or `virtual`), city, optional minimum age, and notes.
- **Ask**: A request created by an Organization from free text and stored as structured fields. Ask status is one of `draft`, `pending_advisor_approval`, `open`, `matched`, `accepted`, `declined`, `completed`.
- **Match**: A link between an Ask and an Offer (or between an Ask and inventory items), carrying a numeric score and plain-language reasons.
- **InventoryItem**: A surplus supply record with a name, category, quantity, unit, expiry date, hazard class, `hs_safe` boolean, and owning Company.
- **TimelineEvent**: A record of an ask, match, visit, or donation, attached to an Organization so history survives officer turnover.
- **Club_Officer**: A student leader who writes asks, reviews matches, and runs the organization page.
- **Club_Advisor**: An adult advisor, required for high school clubs, who approves in-person requests.
- **Club_Member**: A student who views the organization page in read-only mode.
- **Company_Liaison**: One named staff member per company who manages offers and inventory and accepts or declines matched asks.
- **Erg_Lead**: The leader of an ERG who opts the ERG in and posts `erg_event` offers.
- **BOM**: Bill of materials; the structured list of supplies an experiment needs, each line having item, category, quantity, unit, and purpose.
- **Coverage_Report**: A result marking each BOM line as covered, partial, or missing, with the supplying company named.
- **Handoff_Summary**: A year-end prose summary of an organization's relationships, generated from timeline records for the next officers.
- **Matching_Engine**: The set of deterministic pure functions that apply hard filters and compute soft scores to rank matches.
- **Ask_Composer**: The AI-assisted flow that converts an officer's free text into one or more schema-validated structured asks.
- **Inventory_Normalizer**: The AI-assisted flow that converts a messy CSV into structured InventoryItems for review.
- **AI_Provider**: The provider interface with a `mock` implementation (canned, schema-valid responses) and a `live` implementation selected by environment variables.
- **hs_safe**: A boolean on an InventoryItem indicating whether the item may be offered to a high school club.
- **under_resourced**: A boolean flag on an Organization used to raise its soft score in matching.
- **Seed_City_Table**: A seed table of Massachusetts city coordinates used to compute straight-line distance for in-person offers.

## Requirements

### Requirement 1: Demo accounts and role-based views (F1)

**User Story:** As any user, I want to sign in by picking a seeded demo account, so that I can use the product in the demo without real sign-up.

#### Acceptance Criteria

1. THE System SHALL present a login screen offering exactly one seeded demo account for each of the five roles: Club_Officer, Club_Advisor, Club_Member, Company_Liaison, and Erg_Lead.
2. THE System SHALL NOT provide any real sign-up, registration, or credential-creation flow.
3. WHEN a user selects a demo account and signs in, THE System SHALL establish a session bound to that account's role and navigate to that role's default landing view.
4. WHILE a user is signed in, THE System SHALL display only the views and actions permitted for that user's role and SHALL hide or disable all views and actions not permitted for that role.
5. IF a signed-in user requests a view or action not permitted for that user's role, THEN THE System SHALL deny access, display a role-appropriate message indicating the action is not permitted, and leave all application data unchanged.
6. WHEN a signed-in user selects a different seeded demo account, THE System SHALL terminate the current session and establish a new session bound to the selected account's role.

### Requirement 2: Organization profile and timeline (F2)

**User Story:** As a Club_Officer, I want an organization page with a complete timeline, so that history survives officer turnover.

#### Acceptance Criteria

1. THE System SHALL display an organization page showing the organization's profile fields: name, type, school, city, size, mission statement, and `under_resourced` flag.
2. THE System SHALL display, on the organization page, a timeline of every TimelineEvent attached to the organization, covering asks, matches, visits, and donations.
3. WHEN a Club_Member views the organization page, THE System SHALL present the organization page and timeline without any controls to create, edit, or delete the profile fields or any TimelineEvent.
4. THE System SHALL order the timeline by event date in reverse chronological order (most recent first), and WHERE two or more TimelineEvents share the same event date, THE System SHALL order those events deterministically and identically on every page load.
5. IF the organization has no TimelineEvent attached, THEN THE System SHALL display the organization page with the profile fields and an empty-timeline indicator conveying that no events exist.
6. IF a request references an organization that does not exist, THEN THE System SHALL not display an organization page and SHALL return an indication that the organization was not found.

### Requirement 3: AI handoff summary from timeline records only (F2)

**User Story:** As a Club_Officer, I want to generate a handoff summary for next year's officers, so that relationships and open work are not lost.

#### Acceptance Criteria

1. WHEN a Club_Officer selects "Generate handoff summary", THE System SHALL generate a Handoff_Summary containing four sections: active company relationships, contacts grouped by role, open asks, and what worked.
2. WHEN generating the Handoff_Summary, THE System SHALL derive its content using only the TimelineEvent records attached to the Club_Officer's organization, and SHALL NOT use any data source external to those records.
3. THE Handoff_Summary SHALL reference only identifiers present in the TimelineEvent records supplied to the generator. (Correctness Property 9)
4. IF the Handoff_Summary references any identifier not present in its input TimelineEvent records, THEN THE System SHALL reject the generated summary, SHALL NOT display it to the Club_Officer, and SHALL present the typed fallback result in its place.
5. IF no TimelineEvent records are attached to the organization, THEN THE System SHALL present the typed fallback result and SHALL NOT generate a Handoff_Summary.

### Requirement 4: Company offers management (F3)

**User Story:** As a Company_Liaison, I want to create and edit offers, so that I can publish what my company makes available.

#### Acceptance Criteria

1. WHEN a Company_Liaison submits a new Offer whose type is one of `supplies`, `lab_tour`, `speaker`, or `erg_event`, THE System SHALL create the Offer and associate it with the liaison's company.
2. IF a Company_Liaison submits a new Offer whose type is not one of `supplies`, `lab_tour`, `speaker`, or `erg_event`, THEN THE System SHALL reject the submission and display a validation error indicating the offer type is invalid.
3. WHEN a Company_Liaison submits edits to an existing Offer that belongs to the liaison's own company, THE System SHALL save the updated Offer fields.
4. IF a Company_Liaison attempts to edit an Offer that does not belong to the liaison's own company, THEN THE System SHALL reject the edit, leave the stored Offer unchanged, and display an error indicating the liaison is not authorized to edit that Offer.
5. WHEN a Company_Liaison saves an Offer, THE System SHALL validate all Offer fields (type, capacity, available dates or cadence, delivery mode of `in_person` or `virtual`, city, optional minimum age, and notes) against the Offer schema before storing the Offer, where capacity SHALL be an integer from 1 to 10000, minimum age SHALL be an integer from 0 to 25 when provided, and notes SHALL be at most 2000 characters.
6. IF an Offer submission fails schema validation, THEN THE System SHALL reject the submission, leave any existing stored Offer unchanged, and display a validation error for each field that failed validation.

### Requirement 5: Liaison dashboard of matched asks (F3)

**User Story:** As a Company_Liaison, I want incoming matched asks sorted by score with reasons, so that I can prioritize which to accept.

#### Acceptance Criteria

1. WHEN the Company_Liaison opens the liaison dashboard, THE System SHALL display every Ask that the Matching_Engine has matched to one or more of that company's offers and that is not excluded by criterion 6.
2. THE System SHALL sort the displayed matched asks by Match score in descending order, and WHEN two or more displayed asks have equal Match scores, THE System SHALL order those asks deterministically by a stable secondary key so that repeated loads of the same data produce identical ordering.
3. WHEN the dashboard displays a matched ask, THE System SHALL display, for that ask, the plain-language reasons produced by the Matching_Engine.
4. IF the Matching_Engine produced no plain-language reasons for a displayed matched ask, THEN THE System SHALL display that ask with an indication that no reasons are available, rather than omitting the ask.
5. IF no Asks are matched to that company's offers, THEN THE System SHALL display the liaison dashboard with an empty-state indication that no matched asks are available.
6. WHILE an in-person Ask from a `high_school_club` has status `pending_advisor_approval`, THE System SHALL exclude that Ask from the Company_Liaison dashboard. (Correctness Property 2)

### Requirement 6: Accept or decline an ask (F3)

**User Story:** As a Company_Liaison, I want to accept or decline a matched ask, so that the organization knows the outcome and both timelines record it.

#### Acceptance Criteria

1. WHEN a Company_Liaison accepts an Ask whose status is `matched`, THE System SHALL set that Ask's status to `accepted`.
2. WHEN a Company_Liaison declines an Ask whose status is `matched`, THE System SHALL set that Ask's status to `declined`.
3. IF a Company_Liaison attempts to accept or decline an Ask whose status is not `matched`, THEN THE System SHALL reject the action, leave the Ask's status unchanged, and display an error indicating the Ask is not in a state that can be accepted or declined.
4. WHEN a Company_Liaison accepts an Ask, THE System SHALL add one TimelineEvent recording the acceptance to the organization's timeline and one TimelineEvent recording the acceptance to the company's timeline.
5. WHEN a Company_Liaison declines an Ask, THE System SHALL add one TimelineEvent recording the decline to the organization's timeline and one TimelineEvent recording the decline to the company's timeline.
6. WHEN a Company_Liaison accepts an Ask, THE System SHALL evaluate whether the acceptance would cause the total group size of accepted asks for the Offer in the applicable period to exceed the Offer's capacity before changing the Ask's status.
7. IF accepting an Ask would cause the total group size of accepted asks for the Offer in the applicable period to exceed the Offer's capacity, THEN THE System SHALL reject the acceptance, leave the Ask's status unchanged, add no TimelineEvent, and display an error indicating the Offer's capacity would be exceeded. (Correctness Property 3)

### Requirement 7: ERG opt-in and ERG event offers (F4)

**User Story:** As an Erg_Lead, I want to create an ERG profile and post ERG event offers, so that my ERG can meet student organizations whose asks fit.

#### Acceptance Criteria

1. WHEN an Erg_Lead submits an Erg profile with a name of 1 to 120 characters, a description of 1 to 2,000 characters, between 1 and 20 topics, and a capacity per semester that is an integer from 1 to 10,000, THE System SHALL create the Erg profile under that lead's company.
2. IF an Erg_Lead submits an Erg profile where the name, description, topics count, or capacity per semester falls outside its defined bounds, THEN THE System SHALL reject the submission, return an error indicating which field is invalid, and SHALL NOT create the Erg profile.
3. WHILE an Erg profile exists under the Erg_Lead's company, THE System SHALL let that Erg_Lead post Offers of type `erg_event` associated with that Erg.
4. IF an Erg_Lead attempts to post an `erg_event` Offer when no Erg profile exists under that lead's company, THEN THE System SHALL reject the request and return an error indicating that an Erg profile is required.
5. WHEN the Matching_Engine evaluates an `erg_event` Offer against an Ask, THE System SHALL compute a fit score from 0 to 1 using only the organization's own mission text and ask text compared with the Erg description.
6. IF any input to the Matching_Engine, Erg profile, or `erg_event` Offer contains a personal identity attribute of a student, THEN THE System SHALL reject that input and SHALL NOT persist it.
7. THE System SHALL NOT store any personal identity attribute of students.
8. THE System SHALL NOT filter or match on any personal identity attribute of students.

### Requirement 8: Ask composer with AI structuring (F5)

**User Story:** As a Club_Officer, I want to type free text and have it structured into asks, so that I can create well-formed requests quickly.

#### Acceptance Criteria

1. WHEN a Club_Officer submits free text of 1 to 5000 characters, THE System SHALL use the Ask_Composer to split the text into 1 to 20 structured Asks, each containing a type, a group size between 1 and 500, zero or more preferred dates, a delivery mode of either `in_person` or `virtual`, a topic, and a boolean indicating whether supplies are needed.
2. IF a Club_Officer submits free text that is empty or exceeds 5000 characters, THEN THE System SHALL reject the submission, retain the entered text, and display a message indicating the allowed length range.
3. WHEN the Ask_Composer produces structured Asks, THE System SHALL validate each Ask against the Ask schema before presenting any Ask for review.
4. IF one or more Asks fail schema validation, THEN THE System SHALL retry the Ask_Composer exactly once with the specific validation errors included in the retry input.
5. WHEN the Ask_Composer is invoked for structuring or retry, THE System SHALL return either validated Asks or the manual fallback within 30 seconds.
6. IF the retried Ask_Composer output also fails schema validation, OR the Ask_Composer does not return within 30 seconds, THEN THE System SHALL present a manual Ask form pre-filled with any successfully extracted field values and leave invalid or missing fields empty for the Club_Officer to complete.
7. THE System SHALL require the Club_Officer to review and explicitly confirm each individual Ask before that Ask is submitted.
8. IF a Club_Officer has not explicitly confirmed an Ask, THEN THE System SHALL NOT submit that Ask.

### Requirement 9: High school in-person ask approval gating (F5)

**User Story:** As a Club_Advisor, I want in-person high school asks held for my approval, so that no company sees them before I review them.

#### Acceptance Criteria

1. WHEN an Ask becomes confirmed AND its format is in person AND the organization type is `high_school_club`, THE System SHALL set the Ask status to `pending_advisor_approval`.
2. WHILE an Ask has status `pending_advisor_approval`, THE System SHALL exclude that Ask from every company-facing view and query result so that no company account can retrieve or display it. (Correctness Property 2)
3. WHEN a Club_Advisor whose organization matches the Ask's organization approves an Ask with status `pending_advisor_approval`, THE System SHALL set the Ask status to `open`.
4. IF a Club_Advisor whose organization does not match the Ask's organization attempts to approve or reject that Ask, THEN THE System SHALL reject the action, leave the Ask status unchanged, and return an error indicating the advisor is not authorized for that Ask's organization.
5. WHEN a Club_Advisor rejects an Ask with status `pending_advisor_approval`, THE System SHALL set the Ask status to `rejected` and keep the Ask excluded from every company-facing view.
6. WHEN a Club_Advisor opens the approval queue, THE System SHALL present a list of all Asks with status `pending_advisor_approval` belonging to that advisor's organization and no Asks belonging to any other organization.

### Requirement 10: Experiment to bill of materials (F6)

**User Story:** As a Club_Officer, I want an AI-generated bill of materials from my experiment description, so that I can see what supplies an experiment needs.

#### Acceptance Criteria

1. WHEN a Club_Officer describes an experiment of 1 to 2000 characters and a group size from 1 to 500, THE System SHALL use the AI to produce a BOM as JSON containing 1 to 200 lines, where each line has a non-empty item, a non-empty category, a quantity greater than 0, a non-empty unit, and a non-empty purpose.
2. IF a Club_Officer submits an empty or over-length experiment description, or a group size outside the range 1 to 500, THEN THE System SHALL reject the request, retain the entered values, and display a message indicating the allowed ranges.
3. WHEN the AI produces a BOM, THE System SHALL validate it against the BOM schema before using it.
4. IF the BOM output fails schema validation, THEN THE System SHALL retry the AI exactly once with the validation error included.
5. IF the retried BOM output also fails schema validation, THEN THE System SHALL present the typed fallback result with an indication that automatic BOM generation did not succeed.

### Requirement 11: Deterministic coverage report (F6)

**User Story:** As a Club_Officer, I want a coverage report comparing the BOM to available inventory, so that I know what is covered and what is missing.

#### Acceptance Criteria

1. WHEN a BOM is submitted, THE System SHALL run a deterministic matcher that compares each BOM line to the non-expired available InventoryItems across companies using name normalization, category, and unit conversion, such that the same BOM and the same inventory snapshot always produce an identical Coverage_Report.
2. THE System SHALL produce a Coverage_Report marking each BOM line as covered, partial, or missing, and naming the supplying company for each covered or partial line, and naming no supplying company for a missing line.
3. THE Coverage_Report SHALL mark a BOM line "fully covered" if and only if the allocated quantity for that line is greater than or equal to the needed quantity for that line. (Correctness Property 8)
4. THE Coverage_Report SHALL mark a BOM line "partial" when the allocated quantity is greater than 0 and less than the needed quantity, and "missing" when the allocated quantity equals 0.
5. WHEN performing unit conversion, THE System SHALL convert between µL, mL, and L and between mg and g such that converting a quantity to another unit and back returns the original quantity within a relative tolerance of 0.0001 (0.01 percent). (Correctness Property 7)
6. IF a BOM line's unit cannot be converted to a candidate InventoryItem's unit, THEN THE System SHALL exclude that InventoryItem from allocation to that BOM line.
7. THE System SHALL exclude every InventoryItem whose expiry date is earlier than or equal to the match run date from the coverage comparison. (Correctness Property 5)

### Requirement 12: AI adapted protocol (F6)

**User Story:** As a Club_Officer, I want a protocol adapted to the matched items, so that I can run the experiment with what is actually available.

#### Acceptance Criteria

1. WHEN a Coverage_Report is available, THE System SHALL use the AI to generate a protocol adapted to the matched items and their available quantities as recorded in the Coverage_Report.
2. THE System SHALL ensure the generated protocol references only InventoryItem IDs present in the Coverage_Report. (Correctness Property 9)
3. THE System SHALL ensure the generated protocol lists every BOM line marked missing in the Coverage_Report, identifying each by its BOM line identifier.
4. IF the generated protocol references any item ID not present in the Coverage_Report, THEN THE System SHALL reject the protocol, retain the Coverage_Report unchanged, and present the typed fallback result with an indication that the protocol was rejected due to an out-of-scope item reference.
5. WHEN the organization type is `high_school_club`, THE System SHALL exclude every InventoryItem with `hs_safe` equal to false from both the coverage comparison and the generated protocol, such that no excluded item ID appears in either output. (Correctness Property 1)
6. WHEN the organization type is `high_school_club`, THE System SHALL display the exact text "Advisor must review before running" on the protocol.

### Requirement 13: Inventory upload and normalization (F7)

**User Story:** As a Company_Liaison, I want messy CSV rows normalized into inventory items I can review, so that I can add surplus supplies quickly and correctly.

#### Acceptance Criteria

1. WHEN a Company_Liaison uploads a CSV file of up to 10 MB containing up to 5,000 data rows, THE System SHALL use the Inventory_Normalizer to convert each row into a structured InventoryItem.
2. IF an uploaded file exceeds 10 MB or contains more than 5,000 data rows, THEN THE System SHALL reject the upload, retain any previously saved InventoryItems unchanged, and display an error message indicating the size or row-count limit that was exceeded.
3. WHEN the Inventory_Normalizer completes conversion, THE System SHALL present the normalized InventoryItems in a review table in which every field of every item is editable before any item is saved.
4. WHILE the review table is displayed, THE System SHALL NOT persist any InventoryItem until the Company_Liaison performs an explicit confirm action.
5. WHEN the Company_Liaison performs the confirm action on the review table, THE System SHALL persist all displayed InventoryItems and indicate completion to the Company_Liaison.
6. IF the normalization output fails schema validation, THEN THE System SHALL retry the normalization exactly once, passing the validation error to the Inventory_Normalizer.
7. IF the normalization output fails schema validation on the retry, THEN THE System SHALL present a manually editable fallback table containing the uploaded rows and display an error message indicating that automatic normalization did not succeed.

### Requirement 14: Deterministic hs_safe and expiry rules (F7)

**User Story:** As a Company_Liaison, I want hs_safe decided by rules, not by AI alone, so that unsafe items never reach high school clubs.

#### Acceptance Criteria

1. WHEN an InventoryItem is created or its hazard class or description is modified, THE System SHALL compute that item's `hs_safe` value using deterministic rules that evaluate the item's hazard class and match the item's text fields against a configured keyword list, independent of any AI-suggested value.
2. IF the AI-suggested `hs_safe` value and the deterministic rule result disagree for an item, THEN THE System SHALL set that item's `hs_safe` to false and persist false as the authoritative stored value.
3. IF an InventoryItem has a missing or unrecognized hazard class, THEN THE System SHALL set that item's `hs_safe` to false.
4. WHEN the System returns results for any view, list, or match operation, THE System SHALL exclude every InventoryItem whose expiry date is earlier than or equal to the current date, such that no expired InventoryItem appears in any returned results. (Correctness Property 5)

### Requirement 15: Matching engine hard filters (F8)

**User Story:** As a Company_Liaison, I want matches filtered by hard eligibility rules, so that I only see asks my offers can actually serve.

#### Acceptance Criteria

1. THE Matching_Engine SHALL be implemented as deterministic pure functions that receive the current date as an argument and perform no I/O and no randomness.
2. IF an Offer's type is not equal to an Ask's type, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
3. IF an Offer's remaining capacity is less than an Ask's group size, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
4. IF the set of an Ask's preferred dates and the set of an Offer's available dates have no date in common, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
5. WHERE an Offer specifies a minimum age, IF the Ask's organization age is less than the Offer's minimum age, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
6. WHERE an Offer is `in_person`, IF the straight-line distance between the Offer and Ask, computed from Seed_City_Table coordinates, exceeds the in-person distance limit, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
7. WHERE an Offer is `in_person`, IF either the Offer or the Ask has no Seed_City_Table coordinates available, THEN THE Matching_Engine SHALL exclude that Offer-Ask pair from the match results.
8. THE Matching_Engine SHALL exclude every expired InventoryItem from matches. (Correctness Property 5)
9. THE Matching_Engine SHALL exclude every InventoryItem with `hs_safe` equal to false from any match for a `high_school_club`. (Correctness Property 1)
10. IF an InventoryItem violates the hazard rules for a given Ask, THEN THE Matching_Engine SHALL exclude that InventoryItem from the match results for that Ask.

### Requirement 16: Matching engine soft score, reasons, and determinism (F8)

**User Story:** As a Company_Liaison, I want ranked matches with plain-language reasons, so that I can understand and trust the ordering.

#### Acceptance Criteria

1. WHEN the Matching_Engine evaluates a candidate organization, THE Matching_Engine SHALL compute a soft score as a weighted combination of four factors: topic fit, distance, the `under_resourced` flag, and fairness, producing a numeric value in the range 0.0 to 1.0 inclusive.
2. THE Matching_Engine SHALL compute topic fit from keyword overlap or embedding similarity between the ask and the Offer, producing a value in the range 0.0 to 1.0 inclusive.
3. WHERE two or more candidate organizations have equal soft scores, THE Matching_Engine SHALL rank an organization with zero past matches above an organization with one or more past matches.
4. WHEN the Matching_Engine returns a Match, THE Matching_Engine SHALL include one plain-language reason for each of the four scoring factors that contributed to the soft score.
5. IF a required scoring input (topic fit, distance, `under_resourced` flag, or past-match count) is missing or cannot be computed for a candidate organization, THEN THE Matching_Engine SHALL exclude that organization from the ranked output and record a reason indicating which input was unavailable, without failing the overall ranking request.
6. WHEN the Matching_Engine receives two requests with identical inputs, THE Matching_Engine SHALL produce ranked output that is identical in both the set of Matches and their order. (Correctness Property 6)

### Requirement 17: Safety and privacy cross-cutting rules (F9)

**User Story:** As a Club_Advisor, I want student members protected and no student identity data stored, so that the product is safe for minors and respects privacy.

#### Acceptance Criteria

1. THE System SHALL NOT expose any user interface control, messaging endpoint, or contact action that allows a Company_Liaison or Erg_Lead to initiate direct communication (message, comment, invite, or notification) with a high school student member.
2. THE System SHALL route every contact action involving a high school club to the Club_Advisor or the organization account as the sole recipient and reply target.
3. IF a Company_Liaison or Erg_Lead attempts to initiate contact targeted at a high school student member, THEN THE System SHALL reject the action, retain no student-addressed record of the attempt, and return a response indicating that contact must go through the Club_Advisor or organization account.
4. THE System SHALL NOT store any personal identity attribute about a student, where personal identity attribute includes full name, date of birth, home address, personal email address, personal phone number, photograph, and government identifier.
5. IF a request to create or update a student record contains a personal identity attribute as defined in criterion 4, THEN THE System SHALL reject the request, persist none of the submitted identity attributes, and return a response indicating the data is not permitted.
6. THE System SHALL use only fictional companies, people, and schools in seed data.
7. THE System SHALL NOT include any real company name or logo in seed data, user interface assets, or static content.

### Requirement 18: Capacity and allocation invariants (F3, F6, F8)

**User Story:** As a Company_Liaison, I want capacity and inventory limits enforced, so that commitments never exceed what my company can supply.

#### Acceptance Criteria

1. THE System SHALL maintain the invariant that, for any Offer in a period, the sum of group sizes of all accepted asks is less than or equal to that Offer's capacity. (Correctness Property 3)
2. THE System SHALL maintain the invariant that, for any InventoryItem, the sum of allocated quantities across all asks is less than or equal to that item's available quantity. (Correctness Property 4)
3. IF accepting an ask would cause the sum of group sizes of accepted asks for its Offer in the period to exceed that Offer's capacity, THEN THE System SHALL reject the acceptance, leave the Offer's accepted asks unchanged, and display an error message indicating the Offer capacity would be exceeded.
4. IF an allocation would cause an InventoryItem's total allocated quantity to exceed its available quantity, THEN THE System SHALL reject the allocation, leave the InventoryItem's existing allocations unchanged, and display an error message indicating the available quantity would be exceeded.

### Requirement 19: AI provider discipline (F5, F6, F7, cross-cutting)

**User Story:** As a developer, I want every AI call bounded by a schema, retry, and fallback, so that AI behavior is predictable and offline demos work.

#### Acceptance Criteria

1. WHEN any component initiates an AI call, THE System SHALL route the call through the AI_Provider interface such that no AI request bypasses this interface.
2. WHERE no AI provider key is configured, THE System SHALL use the `mock` AI_Provider implementation for all AI calls without requiring any network connectivity.
3. WHEN an AI output is received, THE System SHALL validate the output against its zod schema before the output is used by any downstream component.
4. IF an AI output fails zod schema validation, THEN THE System SHALL retry the AI call exactly once with the validation error included, and reject the output if it fails validation again.
5. THE System SHALL provide a typed fallback result for every AI call that the user interface can handle when validation ultimately fails.
6. IF an AI output references any identifier not present in the set of records supplied as input to that AI call, THEN THE System SHALL reject the output, discard it from downstream use, and return an error indicating an unknown-identifier reference. (Correctness Property 9)
7. THE System SHALL NOT allow any AI output to be the sole determinant of a safety, eligibility, or matching decision, requiring a deterministic non-AI rule to produce every such decision.
