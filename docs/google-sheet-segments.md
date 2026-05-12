# Google Sheet Segment Automation

This setup uses a Google Sheet + Apps Script endpoint as the live source for segment ratios.

## Flow

1. Segment data is written into Google Sheets.
2. Apps Script serves the Sheet rows as JSON.
3. The site fetches the Apps Script Web App JSON URL.
4. If that fails, the site falls back to `data/segments.json`.

## Sheet Tabs

Current Sheet:

- URL: `https://docs.google.com/spreadsheets/d/1a9IB9MfZjFhXTNm1oyEckvuDGFEVYSris2ig81DTC0c/edit`
- Sheet name: `segments`

The frontend supports both response formats:

- `data/segments.json` shape: `{ "updated_at": "...", "ratios": { ... } }`
- Redash row array shape: `[{ "date": "2026-05-12", "segment": "M1_Purpose_Buy", "user_cnt": 507907, "pct": 36.61, "ratio": 36.59 }]`

## Script Properties

Set these in Apps Script project settings if Redash API fetching is used:

- `REDASH_URL`: Redash base URL
- `REDASH_QUERY_ID`: Redash query ID
- `REDASH_API_KEY`: Redash API key
- `SEGMENTS_SPREADSHEET_ID`: optional when the script is not bound to the target Sheet

Do not commit the API key into this repository.

## Current Limitation

`redash-contents.datahou.se` currently returns an error from Google Apps Script / Google server IPs, while browser access from a user machine can work. Because of that, Redash-to-Sheet updates are currently manual or browser-assisted.

Do not commit Redash API keys into this repository.

## Apps Script Setup

1. Create or open the target Google Sheet.
2. Open `Extensions` > `Apps Script`.
3. Copy `google-apps-script/Code.gs` into `Code.gs`.
4. Copy `google-apps-script/appsscript.json` into the Apps Script manifest.
5. Add the script properties above.
6. Run `updateSegmentsFromRedash` once and approve permissions.
7. Run `installMondayThursdayTriggers` once.
8. Deploy as Web App:
   - Execute as: Me
   - Who has access: Anyone
9. Copy the Web App URL into `data/segments-source.json`:

```json
{
  "google_sheet_web_app_url": "https://script.google.com/macros/s/.../exec"
}
```

After this, push the change and redeploy the site.
