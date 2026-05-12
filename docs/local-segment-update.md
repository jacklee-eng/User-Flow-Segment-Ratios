# Local Segment Update

This is the current reliable update path because Redash is reachable from the user's internal network, but not from GitHub Actions, Google Apps Script, or Vercel.

## What Runs

`scripts/update-segments-local.sh` does the full update:

1. Fetch Redash query `15388`.
2. Convert the result with `scripts/transform.js`.
3. Write `data/segments.json`.
4. Commit and push the changed JSON.
5. Deploy to Vercel production.

The site reads `data/segments.json` first, so the deployed JSON is the source of truth.

## Secret Setup

Create a local env file that is not committed:

```bash
cat > "$HOME/.userflow-segments.env" <<'EOF'
REDASH_URL=https://redash-contents.datahou.se
REDASH_QUERY_ID=15388
REDASH_API_KEY=your_redash_query_api_key
EOF
chmod 600 "$HOME/.userflow-segments.env"
```

Do not put the API key in this repository.

## Manual Run

Double-click:

```text
Update Segments.command
```

Or run:

```bash
scripts/update-segments-local.sh
```

## Scheduled Run

Install the launchd job:

```bash
scripts/install-launchd-update.sh
```

Schedule:

- Monday 06:00
- Thursday 06:00

Requirements:

- The Mac is awake and logged in.
- The Mac is on the internal Wi-Fi/VPN that can reach Redash.
- GitHub SSH auth and Vercel CLI auth are still valid.

Logs:

```text
~/Library/Logs/userflow-segments-update.log
~/Library/Logs/userflow-segments-update.err.log
```
