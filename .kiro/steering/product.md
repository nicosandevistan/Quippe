---
inclusion: always
---

# Product: Quippe

Quippe connects student-run STEM organizations (high school clubs, college clubs, small undergraduate labs) with biotech companies. Companies offer surplus lab supplies, lab tours, speakers, and meetups with employee resource groups (ERGs). Each company has one liaison who manages its offers.

The full spec lives in `PROJECT_BRIEF.md` at the repo root. When anything here conflicts with a generated spec, ask before changing behavior.

## Users
- **Club officer**: writes asks, reviews matches, keeps the org page current.
- **Club advisor**: adult; required for high school clubs; approves in-person requests.
- **Club member**: views the org page (read-only).
- **Company liaison**: manages offers and inventory, accepts or declines matched asks.
- **ERG lead**: opts an ERG in and posts ERG events.

## Product principles
1. **Safety first for minors.** High school in-person asks need advisor approval before any company sees them. Company users never message high school members directly. Items not marked `hs_safe` never reach high school clubs.
2. **AI suggests, people confirm.** The AI structures text and drafts prose. Deterministic code makes matching, safety, and eligibility decisions. Nothing is submitted without a human clicking confirm.
3. **Never invent records.** AI output may reference only records passed to it. Reject outputs with unknown IDs.
4. **No identity data about students.** Organizations describe their own mission. ERG offers are open to any organization whose ask fits.
5. **Plain language.** UI copy is short and readable. Explain acronyms on first use (tooltip or parenthetical).
6. **Accessible.** WCAG AA contrast, labeled form fields, full keyboard navigation.
7. **Fictional data only.** No real company names, logos, or people in seed data, screenshots, or the demo.

## Glossary
- **Ask**: a request from an organization (supplies, lab tour, speaker, ERG meetup).
- **Offer**: something a company makes available, with capacity and dates.
- **Match**: an ask paired with an offer or inventory items, with a score and reasons.
- **BOM**: bill of materials, the list of supplies an experiment needs.
- **Coverage report**: each BOM line marked covered, partial, or missing, with the supplying company.
- **Handoff summary**: a year-end summary of an organization's relationships for the next officers.
- **hs_safe**: whether an inventory item may be offered to a high school club.
