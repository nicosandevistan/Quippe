---
inclusion: fileMatch
fileMatchPattern: "src/app/**,src/components/**"
---
# Visual design system

The source of truth for spacing, copy, and layout is the static mockups in
`docs/design/*.html` (`landing.html`, `company-dashboard.html`, `supplies.html`,
`club.html`), each with a matching `.png`. When in doubt, open the HTML and copy
its values. This file is the short version so pages stay consistent.

## Type
- Font: Schibsted Grotesk, loaded via `next/font/google` in `src/app/layout.tsx`
  (weights 400, 500, 600, 700, 800; `latin`; `display: swap`). The CSS variable
  is `--font-schibsted`, wired to Tailwind as `font-sans`, so default text is
  already correct; reach for `font-sans` only to override something.
- App body text is 15px / line-height 1.5; the landing page runs larger (16px,
  line-height 1.55). Page titles are ~26px, 700, letter-spacing -0.015em.

## Colors (Tailwind tokens -> hex)
Use the token, not the hex, so a later change is one edit.
- `ink` `#1B1E24` — primary text.
- `muted` `#5C6370` — secondary text, table headers, captions.
- `line` `#E3E6EB` — borders on panels, tables, and the sidebar edge.
- `bench` `#F5F6F8` — app background and subtle hover fills.
- `pen` `#2142C6`, `pen-hover` `#1A35A0` — links and primary buttons.
- `done` `#1E7A4C` — success / accepted status.
- `needed` `#8F5200` on `needed-bg` `#FFF5E1` — "still needed" / under-resourced
  badges. Warm color only, never red.
- Secondary body text on the landing page and inside tables is `#3D434E`
  (available as the `graphite` token).

## Radius (Tailwind tokens)
- `rounded-control` 6px — buttons, inputs, nav links, segmented controls, badges.
- `rounded-panel` 8px — cards, tables, the account box, any boxed region.

## Rules
- Sentence case everywhere. No ALL-CAPS labels.
- No `·` (middle dot) separators. Use real layout: columns, spacing, or line
  breaks. Breadcrumbs use `/`.
- No shadows for elevation. Separate regions with the `line` border and the
  `bench` background. (An inset ring on the active nav item is fine; see below.)
- Lists of records are HTML `<table>`s with a muted, 500-weight header row and
  `line` row dividers — not stacks of cards.
- Color carries status only (`done`, `needed`, `pen` for fit). Everything else
  is `ink` / `muted` text on white or `bench`.
- Keep accessibility that is already there: the skip link, the labeled nav
  landmark, `<main id="main">`, and visible `:focus-visible` rings (2px `pen`,
  2px offset).

## Shell layout (company-dashboard.html, shared by supplies.html + club.html)
- Sidebar is `flex: 1 1 232px` (≈232px wide, token-free since it is a flex
  basis), content is `flex: 999 1 640px`; the whole shell is `flex-wrap`, so on
  narrow screens the sidebar stacks on top. Sidebar has a right `line` border.
- Top to bottom: wordmark "Quippe" (800, 20px), an account box (initials badge +
  org/company name + role label), the role nav, then "Switch demo account"
  pinned to the bottom (`margin-top: auto`).
- Initials badge: company = square-ish (6px radius) dark `ink` badge; club =
  round (`rounded-full`) `pen` badge. Active nav link gets `aria-current="page"`
  and a white fill with an inset `line` ring.
