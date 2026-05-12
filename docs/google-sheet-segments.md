# Google Sheet Segment Automation

This setup replaces the scheduled GitHub Actions Redash fetch with a Google Sheet + Apps Script endpoint.

## Flow

1. Apps Script runs every Monday and Thursday at 06:00 KST.
2. Apps Script calls the Redash query result API.
3. Apps Script transforms the rows into the same shape as `data/segments.json`.
4. Apps Script writes the values into Google Sheet tabs.
5. The site fetches the Apps Script Web App JSON URL. If that fails, it falls back to `data/segments.json`.

## Sheet Tabs

Apps Script manages these tabs automatically:

- `segments`: `key`, `pct`, `count`, `note`
- `meta`: `updated_at`, `period_start`, `period_end`, `total_users`

## Script Properties

Set these in Apps Script project settings:

- `REDASH_URL`: Redash base URL
- `REDASH_QUERY_ID`: Redash query ID
- `REDASH_API_KEY`: Redash API key
- `SEGMENTS_SPREADSHEET_ID`: optional when the script is not bound to the target Sheet

Do not commit the API key into this repository.

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
