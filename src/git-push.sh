#!/bin/bash

# Get current time in HH:MM format
current_time=$(date +"%H:%M")

# Add all changes
git add .

# Commit with current time as message
git commit -m "$current_time"

# Push to master branch
git push origin master

# Print confirmation
echo "Changes pushed to master branch with commit message: $current_time" 