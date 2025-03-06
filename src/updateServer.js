const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function handleUpdateServer(req, res, next) {
    // Variables at the top
    const scriptPath = path.join(process.cwd(), 'updateserverfiles.sh');
    
    console.log(`handleUpdateServer #543: Starting server update process`);
    console.log(`handleUpdateServer #544: Current directory: ${process.cwd()}`);
    console.log(`handleUpdateServer #545: Script path: ${scriptPath}`);
    console.log(`handleUpdateServer #546: Script exists: ${fs.existsSync(scriptPath)}`);
    
    // Check if script exists
    if (!fs.existsSync(scriptPath)) {
        console.error(`handleUpdateServer #547: Update script not found at ${scriptPath}`);
        console.error(`handleUpdateServer #548: Listing directory contents:`);
        console.error(fs.readdirSync(path.dirname(scriptPath)));
        
        return res.status(500).json({
            success: false,
            message: 'Update script not found',
            type: 'error',
            path: scriptPath,
            cwd: process.cwd(),
            dirContents: fs.readdirSync(path.dirname(scriptPath))
        });
    }

    // Make script executable
    try {
        fs.chmodSync(scriptPath, '755');
        console.log(`handleUpdateServer #549: Made script executable`);
    } catch (error) {
        console.error(`handleUpdateServer #550: Failed to make script executable: ${error}`);
    }

    // Execute update script with timeout and working directory set
    const updateProcess = exec(`bash ${scriptPath}`, {
        timeout: 300000, // 5 minute timeout
        cwd: process.cwd(), // Set working directory explicitly
        shell: '/bin/bash' // Explicitly use bash
    }, (error, stdout, stderr) => {
        console.log(`handleUpdateServer #551: Stdout: ${stdout}`);
        console.error(`handleUpdateServer #552: Stderr: ${stderr}`);
        
        if (error) {
            console.error(`handleUpdateServer #553: Script execution error: ${error}`);
            return res.status(500).json({
                success: false,
                message: 'Update script failed',
                error: error.message,
                stderr: stderr,
                type: 'error'
            });
        }

        try {
            // Parse update results
            const resultMatch = stdout.match(/UPDATE_RESULT:({.*})/);
            if (!resultMatch) {
                throw new Error('Could not parse update results');
            }

            const updateResult = JSON.parse(resultMatch[1]);
            
            // Format response message
            let message = '';
            let type = 'info';

            if (updateResult.waifu.updated || updateResult.baileys.updated) {
                message = 'Updates installed:\n';
                type = 'success';
                if (updateResult.waifu.updated) {
                    message += `- Waifu: ${updateResult.waifu.message}\n`;
                }
                if (updateResult.baileys.updated) {
                    message += `- Baileys: ${updateResult.baileys.message}`;
                }
            } else {
                message = 'All repositories are up to date';
                type = 'info';
            }

            console.log(`handleUpdateServer #548: Update completed successfully`);
            
            res.json({
                success: true,
                message,
                type,
                details: updateResult
            });

        } catch (parseError) {
            console.error(`handleUpdateServer #549: Failed to parse update results: ${parseError}`);
            res.status(500).json({
                success: false,
                message: 'Update completed but results parsing failed',
                error: parseError.message,
                type: 'warning',
                output: stdout
            });
        }
    });

    // Handle process errors
    updateProcess.on('error', (error) => {
        console.error(`handleUpdateServer #550: Process error: ${error}`);
    });

    next();
}

module.exports = handleUpdateServer; 