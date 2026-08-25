# Localize the location-panel eyebrow

Written against: `9f4837b5df6767acb86675825e70a99b5d16ab6c`

## Evidence chain

- Surface: Public map route, `LocationExplorerPanel` rendered from `src/App.tsx`.
- Problem: The panel eyebrow says `Locations` while the adjacent title, filter summary, tabs, statuses, and list actions are Korean.
- Design evidence: The rendered panel mixes the English eyebrow with Korean `군포 지역 정보`, `현재 필터`, and tab labels within the same composition. The owner supplies the string directly as visible text.
- Owner: `src/App.tsx`, `LocationExplorerPanel` eyebrow paragraph.
- Scope and affected surfaces: Public and administrator instances of the shared location panel.
- Uncertainty: None.

## Design decision

Use `위치 정보` as the eyebrow label so the panel uses one consistent Korean language system while retaining its existing uppercase-like compact visual treatment through the current typography classes.

## Reuse

- Existing Korean panel heading and terminology: `군포 지역 정보` in `LocationExplorerPanel`.
- Existing eyebrow classes: `text-xs font-semibold uppercase tracking-wide text-blue-700`.
- Exemplar: `현재 필터` and the two Korean list-scope tabs in the same component.

## Changes

1. `src/App.tsx`
   - Change: Replace the visible eyebrow string `Locations` with `위치 정보`.
   - Preserve: `ListFilter` icon, existing typography/color classes, panel heading, and all panel behaviors.
   - Verify: Both visitor and administrator panels render `위치 정보` above `군포 지역 정보`.

## Scope

- Inherit: All `LocationExplorerPanel` consumers.
- Verify: Public and administrator panel states, including an empty and populated location list.
- Exclude: ARIA label localization, map-control labels, and content-model terminology.

## Validation

- Product: Confirm the panel presents one Korean-language content hierarchy.
- Interface: Confirm no panel spacing, icon alignment, or heading hierarchy changes.
- System: Modify only the existing visible-string owner; no new token or component is required.
- Repository: `npm run build` → TypeScript and Vite build succeed.

## Stop conditions

- Stop if the Korean label does not fit the existing eyebrow line at the minimum supported width; adjust only that line's wrapping/spacing within `LocationExplorerPanel`.

## Design documentation

- After acceptance and validation: none.
