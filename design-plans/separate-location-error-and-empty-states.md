# Separate location-load errors from empty results

Written against: `9f4837b5df6767acb86675825e70a99b5d16ab6c`

## Evidence chain

- Surface: Public map route, `LocationExplorerPanel` in `src/App.tsx`.
- Problem: The deployed panel simultaneously renders the red `위치 정보를 불러오지 못했습니다.` status and the normal empty-result message `표시할 위치 정보가 없습니다.`.
- Design evidence: `locationsErrorMessage` is rendered in the panel header independently, while the list body renders the empty message whenever `isLoading` is false and `locations.length === 0`. The same runtime state therefore produces conflicting user-facing explanations.
- Owner: `src/App.tsx`, `LocationExplorerPanel` status block and list-body conditional.
- Scope and affected surfaces: Visitor and administrator location panels when the location query fails.
- Uncertainty: None.

## Design decision

Give the error state priority over the normal empty state. When `locationsErrorMessage` is non-null, show the existing error status and suppress `표시할 위치 정보가 없습니다.`. Retain the normal empty message only after a successful completed query with zero matching locations.

## Reuse

- Existing error UI: `StatusMessage` with `tone="danger"` in `LocationExplorerPanel`.
- Existing loading and empty-state ownership: the list-body conditional in `LocationExplorerPanel`.
- Exemplar: The existing `isLoading` branch, which already gives one state exclusive body presentation.

## Changes

1. `src/App.tsx`
   - Change: Update the location-list conditional so `locationsErrorMessage !== null` prevents the normal empty-result branch from rendering; retain `isLoading` precedence while loading.
   - Preserve: Existing red error styling and wording, normal empty-state wording for successful zero-result filters, and the current tab/filter controls.
   - Verify: A failed location fetch shows only the error explanation; a successful query with no locations shows only `표시할 위치 정보가 없습니다.`.

## Scope

- Inherit: Visitor and administrator instances of `LocationExplorerPanel`.
- Verify: Loading, failed query, successful empty query, and successful populated query states.
- Exclude: The underlying Supabase request failure, retry behavior, and data-loading architecture.

## Validation

- Product: Trigger or simulate each panel data state and confirm the explanatory text matches the state.
- Interface: Confirm the error remains visually prominent and no duplicate blank-state language remains beneath it.
- System: Reuse the existing error and empty-state owners; do not add a parallel alert component.
- Repository: `npm run build` → TypeScript and Vite build succeed.

## Stop conditions

- Stop if `locationsErrorMessage` can coexist with valid retained locations by design; in that case, preserve the visible list and restrict the suppression to the zero-location error case.

## Design documentation

- After acceptance and validation: none.
