# WPS Context

## Domain Terms

**Agent** — a WPS user whose contract, primary team, activity status, planner days, and productivity data are tracked.

**Planner Cell** — one agent/day value in the Planner. A cell can be empty, a leave code such as `Co` or `DZ`, or one or more schedule entries such as `8RO` or `4RO+42L`.

**Schedule Entry** — the smallest working-time expression inside a Planner Cell. It combines hours with an optional team code. `82L` means 8 hours for `2L`, not 82 hours.

**Schedule Semantics** — the rules for interpreting Planner Cells: leave codes, half-hour validation, team normalization, primary-team history, inactive periods, report roles, and effective day values.

**Primary Team History** — dated changes to an Agent's primary team. WPS uses this history to decide which team applies on a specific date.

**Report Role** — a non-shop role, currently `TL` or `QA`, whose planned hours are reported separately from shop teams.

**Productivity Data** — uploaded ticket and call counts grouped by date, agent, and team.

**Productivity Calculation** — the rules for turning Productivity Data, Agents, Schedule Semantics, date ranges, and team filters into productivity rows such as tickets, calls, worked hours, teams, and items-per-hour.

**Productivity Upload Parsing** — the rules for turning uploaded ticket XLSX and call CSV files into normalized Productivity Data, including language-to-team mapping, queue-to-team mapping, skipped zero-ticket rows, and answered-call filtering.

**Productivity Persistence** — the rules for serializing Productivity Data to Firestore, hydrating date snapshots back into maps, and routing save/delete/load/subscribe operations through a Firestore adapter.

**Productivity Dashboard Metrics** — the rules for turning Productivity Data, Agents, Schedule Semantics, and date selections into dashboard summaries such as seven-day average productivity and monthly team trend series.

**Productivity View** — the rules for turning calculated Productivity rows into overview and per-agent detail HTML, including summary cards, team tooltips, productivity colors, and repeated-date display.

**Productivity Upload Calendar View** — the rules for turning per-date Productivity Data into upload-calendar HTML, upload status messages, locale labels, file markers, and enabled or disabled upload-calendar actions.

**Productivity Upload Calendar Actions** — the rules for binding upload-calendar date selection, month navigation, file upload triggers, export, and delete actions to the current Productivity upload date.

**Productivity Agent Selection View** — the rules for turning eligible Agents into searchable, selectable detail-view chips, including selected counts, primary-team labels, and selection state changes.

**Productivity Agent Actions** — the rules for changing selected Productivity Agents from chip clicks, select-all, and deselect-all controls, then refreshing agent chips and the current Productivity view.

**Productivity Date Commands** — the rules for exporting a selected Productivity date, downloading its CSV, deleting a date snapshot, refreshing Productivity views, and showing command success or error messages.

**Productivity Detail Rows** — the rules for turning Productivity Data, selected Agents, Schedule Semantics, date ranges, and team filters into per-agent per-day detail rows.

**Productivity Date Range Picker** — the rules for binding the Productivity date-range picker, initializing the visible date range, and refreshing the current Productivity view when the selected range changes.

**Productivity Upload Area** — the rules for binding upload-area click, drag, drop, and file-input change interactions to Productivity file handling, including drag styling and file handoff.

**Productivity Upload Flow** — the rules for processing a selected Productivity upload file: requiring an upload date, detecting same-type overwrites, running the file parser, saving the date snapshot, showing success or error state, and refreshing upload views.

**Productivity Controls** — the rules for binding Productivity view toggles, agent search and selection controls, team filter changes, and refresh button state to the current Productivity view.
