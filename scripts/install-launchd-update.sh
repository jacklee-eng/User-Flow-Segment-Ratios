#!/bin/bash
set -euo pipefail

PROJECT_DIR="/Users/jack.lee/Documents/커서/Product Design/UserFlow_2"
PLIST_NAME="com.userflow.update-segments.plist"
SOURCE_PLIST="$PROJECT_DIR/launchd/$PLIST_NAME"
TARGET_PLIST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LABEL="com.userflow.update-segments"
GUI_DOMAIN="gui/$(id -u)"

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$SOURCE_PLIST" "$TARGET_PLIST"

launchctl bootout "$GUI_DOMAIN" "$TARGET_PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$GUI_DOMAIN" "$TARGET_PLIST"
launchctl enable "$GUI_DOMAIN/$LABEL"

echo "Installed $LABEL"
echo "Schedule: Monday and Thursday at 06:00 local time"
echo "Logs:"
echo "  $HOME/Library/Logs/userflow-segments-update.log"
echo "  $HOME/Library/Logs/userflow-segments-update.err.log"
