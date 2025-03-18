const { fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function checkAndUpdateBaileys() {
    try {
        console.log('\x1b[33m%s\x1b[0m', 'Checking for Baileys updates...');
        
        // Get current version from package.json
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const currentVersion = packageJson.dependencies['@whiskeysockets/baileys'] || '';
        
        console.log('\x1b[36m%s\x1b[0m', `Current Baileys version: ${currentVersion}`);
        
        // Fetch latest version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        const latestVersion = `${version[0]}.${version[1]}.${version[2]}`;
        
        console.log('\x1b[36m%s\x1b[0m', `Latest Baileys version: ${latestVersion}`);
        
        if (!isLatest) {
            console.log('\x1b[31m%s\x1b[0m', 'Failed to fetch latest version. Using local version information.');
            return;
        }
        
        // Compare versions
        if (currentVersion.includes(latestVersion)) {
            console.log('\x1b[32m%s\x1b[0m', 'You are already using the latest version of Baileys!');
            return;
        }
        
        // Ask for confirmation
        console.log('\x1b[33m%s\x1b[0m', `New version available: ${latestVersion}`);
        console.log('\x1b[33m%s\x1b[0m', 'Installing latest version...');
        
        // Install latest version in root directory
        const installRoot = new Promise((resolve, reject) => {
            exec('npm install @whiskeysockets/baileys@latest', (error, stdout, stderr) => {
                if (error) {
                    console.error('\x1b[31m%s\x1b[0m', `Error updating Baileys in root: ${error.message}`);
                    reject(error);
                    return;
                }
                
                console.log('\x1b[32m%s\x1b[0m', 'Baileys updated successfully in root directory!');
                resolve();
            });
        });
        
        // Also install in src directory
        const srcDir = path.join(process.cwd(), 'src');
        const installSrc = new Promise((resolve, reject) => {
            if (!fs.existsSync(srcDir)) {
                resolve();
                return;
            }
            
            console.log('\x1b[33m%s\x1b[0m', 'Also installing in src directory...');
            exec('cd src && npm install @whiskeysockets/baileys@latest', (error, stdout, stderr) => {
                if (error) {
                    console.error('\x1b[31m%s\x1b[0m', `Error updating Baileys in src: ${error.message}`);
                    reject(error);
                    return;
                }
                
                console.log('\x1b[32m%s\x1b[0m', 'Baileys updated successfully in src directory!');
                resolve();
            });
        });
        
        // Wait for both installations to complete
        await Promise.all([installRoot, installSrc]);
        
        console.log('\x1b[32m%s\x1b[0m', 'Baileys updated successfully!');
        console.log('\x1b[33m%s\x1b[0m', 'Please restart your application to use the new version.');
        
    } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `Error checking for updates: ${error.message}`);
    }
}

// Run the function
checkAndUpdateBaileys();

module.exports = { checkAndUpdateBaileys }; 