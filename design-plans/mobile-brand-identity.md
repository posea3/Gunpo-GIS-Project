# Preserve the Gunpo-Itda identity on mobile

Written against: `9f4837b5df6767acb86675825e70a99b5d16ab6c`

## Evidence chain

- Surface: Public map route rendered from `src/App.tsx`.
- Problem: At a 390 px mobile viewport, the header presents only the logo, visitor badge, and login button; the visible `군포잇다` product name disappears.
- Design evidence: The desktop header presents `군포잇다` with the supporting phrase `생활정보 한눈에 - 군포시 지역지도`. The same runtime owner hides the complete text block below the `sm` breakpoint with `hidden sm:block`.
- Owner: `src/App.tsx`, the header brand block immediately after the `logo.png` image.
- Scope and affected surfaces: Public and administrator headers at mobile widths; desktop header composition remains the exemplar.
- Uncertainty: None.

## Design decision

Keep the primary product name visible beside the logo at every supported width. Hide only the long supporting phrase below the `sm` breakpoint so the login controls continue to fit without wrapping.

## Reuse

- Existing header logo and typography: `src/App.tsx`.
- Existing responsive breakpoint convention: Tailwind `sm:` classes in the same header.
- Exemplar: The current desktop brand composition in `src/App.tsx`.

## Changes

1. `src/App.tsx`
   - Change: Replace the single `hidden sm:block` brand wrapper with a primary-name element that remains visible on mobile and a separate supporting-copy element that uses `hidden sm:block`.
   - Preserve: The current logo dimensions, `군포잇다` wording, supporting-copy wording, right-aligned visitor/login controls, and desktop typography.
   - Verify: At 390 px, the header shows the logo and `군포잇다` without horizontal overflow; at desktop width, both name and supporting phrase appear exactly as today.

## Scope

- Inherit: Anonymous, authenticated, and administrator header states.
- Verify: Mobile width 390 px and a desktop width of at least 1280 px; login and logout button states.
- Exclude: Address-search availability and authentication behavior.

## Validation

- Product: Open the public map page at mobile and desktop widths and confirm the service identity is present in both.
- Interface: Confirm the supporting phrase is absent only below `sm`, controls remain in one header row, and no header text overlaps the logo or buttons.
- System: Reuse the current header owner and existing Tailwind responsive utilities; do not introduce a new branding primitive.
- Repository: `npm run build` → TypeScript and Vite build succeed.

## Stop conditions

- Stop if retaining the product name beside the current logo causes login controls to wrap at the 320 px minimum body width; resolve within the existing header composition before widening scope.

## Design documentation

- After acceptance and validation: none.
