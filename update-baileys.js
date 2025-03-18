#!/usr/bin/env node

const { checkAndUpdateBaileys } = require('./src/checkForUpdates');

// Run the update check
checkAndUpdateBaileys(); 