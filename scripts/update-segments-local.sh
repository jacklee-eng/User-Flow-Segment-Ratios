#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/jack.lee/Documents/커서/Product Design/UserFlow_2"
ENV_FILE="${USERFLOW_SEGMENTS_ENV_FILE:-$HOME/.userflow-segments.env}"
LOG_PREFIX="[userflow-segments]"

export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.nvm/versions/node/v22.21.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

REDASH_URL="${REDASH_URL:-https://redash-contents.datahou.se}"
REDASH_QUERY_ID="${REDASH_QUERY_ID:-15388}"

if [[ -z "${REDASH_API_KEY:-}" ]]; then
  echo "$LOG_PREFIX REDASH_API_KEY is missing. Add it to $ENV_FILE" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "$LOG_PREFIX node is not available in PATH" >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "$LOG_PREFIX vercel is not available in PATH" >&2
  exit 1
fi

TMP_DIR="$PROJECT_DIR/.tmp"
mkdir -p "$TMP_DIR"

REDASH_RESULT="$TMP_DIR/redash_result.json"
REDASH_ENDPOINT="${REDASH_URL%/}/api/queries/$REDASH_QUERY_ID/results.json?api_key=$REDASH_API_KEY"

echo "$LOG_PREFIX fetching Redash query $REDASH_QUERY_ID"
curl --connect-timeout 15 --max-time 120 -fsSL "$REDASH_ENDPOINT" -o "$REDASH_RESULT"

echo "$LOG_PREFIX transforming response"
node scripts/transform.js "$REDASH_RESULT" data/segments.json

if git diff --quiet -- data/segments.json; then
  echo "$LOG_PREFIX no segment changes"
  exit 0
fi

git add data/segments.json
git commit -m "chore: update segment ratios $(date +%Y-%m-%d)"
git push

echo "$LOG_PREFIX deploying to Vercel production"
vercel --prod --yes

echo "$LOG_PREFIX done"
