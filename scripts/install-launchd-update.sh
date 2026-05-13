#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/jack.lee/Documents/커서/Product Design/UserFlow_2"
APP_DIR="$HOME/Library/Application Support/UserFlowSegments"
PLIST_NAME="com.userflow.update-segments.plist"
SOURCE_PLIST="$PROJECT_DIR/launchd/$PLIST_NAME"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LABEL="com.userflow.update-segments"
GUI_DOMAIN="gui/$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" "$APP_DIR"
cp "$PROJECT_DIR/scripts/update-segments-local.sh" "$APP_DIR/update-segments-local.sh"
chmod +x "$APP_DIR/update-segments-local.sh"
cp "$SOURCE_PLIST" "$TARGET_PLIST"

launchctl bootout "$GUI_DOMAIN" "$TARGET_PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$GUI_DOMAIN" "$TARGET_PLIST"
launchctl enable "$GUI_DOMAIN/$LABEL"

echo "Installed $LABEL"
echo "Automation checkout: $APP_DIR/repo"
echo "Schedule: checks every 30 minutes; updates once on Monday/Thursday when Redash is reachable"
echo "Logs:"
echo "  $HOME/Library/Logs/userflow-segments-update.log"
echo "  $HOME/Library/Logs/userflow-segments-update.err.log"
