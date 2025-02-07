#!/bin/bash

# Set error handling
set -e

echo "UPDATE_START: $(date)"
echo "Current directory: $(pwd)"

# Function to handle errors
handle_error() {
    echo "Error occurred in script at line $1"
    echo "UPDATE_RESULT:{\"waifu\": {\"updated\": false, \"message\": \"Script error at line $1\"}, \"baileys\": {\"updated\": false, \"message\": \"Script error at line $1\"}}"
    exit 1
}

# Set error trap
trap 'handle_error $LINENO' ERR

# Check if directories exist
if [ ! -d "/root/wd/waifu" ]; then
    echo "Error: /root/wd/waifu directory not found"
    handle_error $LINENO
fi

if [ ! -d "/root/baileys/Baileys" ]; then
    echo "Error: /root/baileys/Baileys directory not found"
    handle_error $LINENO
fi

# Update Waifu repository
echo "Changing to waifu directory..."
cd /root/wd/waifu || handle_error $LINENO
echo "Current directory: $(pwd)"
echo "Checking wd/waifu repository... #231"
waifu_output=$(git pull origin master 2>&1) || handle_error $LINENO
echo "wd/waifu pull result: $waifu_output #232"

waifu_updated=false
if [[ $waifu_output != *"Already up to date."* ]]; then
    echo "💙💙💙💙💙💙 Changes detected in wd/waifu - Restarting server... #233"
    pm2 restart server || echo "Warning: Failed to restart server"
    echo "✅✅✅ Server restart completed #234"
    waifu_updated=true
else
    echo "🔴🔴🔴 No changes in wd/waifu #235"
fi

# Update Baileys repository
echo "Changing to baileys directory..."
cd /root/baileys/Baileys || handle_error $LINENO
echo "Current directory: $(pwd)"
echo "Checking baileys/Baileys repository... #236"
baileys_output=$(git pull origin master 2>&1) || handle_error $LINENO
echo "baileys/Baileys pull result: $baileys_output #237"

baileys_updated=false
if [[ $baileys_output != *"Already up to date."* ]]; then
    echo "💚💚💚 Changes detected in baileys/Baileys - Restarting baileys... #238"
    pm2 restart baile || echo "Warning: Failed to restart baile"
    echo "✅✅✅ BAILEYS RESTARTED #239"
    baileys_updated=true
else
    echo "🔴🔴🔴 No changes in baileys/Baileys #240"
fi

# Output JSON-formatted result
echo "UPDATE_RESULT:{\"waifu\": {\"updated\": $waifu_updated, \"message\": \"$waifu_output\"}, \"baileys\": {\"updated\": $baileys_updated, \"message\": \"$baileys_output\"}}"

# Show logs but don't block
pm2 logs --nostream || echo "Warning: Failed to show logs"

echo "UPDATE_END: $(date)"
