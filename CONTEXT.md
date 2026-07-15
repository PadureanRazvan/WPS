# WPS Context

## Domain Terms

**Agent** — a WPS user whose contract, primary team, activity status, planner days, and productivity data are tracked.

**Agent Lifecycle** — the rules for an Agent's contract start, active/inactive state, primary team history, Report Role state, and date-effective eligibility across Planner, Reports, and Productivity.

**App Shell Wiring** — the rules for binding Sherpa app boot, authenticated shell visibility, navigation, theme and language controls, logout, before-unload cleanup, and cross-module refresh events while keeping feature Modules responsible for their own business rules and Firestore writes.

**Accessible App Navigation** — the semantic button controls, current-page state, keyboard activation, named icon actions, and responsive operational toolbars that keep every Sherpa Module reachable across pointer, keyboard, mobile, and assistive-technology use.

**Interface Theme System** — the named Sherpa palettes, System color preference, live chart colors, browser theme color, native disclosure popovers, container-driven reflow, progressive view transitions, and accessibility fallbacks that keep every operational Module visually consistent without changing its domain behavior.

**Runtime Deploy Hardening** — the rules for proving a deployed Sherpa build is the intended version, reusing one external Chrome session for read-only production smoke checks, confirming GitHub Pages serves new Modules, and rolling back production without touching Firestore data.

**Users Command** — the rules for turning Users form input, inline Agent edits, contract changes, primary team changes, deactivation, and reactivation into validated Agent update payloads, activity metadata, and user-facing diagnostics while keeping the Users shell responsible for DOM modals and Firestore writes.

**Planner Cell** — one agent/day value in the Planner. A cell can be empty, a leave code such as `Co` or `DZ`, or one or more schedule entries such as `8RO` or `4RO+42L`.

**Schedule Entry** — the smallest working-time expression inside a Planner Cell. It combines hours with an optional team code. `82L` means 8 hours for `2L`, not 82 hours.

**Schedule Semantics** — the rules for interpreting Planner Cells: leave codes, half-hour validation, team normalization, primary-team history, inactive periods, report roles, and effective day values.

**Primary Team History** — dated changes to an Agent's primary team. WPS uses this history to decide which team applies on a specific date.

**Report Role** — a non-shop role, currently `TL` or `QA`, whose planned hours are reported separately from shop teams.

**Report Read Model** — the rules for turning Agents, Schedule Semantics, and a selected date range into report-ready shop and Report Role buckets, sorted agent distributions, totals, and range labels.

**Reports View** — the rules for turning a Report Read Model and translated labels into Reports table and distribution-card HTML, including empty states, range titles, hours formatting, and escaped display text.

**Planner Read Model** — the rules for turning Agents, Schedule Semantics, Planner filters, date ranges, and view options into table-ready Planner rows, Planner Cells, headers, totals, notes, and display classes.

**Planner Edit Command** — the rules for turning selected Planner Cells, a new Planner Cell value, and an optional note into Firestore update payloads, undo snapshots, missing-Agent diagnostics, and edit activity metadata.

**Planner Persistence Command** — the rules for turning legacy Planner data, undo snapshots, and clear-month actions into Firestore update payloads and activity metadata while keeping the browser shell responsible for actual writes.

**Planner Selection State** — the rules for turning Planner Cell click, drag, stop, and clear actions into selected Planner Cell keys, selection counts, and selection drag state.

**Planner View State** — the rules for turning Planner month, team, Agent, date-range, search, and view-option controls into the current Planner filter and render state.

**Planner Table View** — the rules for turning a Planner Read Model and translated labels into rendered Planner table HTML, including headers, Agent rows, Planner Cells, week totals, delete-month buttons, note titles, and table display classes.

**Planner Interaction Wiring** — the rules for binding rendered Planner table controls and Planner edit controls to selection, scoped right-click clearing, delete-month delegation, edit-modal opening, modal actions, undo shortcuts, and keyboard clear/open behavior without owning Firestore writes or Planner Cell business rules.

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
