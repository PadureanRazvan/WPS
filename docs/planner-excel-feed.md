# Monthly Planner Live Excel Feed (`plannerFeed`)

Read-only Firebase Cloud Function (Gen 2, `europe-west8`) that serves the live Sherpa Monthly Planner in the exact 12-column CSV schema as the browser's **Export CSV** button (`js/planner-export-command.js`), plus an optional JSON format for Power Automate.

## Endpoint & Parameters

Base URL (after deploying `functions:plannerFeed`):

```text
https://<plannerFeed-cloud-run-url>?month=current
```

| Parameter | Values | Default | Notes |
| :--- | :--- | :--- | :--- |
| `month` | `current`, `prev`, `next`, `YYYY-MM`, or comma-separated list (e.g. `current,next`, max 12) | `current` | Evaluated in `Europe/Bucharest` timezone |
| `from` & `to` | `YYYY-MM-DD` (max 366 days) | — | Alternative to `month`; cannot be combined with `month` |
| `team` | Comma-separated team codes (e.g. `RO` or `RO,IT`) | All teams | Matches `agent.teams`, same as Planner filter |
| `lang` | `ro`, `en`, `it` | `ro` | Controls the `Day` column (`DUM..SÂM`, `SUN..SAT`, `DOM..SAB`) |
| `format` | `csv`, `json` | `csv` | `csv` includes UTF-8 BOM for Romanian diacritics in Excel |
| `fresh` | `1` | `0` | Bypasses the 5-second burst cache |

## Authentication & Security

- Pass the Secret Manager key via HTTP header **`X-Sherpa-Feed-Key: <token>`** (recommended for Excel Power Query) or `Authorization: Bearer <token>`.
- Query-string keys (`?key=...`) are intentionally rejected so the token never appears in URL logs.
- The function runs under dedicated service account `sherpa-planner-feed@wps-sherpa-database.iam.gserviceaccount.com` with **read-only** Firestore access (`roles/datastore.viewer`) and access only to `SHERPA_PLANNER_FEED_TOKEN`.
- Responses set `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

## Connecting Windows Desktop Excel (One-Time Setup)

1. Open Excel → **Data** → **Get Data** → **From Other Sources** → **From Web** (or click **From Web** directly).
2. Switch to **Advanced**.
3. Under **URL parts**, paste:
   `https://<plannerFeed-url>?month=current`
   *(Use `?month=current,next` if the team needs both this month and next month in the same table.)*
4. Under **HTTP request header parameters**:
   - Header: `X-Sherpa-Feed-Key`
   - Value: `<your feed token>`
5. Click **OK**. If Excel asks for credentials, choose **Anonymous** for the endpoint URL and click **Connect**.
6. Verify the preview shows the 12 columns (`Month`, `Date`, `Day`, `Name`, `Username`, `Contract Type`, `Contract Hours`, `Primary Team`, `Shop`, `Planned Hours`, `Schedule`, `Note`) with UTF-8 (`65001: Unicode (UTF-8)`) encoding, then click **Load** (loads to a table, e.g. rename the sheet to `Sherpa_Live`).
7. Set the automatic refresh rate:
   - Click inside the `Sherpa_Live` table → **Query** tab (or **Data → Queries & Connections** → right-click the query) → **Properties**.
   - Check **Refresh every `5` minutes** (or `10`/`15` minutes).
   - Check **Refresh data when opening the file**.
   - Click **OK** and save the workbook.

Any formulas, PivotTables, or other tabs referencing `Sherpa_Live` update automatically whenever Excel refreshes (or immediately on **Data → Refresh All**).

### Optional: Dynamic Month Selector Cell in Excel

If the team wants to type a month like `2026-12` (or `current`) into a named cell `SelectedMonth` on another sheet and refresh:

```powerquery
let
    MonthParam = Text.Trim(Text.From(Excel.CurrentWorkbook(){[Name="SelectedMonth"]}[Content]{0}[Column1])),
    Source = Csv.Document(
        Web.Contents(
            "https://<plannerFeed-url>",
            [
                Query = [month = MonthParam, lang = "ro"],
                Headers = [#"X-Sherpa-Feed-Key" = "<your feed token>"]
            ]
        ),
        [Delimiter = ",", Columns = 12, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars = true])
in
    PromotedHeaders
```

## Connecting Excel Online / SharePoint (Power Automate)

If a workbook is edited purely in browser-based Excel Online, create a scheduled Power Automate flow (e.g., every 15 minutes):

1. **HTTP** action: `GET https://<plannerFeed-url>?month=current&format=json` with header `X-Sherpa-Feed-Key: <token>`.
2. **Excel Online (Business)** actions: replace/update rows in the SharePoint workbook table from `body('HTTP')['rows']`.

## Deploying & Rotating the Key

Deploy only `plannerFeed` (does not touch `generateSherpaChat`, Cloud Run worker, Firestore rules, or GitHub Pages):

```powershell
pwsh ./scripts/deploy-planner-feed.ps1
```

To rotate the token with zero downtime, add a comma-separated value `oldToken,newToken` as a new version of `SHERPA_PLANNER_FEED_TOKEN` in Secret Manager, update the Excel workbook header to `newToken`, then replace the secret with `newToken` alone (or run `pwsh ./scripts/deploy-planner-feed.ps1 -RotateToken` for immediate replacement).
