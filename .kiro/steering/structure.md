---
inclusion: always
---

# Project structure

```
/
├── .kiro/                  # Kiro specs, steering, hooks (committed, never ignored)
├── PROJECT_BRIEF.md        # Source of truth for scope
├── README.md               # What it is, how to run, demo logins, track
├── docs/
│   └── kiro-log.md         # Running log of how Kiro was used (for the write-up)
├── src/
│   ├── app/                # Next.js routes and pages
│   │   ├── login/          # Demo account picker
│   │   ├── org/[id]/       # Organization page + timeline + handoff summary
│   │   ├── asks/new/       # Ask composer
│   │   ├── supplies/       # Experiment → BOM → coverage → protocol
│   │   ├── company/[id]/   # Liaison dashboard, offers, inventory upload
│   │   ├── advisor/        # Approval queue
│   │   └── api/            # Thin route handlers
│   ├── components/         # Shared UI
│   └── lib/
│       ├── core/           # Pure business logic (matching, safety, units, coverage)
│       ├── ai/             # Provider interface, prompts, schemas, mock responses
│       ├── data/           # Repository interface, in-memory store, seed.json
│       └── schemas/        # zod schemas shared by API, AI, and seed
└── tests/
    ├── unit/
    └── properties/         # fast-check property-based tests, one file per property group
```

## Rules
- Pages never import from `lib/data` directly; they go through API routes or server actions.
- `lib/core` imports only from `lib/schemas`. It never imports from `lib/ai` or `lib/data`.
- Each correctness property in `PROJECT_BRIEF.md` section 9 gets its own named test in `tests/properties/`, with the property number in the test name.
