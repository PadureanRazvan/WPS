# Reports Read Model Design

## Goal

Make Reports call a deeper, tested Report Read Model module instead of carrying report aggregation shape and sorting rules in UI code.

## Design

The Report Read Model sits above Schedule Semantics. Schedule Semantics remains the source for effective Planner Cell values, Primary Team History, inactive dates, Report Role detection, team normalization, and planner-entry parsing. The new module owns report aggregation and presentation-ready structure for Reports: shop buckets, Report Role buckets, totals, sorted agent rows, data presence, and the selected date-range label.

`js/reports.js` remains the browser adapter. It reads planner data, calls the Report Read Model, and renders HTML. It should not know how to route TL/QA, keep 2L in shop data, sort buckets, count agents, or format the date range.

## Scope

- Add `js/report-read-model.js`.
- Move report aggregation out of `js/schedule-semantics.js`.
- Keep `calculatePlannerReportData` exported through `js/config.js` for existing callers and tests.
- Add tests for TL/QA, 2L, Primary Team History, inactive Agents, sorted distributions, and date ranges.
- Do not write to Firestore or touch production data.

## Verification

- Run the new Reports Read Model tests.
- Run the full Node test suite.
- Open no automated Chrome windows unless explicitly requested.
