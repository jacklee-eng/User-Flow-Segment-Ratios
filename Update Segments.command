#!/bin/bash
set -euo pipefail

"/Users/jack.lee/Documents/커서/Product Design/UserFlow_2/scripts/update-segments-local.sh" --force

echo
echo "Update complete. You can close this window."
read -r -p "Press Enter to close..."
