#!/bin/bash

# Set error handling
set -e

echo "UPDATE_START: $(date)"
echo "Current directory: $(pwd)"
echo "Home directory: $HOME"

# Detailed directory checks
echo "Checking root directory contents:"
ls -la /root

echo "Checking /root/wd directory:"
ls -la /root/wd || echo "No /root/wd directory found"

echo "Checking /root/wd/waifu directory:"
ls -la /root/wd/waifu || echo "No /root/wd/waifu directory found"

# Function to handle errors
handle_error() {
    echo "Error occurred in script at line $1"
    echo "UPDATE_RESULT:{\"waifu\": {\"updated\": false, \"message\": \"Script error at line $1\"}, \"baileys\": {\"updated\": false, \"message\": \"Script error at line $1\"}}"
    exit 1
}

# Set error trap
trap 'handle_error $LINENO' ERR

# Explicit directory creation if needed
if [ ! -d "/root/wd/waifu" ]; then
    echo "Creating /root/wd/waifu directory"
    mkdir -p /root/wd/waifu
fi

# Rest of the script remains the same... 