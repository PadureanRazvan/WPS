# Bug Backlog

## [High] Productivity misreads 2L schedules as worked hours

### Summary
Productivity is incorrectly interpreting `2L` planner schedule values as part of the numeric hour total instead of treating `2L` as the assigned team. This is the main bug to track from the tester note. Background context from the same feedback is that `TL` / `QA` / `2nd Level` users are often adjusted manually in Planner because the Users page does not handle them well, but that context should not be treated as a separate new bug entry here.

### Symptoms
- Productivity can show impossible worked-hour values for a single person, such as `82h`.
- A planner value like `82L` appears to be read as `82 hours` instead of `8 hours on team 2L`.
- The bad parse corrupts individual `Hours Worked`, team totals, and the final productivity score.
- Tester screenshots suggest this exact `2L` parsing failure is already happening in production-like usage.

### Expected behavior
- `82L` should be interpreted as `8` worked hours assigned to team `2L`.
- Productivity calculations should preserve the team designation and only count the actual worked-hour portion.
- Team totals and final productivity scores should match the normalized planner schedule data.

### Likely root cause
- Some schedule parsing logic appears to still rely on regex or ad-hoc string handling instead of the shared planner schedule parser.
- Productivity is the highest-risk area to audit first, but any code path that reads planner schedule values may be affected.

### Repro steps
1. Open Planner and assign or confirm a schedule value that includes team `2L`, for example `82L`.
2. Open Productivity for the same user and period.
3. Observe that the user can be reported with an inflated worked-hour value such as `82h`.
4. Compare the displayed hours, team totals, and productivity score with the expected interpretation of `8 hours on 2L`.

### Suggested fix direction
- Audit every place that parses planner schedule values for `2L`, especially in Productivity.
- Replace any regex or ad-hoc parsing with the shared planner schedule parsing utilities.
- Add regression coverage for mixed numeric/team schedule values such as `82L` so hours and team assignment are both preserved correctly.

## [Low] Opening the Primary Team dropdown can trigger a false `User updated.` save toast

### Summary
On the Users page, simply opening or interacting with the `Primary Team` dropdown can show the green `User updated.` toast even when no intentional change was made. This should be tracked as a UX / no-op save bug.

### Symptoms
- Opening the `Primary Team` dropdown can trigger a success toast without a meaningful edit.
- Interacting with the field and leaving it unchanged may still display `User updated.`.
- The current behavior may also cause unnecessary Firestore writes.

### Expected behavior
- The app should only persist changes and show `User updated.` when the selected value is actually different from the stored value.
- Opening, focusing, blurring, or re-selecting the same value should be treated as a no-op.

### Likely root cause
- The Users page appears to save on blur and/or change without first checking whether the value actually changed.

### Repro steps
1. Open the Users page.
2. Open the `Primary Team` dropdown for an existing user.
3. Close the dropdown or interact with it without choosing a different team.
4. Observe that the green `User updated.` toast can appear even though no intentional edit was made.

### Suggested fix direction
- Compare the new dropdown value with the existing stored value before persisting.
- Suppress success toasts and writes for no-op interactions.
- Confirm the Users page only performs Firestore updates for real field changes.
