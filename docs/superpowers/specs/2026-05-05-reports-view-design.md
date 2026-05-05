# Reports View Design

## Goal

Move Reports HTML construction out of `js/reports.js` and into a deeper, tested Reports View Module that renders the existing Report Read Model without owning Planner data access, date picking, refresh behavior, or Firestore writes.

## Design

`js/reports-view.js` owns the Reports View:

- render missing-range and no-data empty states
- render shop and Report Role hours tables from Report Read Model buckets
- render shop and Report Role distribution cards from sorted agent rows
- preserve the existing CSS classes and inline styles used by the current Reports screen
- format half-hour totals with Schedule Semantics hour formatting
- escape dynamic labels, bucket names, and Agent names before writing HTML

`js/reports.js` remains the browser shell. It owns Litepicker setup, refresh-button loading state, translated label lookup, Planner data access, Report Read Model creation, and cleanup.

## Scope

- Add `js/reports-view.js`.
- Update `js/reports.js` to consume `renderReportsView`.
- Keep `initializeReports` and `cleanupReports` public exports stable.
- Add focused Reports View tests and deepen the Reports shell cleanup guard.
- Do not change report aggregation, Planner data, Firestore schema, production writes, or refresh behavior.

## Verification

- Run Reports View tests.
- Run Reports shell cleanup and Report Read Model regressions.
- Run Planner table/read-model regressions to confirm the final pass did not disturb the adjacent Planner Modules.
- Run the full Node test suite.
- Browser smoke should load production, open Reports, confirm report content renders, and avoid Save/Add/Delete/Undo actions.
