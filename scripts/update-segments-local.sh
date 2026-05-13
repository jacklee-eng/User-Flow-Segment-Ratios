#!/bin/bash
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/UserFlowSegments"
if [[ "${BASH_SOURCE[0]}" == "$APP_DIR/"* ]]; then
  DEFAULT_PROJECT_DIR="$APP_DIR/repo"
else
  DEFAULT_PROJECT_DIR="/Users/jack.lee/Documents/커서/Product Design/UserFlow_2"
fi

PROJECT_DIR="${USERFLOW_SEGMENTS_PROJECT_DIR:-$DEFAULT_PROJECT_DIR}"
GIT_REMOTE="${USERFLOW_SEGMENTS_GIT_REMOTE:-git@github-jacklee:jacklee-eng/User-Flow-Segment-Ratios.git}"
ENV_FILE="${USERFLOW_SEGMENTS_ENV_FILE:-$HOME/.userflow-segments.env}"
LOG_PREFIX="[userflow-segments]"
STATE_DIR="$APP_DIR"
STATE_FILE="$STATE_DIR/last-success-date"
FORCE=0

if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.nvm/versions/node/v22.21.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$STATE_DIR"

ensure_project_checkout() {
  if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    echo "$LOG_PREFIX creating automation checkout at $PROJECT_DIR"
    mkdir -p "$(dirname "$PROJECT_DIR")"
    git clone "$GIT_REMOTE" "$PROJECT_DIR"
  fi

  cd "$PROJECT_DIR"
  git fetch origin main
  git checkout main
  git pull --ff-only origin main

  mkdir -p .vercel
  cat > .vercel/project.json <<'JSON'
{"projectId":"prj_0hsugNXnPsxOmbRyo6hqYOnWd0Qw","orgId":"team_uASZDYE0vTxehDlbDnmo7Cs0","projectName":"userflow-2-design"}
JSON
}

ensure_project_checkout
cd "$PROJECT_DIR"

TODAY="$(date +%Y-%m-%d)"
WEEKDAY="$(date +%u)"

if [[ "$FORCE" -ne 1 && "$WEEKDAY" != "1" && "$WEEKDAY" != "4" ]]; then
  echo "$LOG_PREFIX skip: today is not Monday or Thursday ($TODAY)"
  exit 0
fi

if [[ "$FORCE" -ne 1 && -f "$STATE_FILE" && "$(cat "$STATE_FILE")" == "$TODAY" ]]; then
  echo "$LOG_PREFIX skip: already updated today ($TODAY)"
  exit 0
fi

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
if ! curl --connect-timeout 15 --max-time 120 -fsSL "$REDASH_ENDPOINT" -o "$REDASH_RESULT"; then
  echo "$LOG_PREFIX skip: Redash is not reachable. Check internal Wi-Fi/VPN." >&2
  exit 0
fi

echo "$LOG_PREFIX transforming response"
node scripts/transform.js "$REDASH_RESULT" data/segments.json

if git diff --quiet -- data/segments.json; then
  echo "$LOG_PREFIX no segment changes"
  echo "$TODAY" > "$STATE_FILE"
  exit 0
fi

git add data/segments.json
git commit -m "chore: update segment ratios $(date +%Y-%m-%d)"
git push

echo "$LOG_PREFIX deploying to Vercel production"
vercel --prod --yes

echo "$TODAY" > "$STATE_FILE"
echo "$LOG_PREFIX done"
